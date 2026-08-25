'use client';
import { create } from 'zustand';
import { db, persistenceState, requestPersistence, type PersistenceState } from './db';
import { FREE, parseEntitlement, type Entitlement } from './entitlement/entitlement';
import { verifyLicense } from './entitlement/license';
import { LICENSE_PUBLIC_KEY, LICENSE_KEY_IS_PLACEHOLDER } from './entitlement/licensePublicKey';
import { deriveKey, encryptJson, decryptJson, randomBytes, bufToB64, b64ToBuf, type Encrypted } from './crypto';
import { BackupError } from './backupError';
import { decodeBackup, encodeBackup } from './backupFormat';
import {
  clearVault, listRecords, listRecordIds, getRecord, putRecord, deleteRecord, applyMutations,
  type Mutation, type ReadFailure,
} from './repo';
import { D, ZERO } from './money';
import {
  STORE, PROFILE_SCOPED, isSpending,
  type Budget, type Category, type Goal, type Holding, type Liability,
  type RecurringRule, type Txn, type Profile, type ProfileKind, type Insurance, type NetWorthSnapshot,
  type ImportBatch, type HoldingLot,
  type Account, type Posting, type Transfer, type PendingCapture,
  type WatchItem, type Dividend, type Alert, type FxRate,
} from './types';
import { materialize } from '@/domain/recurrence';
import { postingsForEntry, postingsForTransfer, accountBalances, liquidBalance } from '@/domain/accountLedger';
import Decimal from 'decimal.js';
import { healthScore } from '@/domain/health';
import { investmentTotals } from '@/domain/investmentTotals';
import { runDiagnostics, restoreBlockers } from '@/domain/diagnostics';

const VAULT_ID = 'default';

/** Stamped into every backup header so a file can name the build that wrote it. */
const APP_VERSION = '1.0.0';
const VERIFIER = 'FTOS-OK';

// Bump when the persisted data shape changes; add a step in runMigrations().
const SCHEMA_VERSION = 3;

async function runMigrations(from: number, key: CryptoKey, vaultId: string): Promise<void> {
  let v = from;
  if (v < 2) {
    await repairPostings(key, vaultId);
    v = 2;
  }
  if (v < 3) {
    await reclassifyInvestments(key, vaultId);
    v = 3;
  }
  void v;
}

/**
 * Moves already-recorded investment purchases out of consumer spending (§3.2).
 *
 * Before there was an `investment` transaction kind, the only way to record a
 * SIP or a stock purchase was as an expense against the built-in "Investment"
 * category. Those rows are real and correct in every respect except their
 * classification, so they are re-typed rather than asked about: leaving them as
 * expenses keeps every budget and savings rate wrong, and deleting them would
 * destroy the user's history.
 *
 * Matched on the category *name*, because category ids are per-vault. Renaming
 * a category to something else means it is left alone, which is the safe
 * direction — a false negative leaves the old behaviour, a false positive would
 * silently reclassify genuine spending.
 */
async function reclassifyInvestments(key: CryptoKey, vaultId: string): Promise<void> {
  const [txns, categories, accounts, profiles] = await Promise.all([
    listRecords<Txn>(key, STORE.txn, vaultId),
    listRecords<Category>(key, STORE.category, vaultId),
    listRecords<Account>(key, STORE.account, vaultId),
    listRecords<Profile>(key, STORE.profile, vaultId),
  ]);

  const investmentCategoryIds = new Set(
    categories.filter((c) => c.name.trim().toLowerCase() === 'investment').map((c) => c.id),
  );
  const moving = txns.filter((t) => t.type === 'expense' && investmentCategoryIds.has(t.categoryId));
  if (moving.length === 0) return;

  const fallbackProfile = profiles[0]?.id ?? 'default';
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const existing = new Set(accounts.map((a) => a.id));

  for (const t of moving) {
    const next: Txn = { ...t, type: 'investment' };
    const profileId = t.profileId ?? fallbackProfile;
    // Record and postings together: the old legs debited an expense account and
    // must be replaced, not added to. Posting ids are deterministic, so writing
    // the new pair overwrites the old rather than leaving both in the ledger.
    await applyMutations(key, vaultId, [
      { op: 'put', type: STORE.txn, id: t.id, value: next },
      ...entryPostingMutations(vaultId, profileId, next, names, existing),
    ]);
  }
}

/**
 * Gives every transaction the balanced postings it should always have had.
 *
 * Three write paths used to skip the ledger entirely — `processRecurring` and
 * the sample-data loader both called `putRecord` directly, and
 * `backfillDoubleEntry` only fires for a profile with no accounts, so it could
 * never repair one. The result was a chart of accounts with no postings behind
 * it, which is invisible until per-account balances are shown and then reads
 * as "your bank is empty".
 *
 * Idempotent: entries that already have postings are left alone.
 */
export async function repairPostings(key: CryptoKey, vaultId: string): Promise<void> {
  const [txns, transfers, postings, categories, profiles, accounts] = await Promise.all([
    listRecords<Txn>(key, STORE.txn, vaultId),
    listRecords<Transfer>(key, STORE.transfer, vaultId),
    listRecords<Posting>(key, STORE.posting, vaultId),
    listRecords<Category>(key, STORE.category, vaultId),
    listRecords<Profile>(key, STORE.profile, vaultId),
    listRecords<Account>(key, STORE.account, vaultId),
  ]);
  const covered = new Set(postings.map((p) => p.entryId));
  const orphanTxns = txns.filter((t) => !covered.has(t.id));
  const orphanTransfers = transfers.filter((t) => !covered.has(t.id));
  if (orphanTxns.length === 0 && orphanTransfers.length === 0) return;

  const fallbackProfile = profiles[0]?.id ?? 'default';
  const byName = new Map(categories.map((c) => [c.id, c.name]));
  const existing = new Set(accounts.map((a) => a.id));
  for (const t of orphanTxns) {
    await writeEntryPostings(key, vaultId, t.profileId ?? fallbackProfile, t, byName, existing);
  }
  for (const t of orphanTransfers) {
    await writeTransferPostings(key, vaultId, t.profileId ?? fallbackProfile, t);
  }
}

/**
 * Removes a record of the *other* entry kind that already holds this id.
 *
 * The add screen reuses one `editId` across its mode selector, so editing a
 * transaction and switching it to a transfer wrote a `Transfer` under the
 * transaction's id while the original `Txn` stayed in the vault. Two records
 * then shared one id and both claimed the same `<id>:dr` / `:cr` legs — the
 * entry appeared twice in the timeline and its postings described only one of
 * them. Changing kind must retire the old record, not shadow it.
 */
export function supersedeMutations(
  state: { txns: Txn[]; transfers: Transfer[] }, writing: string, id: string,
): Mutation[] {
  const other = writing === STORE.txn ? STORE.transfer : STORE.txn;
  const exists = other === STORE.transfer
    ? state.transfers.some((t) => t.id === id)
    : state.txns.some((t) => t.id === id);
  return exists ? [{ op: 'delete', type: other, id }] : [];
}

/** Ids already in the chart of accounts, as a set the mutation builders mutate. */
const accountIdSet = (state: { accounts: Account[] }) => new Set(state.accounts.map((a) => a.id));

/**
 * Everything one `put` must write, as an atomic batch.
 *
 * Double-entry (PRD §16): a transaction also moves a money account and writes
 * balanced postings, mirroring the Flutter LedgerWriter. The record and its two
 * legs belong together — written as separate calls, a failure between them left
 * an entry with a single leg, which unbalances the ledger and moves one account
 * balance without the other.
 */
function entryMutations(
  state: Data & { vaultId: string; activeProfileId: string },
  type: string,
  value: { id: string } & Record<string, unknown>,
  existing: Set<string>,
): Mutation[] {
  const { vaultId, activeProfileId } = state;
  const needsProfile = PROFILE_SCOPED.includes(type) && !value.profileId;
  const profileId = (value.profileId as string | undefined) ?? activeProfileId;
  const record = needsProfile ? { ...value, profileId } : value;

  if (type === STORE.txn) {
    const withAccount = {
      ...record,
      accountId: (value.accountId as string | undefined) ?? cashAcctId(profileId),
    };
    return [
      ...supersedeMutations(state, STORE.txn, value.id),
      { op: 'put', type, id: value.id, value: withAccount },
      ...entryPostingMutations(
        vaultId, profileId, withAccount as unknown as Txn,
        new Map(state.categories.map((c) => [c.id, c.name])),
        existing,
      ),
    ];
  }
  if (type === STORE.transfer) {
    return [
      ...supersedeMutations(state, STORE.transfer, value.id),
      { op: 'put', type, id: value.id, value: record },
      ...transferPostingMutations(vaultId, profileId, record as unknown as Transfer),
    ];
  }
  return [{ op: 'put', type, id: value.id, value: record }];
}

/// Deterministic v3 account ids — keep the lazy backfill idempotent and isolated
/// per profile (matches the Flutter Drift migration).
export const cashAcctId = (profileId: string) => `acct-cash-${profileId}`;
const openingAcctId = (profileId: string) => `acct-opening-${profileId}`;
const incomeAcctId = (profileId: string) => `acct-income-${profileId}`;
/**
 * Where investment purchases land (§3.2).
 *
 * An asset account, not an expense one — that single fact is what stops a SIP
 * showing up as overspending. The money moves from one asset you hold (cash) to
 * another (the portfolio), so the balance sheet is unchanged and no expense is
 * created.
 */
const investAcctId = (profileId: string) => `acct-investments-${profileId}`;
const expenseAcctId = (profileId: string, categoryId: string) => `acct-exp-${profileId}-${categoryId}`;

/**
 * Seeds the accounts every profile has regardless of what it has recorded.
 * A brand-new vault needs these before it has a single transaction, or the
 * Accounts page opens empty.
 */
function structuralAccountMutations(
  vaultId: string, profileId: string, existing: Set<string>,
): Mutation[] {
  const base = { vaultId, profileId, openingBalance: '0' };
  const structural: Account[] = [
    { ...base, id: cashAcctId(profileId), name: 'Cash', type: 'asset', subtype: 'cash' },
    { ...base, id: openingAcctId(profileId), name: 'Opening Balances', type: 'equity', subtype: 'equity' },
    { ...base, id: incomeAcctId(profileId), name: 'Income', type: 'income', subtype: 'income' },
    { ...base, id: investAcctId(profileId), name: 'Investments', type: 'asset', subtype: 'investment' },
  ];
  const out: Mutation[] = [];
  for (const a of structural) {
    if (existing.has(a.id)) continue;
    existing.add(a.id);
    out.push({ op: 'put', type: STORE.account, id: a.id, value: a });
  }
  return out;
}

async function ensureStructuralAccounts(
  key: CryptoKey, vaultId: string, profileId: string, existing: Set<string>,
): Promise<void> {
  await applyMutations(key, vaultId, structuralAccountMutations(vaultId, profileId, existing));
}

/**
 * Writes one transaction's balanced postings, creating any structural account
 * it needs first. The single place transactions enter the ledger.
 *
 * Mirrors Flutter's `LedgerWriter.writeEntry`, including its central rule:
 * the money leg is `t.accountId ?? cash`, so a transaction tagged with a bank
 * account moves that account and an untagged one falls back to Cash.
 *
 * Posting ids are deterministic (`<entryId>:dr` / `:cr`), so calling this again
 * for an edited entry overwrites its legs rather than duplicating them.
 *
 * @param categoryNames id → name, used to name a freshly created expense account.
 * @param existing ids already known to exist, mutated as accounts are seeded.
 *   Pass one across a loop to avoid re-reading the chart per transaction.
 */
/** The non-money side of an entry. The whole of §3.2 at the ledger level. */
function contraAccountFor(profileId: string, t: Txn): string {
  if (t.type === 'income') return incomeAcctId(profileId);
  if (t.type === 'investment') return investAcctId(profileId);
  return expenseAcctId(profileId, t.categoryId);
}

function entryPostingMutations(
  vaultId: string, profileId: string, t: Txn,
  categoryNames: Map<string, string>, existing: Set<string>,
): Mutation[] {
  const out: Mutation[] = structuralAccountMutations(vaultId, profileId, existing);
  if (isSpending(t.type) && !existing.has(expenseAcctId(profileId, t.categoryId))) {
    existing.add(expenseAcctId(profileId, t.categoryId));
    out.push({
      op: 'put', type: STORE.account, id: expenseAcctId(profileId, t.categoryId),
      value: {
        id: expenseAcctId(profileId, t.categoryId), vaultId, profileId,
        name: categoryNames.get(t.categoryId) ?? 'Expense',
        type: 'expense', subtype: 'expense', openingBalance: '0',
      } satisfies Account,
    });
  }

  const legs = postingsForEntry({
    entryId: t.id, vaultId, amount: t.amount, type: t.type,
    moneyAccountId: t.accountId ?? cashAcctId(profileId),
    categoryAccountId: contraAccountFor(profileId, t),
  });
  for (const leg of legs) {
    out.push({ op: 'put', type: STORE.posting, id: leg.id, value: { ...leg, profileId } });
  }
  return out;
}

/** A transfer's two legs. Ids are deterministic, so edits overwrite. */
function transferPostingMutations(vaultId: string, profileId: string, t: Transfer): Mutation[] {
  return postingsForTransfer(t).map((leg) => ({
    op: 'put' as const, type: STORE.posting, id: leg.id, value: { ...leg, profileId },
  }));
}

/** Writes one transaction's postings on their own. Used by repair paths. */
async function writeEntryPostings(
  key: CryptoKey, vaultId: string, profileId: string, t: Txn,
  categoryNames: Map<string, string>, existing: Set<string>,
): Promise<void> {
  await applyMutations(key, vaultId, entryPostingMutations(vaultId, profileId, t, categoryNames, existing));
}

async function writeTransferPostings(
  key: CryptoKey, vaultId: string, profileId: string, t: Transfer,
): Promise<void> {
  await applyMutations(key, vaultId, transferPostingMutations(vaultId, profileId, t));
}

/// Lazily migrates a profile to double-entry: seeds its chart of accounts and
/// converts each existing transaction into balanced postings, so net worth is
/// preserved. Mirrors AppDatabase._migrateToDoubleEntry on Flutter.
async function backfillDoubleEntry(
  key: CryptoKey, vaultId: string, profileId: string,
  categories: Category[], txns: Txn[],
): Promise<void> {
  const cashId = cashAcctId(profileId);
  const existing = new Set<string>();
  const names = new Map(categories.map((c) => [c.id, c.name]));
  // Seed an expense account per category up front, not just for categories that
  // happen to appear in this profile's history: the chart of accounts should
  // describe what can be spent on, not only what has been.
  for (const c of categories) {
    await putRecord(key, STORE.account, vaultId, expenseAcctId(profileId, c.id), {
      id: expenseAcctId(profileId, c.id), vaultId, profileId,
      name: c.name, type: 'expense', subtype: 'expense', openingBalance: '0',
    } satisfies Account);
    existing.add(expenseAcctId(profileId, c.id));
  }
  await ensureStructuralAccounts(key, vaultId, profileId, existing);
  for (const t of txns) {
    await writeEntryPostings(key, vaultId, profileId, t, names, existing);
    if (!t.accountId) {
      await putRecord(key, STORE.txn, vaultId, t.id, { ...t, accountId: cashId, profileId: t.profileId ?? profileId });
    }
  }
}

export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Food', icon: 'Utensils' },
  { name: 'Transport', icon: 'Bus' },
  { name: 'Rent', icon: 'Home' },
  { name: 'Utilities', icon: 'Zap' },
  { name: 'Shopping', icon: 'ShoppingBag' },
  { name: 'Health', icon: 'HeartPulse' },
  { name: 'Entertainment', icon: 'Clapperboard' },
  { name: 'EMI', icon: 'Landmark' },
  { name: 'Salary', icon: 'Wallet' },
  { name: 'Investment', icon: 'TrendingUp' },
  { name: 'Other', icon: 'Shapes' },
];

export type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocking' | 'unlocked';

interface Data {
  /**
   * Records in the vault that would not decrypt on the last load.
   *
   * Surfaced in Diagnostics rather than swallowed: these are invisible to every
   * screen and are also absent from the next backup, so staying quiet about
   * them lets the loss reach the user's only copy.
   */
  unreadableRecords: ReadFailure[];
  /**
   * Exchange rates the user has recorded. Vault-wide, not profile-scoped: an
   * exchange rate is a fact about the world, not about a profile.
   */
  fxRates: FxRate[];
  /**
   * Ids of the stored receipts. Ids only — the payloads are base64 images and
   * holding them all in memory would be pointless. Diagnostics uses these to
   * find receipts nothing references and references with no receipt.
   */
  attachmentIds: string[];
  txns: Txn[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  holdings: Holding[];
  liabilities: Liability[];
  recurring: RecurringRule[];
  insurances: Insurance[];
  snapshots: NetWorthSnapshot[];
  importBatches: ImportBatch[];
  lots: HoldingLot[];
  accounts: Account[];
  postings: Posting[];
  transfers: Transfer[];
  pendingCaptures: PendingCapture[];
  watchlist: WatchItem[];
  dividends: Dividend[];
  alerts: Alert[];
}

const emptyData: Data = {
  txns: [], categories: [], budgets: [], goals: [], holdings: [],
  liabilities: [], recurring: [], insurances: [], snapshots: [], importBatches: [], lots: [],
  accounts: [], postings: [], transfers: [], pendingCaptures: [],
  watchlist: [], dividends: [], alerts: [], unreadableRecords: [], attachmentIds: [],
  fxRates: [],
};

interface AppState extends Data {
  status: VaultStatus;
  error: string | null;
  ghost: boolean;
  key: CryptoKey | null;
  vaultId: string;
  currencyCode: string;
  theme: ThemeChoice;
  accent: AccentName;
  profiles: Profile[];
  activeProfileId: string;
  /**
   * Whether the browser has promised not to evict this vault. Surfaced in
   * Settings, because if it is `denied` the user's only copy of their data is
   * something the browser may clear without warning.
   */
  /**
   * Whether Khazana Pro is unlocked. Lives OUTSIDE `Data` on purpose, so
   * `lock()` and `wipe()` — which spread `...emptyData` — cannot clear it by
   * accident. Erasing your financial data must never revoke a purchase.
   */
  pro: Entitlement;
  activateLicense: (key: string) => Promise<string>;
  removeLicense: () => void;
  persistence: PersistenceState;
  /**
   * Consecutive failed unlock attempts, and the epoch-ms until which further
   * attempts are refused. Both live in localStorage so closing the tab is not a
   * way around the delay.
   */
  pinFailures: number;
  lockedOutUntil: number;
  init: () => Promise<void>;
  setTheme: (t: ThemeChoice) => void;
  setAccent: (a: AccentName) => void;
  setup: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<void>;
  lock: () => void;
  toggleGhost: () => void;
  setCurrency: (code: string) => void;
  setActiveProfile: (id: string) => Promise<void>;
  addProfile: (name: string, kind: ProfileKind) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  captureSnapshot: () => Promise<void>;
  reload: () => Promise<void>;
  put: (type: string, value: { id: string } & Record<string, unknown>) => Promise<void>;
  /** Many records as one atomic batch and one reload. See `putMany` below. */
  putMany: (entries: { type: string; value: { id: string } & Record<string, unknown> }[]) => Promise<void>;
  del: (type: string, id: string) => Promise<void>;
  reassignTxnAccounts: (fromAccountId: string, toAccountId: string) => Promise<number>;
  putAttachment: (file: File) => Promise<string>;
  getAttachmentUrl: (id: string) => Promise<string | null>;
  processRecurring: () => Promise<number>;
  exportBackup: (pin?: string) => Promise<string>;
  /**
   * @param mode `replace` (default) makes the vault match the backup, which is
   *   what "restore" means. `merge` layers the backup over what is already
   *   here, for pulling in a second device's data.
   */
  importBackup: (b64: string, pin?: string, mode?: 'replace' | 'merge') => Promise<number>;
  /** Records one import run so it can be reversed. Returns the batch id. */
  recordImportBatch: (b: Omit<ImportBatch, 'id' | 'vaultId' | 'profileId'>) => Promise<string>;
  /** Deletes everything a run created. Returns how many records were removed. */
  undoImportBatch: (batchId: string) => Promise<number>;
  wipe: () => Promise<void>;
}

export const uid = () => crypto.randomUUID();
// localStorage keys. Renamed from the old `ftos-*` prefix during the Khazana
// rebrand. Writes always use the new key; reads fall back to the legacy key via
// `lsGet` so an existing user keeps their currency, profile, theme and accent.
//
// NOTE: the legacy names are also hardcoded in the inline no-FOUC theme script
// in `app/layout.tsx` (it can't import from here). Both must agree.
const CURRENCY_KEY = 'khazana-currency';
const ACTIVE_PROFILE_KEY = 'khazana-active-profile';
const THEME_KEY = 'khazana-theme';
const ACCENT_KEY = 'khazana-accent';
/**
 * Ghost mode (amounts masked). Persisted because the reason someone hides their
 * balances — an open-plan desk, a commute, a shared screen — is still true the
 * next time they open the app. Not a vault secret: it records that the figures
 * were hidden, never what they were.
 */
const GHOST_KEY = 'khazana-ghost';
/**
 * Khazana Pro. Kept in localStorage rather than in the vault for the same
 * reasons as the Flutter side: it must survive `wipe()` (erasing your
 * finances is not a reason to lose a purchase) and be readable before the
 * vault is unlocked, since the paywall and the Settings row both need it.
 *
 * The raw key is stored alongside the cached entitlement so every launch
 * re-verifies the SIGNATURE rather than trusting a cached boolean — the cache
 * is a convenience for the first paint, not the trust anchor.
 */
const PRO_KEY = 'khazana-entitlement-v1';
const LICENSE_KEY_STORAGE = 'khazana-license-v1';
/** Account the add-transaction form defaults to. A convenience, not vault data. */
export const LAST_ACCOUNT_KEY = 'khazana-last-account';

/**
 * Failed-unlock throttle. The Flutter client has had one since the beginning
 * (`vault_unlock_notifier.dart`); this client — the one people can actually
 * reach on the open web — had none, so a PIN could be guessed as fast as the
 * key derivation would run.
 *
 * PBKDF2 at 600k iterations is a real cost per guess, but it is the *only*
 * cost, and against a 6-digit keyspace of a million candidates that is not
 * enough on its own. These two keys live in localStorage rather than in memory
 * precisely so that closing the tab is not the reset button.
 */
const PIN_FAILURES_KEY = 'khazana-pin-failures';
const LOCKOUT_UNTIL_KEY = 'khazana-lockout-until';

/** Free attempts before any delay. Typos are normal; five of them are not. */
const LOCKOUT_AFTER = 5;
/** Never grow past this — a locked-out honest user is a support ticket. */
const MAX_LOCKOUT_MS = 5 * 60_000;

/**
 * Doubles per failure past the threshold: 5s, 10s, 20s … capped at 5 minutes.
 * Fast enough that someone who fat-fingered their PIN twice barely notices,
 * steep enough that an automated walk through the keyspace is hopeless.
 */
function lockoutDelayMs(failures: number): number {
  const step = Math.min(failures - LOCKOUT_AFTER, 10);
  return Math.min(5_000 * 2 ** step, MAX_LOCKOUT_MS);
}

function lockoutMessage(remainingMs: number): string {
  const secs = Math.max(1, Math.ceil(remainingMs / 1000));
  if (secs < 60) return `Too many attempts. Try again in ${secs}s.`;
  return `Too many attempts. Try again in ${Math.ceil(secs / 60)} min.`;
}

const LEGACY_KEY: Record<string, string> = {
  [CURRENCY_KEY]: 'ftos-currency',
  [ACTIVE_PROFILE_KEY]: 'ftos-active-profile',
  [THEME_KEY]: 'ftos-theme',
  [ACCENT_KEY]: 'ftos-accent',
};

/**
 * Reads a preference, migrating it off the pre-rebrand key on first hit.
 * Returns null when neither key is present. Safe when localStorage is absent.
 */
export function lsGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = LEGACY_KEY[key];
  if (!legacy) return null;
  const old = localStorage.getItem(legacy);
  if (old !== null) {
    // Copy forward once so later reads hit the new key directly. The legacy key
    // is left in place so an older build still works against the same browser.
    localStorage.setItem(key, old);
  }
  return old;
}

/** Writes a preference. Safe when localStorage is absent or full. */
export function lsSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* quota or private mode */ }
}

export type ThemeChoice = 'light' | 'dark' | 'system';
export type AccentName = 'default' | 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';

// Each accent is tuned separately for light and dark so it always reads well.
// [accent, accent-deep, accent-glow]. 'default' is Khazana Gold and sets no
// inline properties at all — it falls through to the CSS defaults in
// globals.css (#836612 light / #D4A93F dark).
//
// The five alternates are named and toned as gemstones/metals rather than as
// web colours, because the product's identity is a treasury. Each light step is
// darkened until it clears 4.5:1 on white — the mid-tone that looks right on a
// dark surface is unreadable on a light one.
//
// The five named accents are drawn from the same palette family as the
// semantics, so a recoloured product still looks like one system. Keys are
// FROZEN: they are persisted in localStorage, so renaming one silently resets
// that user's choice. 'blue' is Indigo rather than a second Khazana Blue for
// exactly that reason — the key had to stay even though the colour moved.
//
// Any change here must be mirrored in the no-FOUC script in app/layout.tsx,
// which carries a copy of this table so the accent lands before first paint.
export const ACCENTS: Record<Exclude<AccentName, 'default'>, {
  label: string; swatch: string; light: [string, string, string]; dark: [string, string, string];
}> = {
  // Jade sits deliberately close to the brand plate; it is the one alternate
  // that keeps the emerald identity while moving the accent off gold.
  emerald: { label: 'Jade', swatch: '#1B7F52', light: ['#136344', '#0D4C33', '#1B7F52'], dark: ['#3FD99A', '#1F8A5B', '#7BE9BC'] },
  blue: { label: 'Sapphire', swatch: '#3B5FBF', light: ['#2F4C9C', '#243B7A', '#4F7CFF'], dark: ['#6E93FF', '#4A6FE0', '#A9C1FF'] },
  violet: { label: 'Amethyst', swatch: '#6E5BB8', light: ['#584796', '#443873', '#8E7CC3'], dark: ['#A492DC', '#7E6CB8', '#C9BDEE'] },
  amber: { label: 'Copper', swatch: '#B4642A', light: ['#8E4E20', '#703D19', '#C2610F'], dark: ['#D98A4E', '#B4642A', '#F0B183'] },
  rose: { label: 'Garnet', swatch: '#A83A45', light: ['#8C2F38', '#6E252C', '#C0392F'], dark: ['#E0707C', '#B84B58', '#F2A6AE'] },
};

function applyAccent(name: string, dark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const a = (ACCENTS as Record<string, (typeof ACCENTS)[keyof typeof ACCENTS]>)[name];
  if (!a) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-deep');
    root.style.removeProperty('--accent-glow');
    return;
  }
  const [c, d, g] = dark ? a.dark : a.light;
  root.style.setProperty('--accent', c);
  root.style.setProperty('--accent-deep', d);
  root.style.setProperty('--accent-glow', g);
}

// Resolve theme + accent from storage and apply to <html>. Honors OS preference
// for 'system'. Safe on the server (guards on document).
export function applyAppearance() {
  if (typeof document === 'undefined') return;
  const theme = (lsGet(THEME_KEY) as ThemeChoice) || 'system';
  const accent = lsGet(ACCENT_KEY) || 'default';
  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  applyAccent(accent, !!dark);
}


/**
 * Re-verifies the stored licence key and returns the resulting entitlement.
 *
 * Runs on every `init()`. Verification is a local Ed25519 check taking well
 * under a millisecond, so it happens synchronously before first paint and there
 * is no window in which a paying user sees a paywall.
 *
 * The cached entitlement is only a fallback for the case where a real public
 * key has not been compiled in yet: refusing a genuine key because the BUILD is
 * unfinished would be our mistake charged to the customer.
 */
/**
 * Development escape hatch — the web twin of Flutter's `kProOverride`
 * (`lib/core/entitlement/distribution_channel.dart:63`).
 *
 * Set `NEXT_PUBLIC_KHAZANA_PRO=true` in `webapp/.env.local` and `npm run dev`
 * runs as Pro. Without it, working on a gated screen means either minting a
 * licence or staring at the paywall you just built.
 *
 * **It cannot reach a shipped build, and that is a property of the compiler
 * rather than of care.** Next inlines both of these at build time — but only
 * for literal `process.env.X` references, never a dynamic lookup, which is why
 * they are spelled out in full here. In a production build the first term
 * becomes the literal `false`, so the whole expression folds to `false` and
 * minification deletes the branch. The env var could be set on the build
 * machine and it would still be absent from the bundle.
 *
 * `devOverride` is reported as the source, never `licenseKey`. The entitlement
 * should always be honest about where it came from — a dev build must not be
 * indistinguishable from a purchase in a bug report or a screenshot.
 */
function devProOverride(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_KHAZANA_PRO === 'true';
}

function resolvePro(): Entitlement {
  if (devProOverride()) {
    return { isPro: true, source: 'devOverride', lastVerifiedAt: new Date().toISOString() };
  }

  const raw = lsGet(LICENSE_KEY_STORAGE);
  if (!raw) return FREE;

  if (LICENSE_KEY_IS_PLACEHOLDER) return parseEntitlement(lsGet(PRO_KEY));

  const check = verifyLicense(raw, LICENSE_PUBLIC_KEY);
  if (check.verdict !== 'valid') return FREE;

  const entitlement: Entitlement = {
    isPro: true,
    source: 'licenseKey',
    grantedAt: check.issuedAt?.toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    orderRef: check.orderRef,
  };
  lsSet(PRO_KEY, JSON.stringify(entitlement));
  return entitlement;
}

export const useApp = create<AppState>((set, get) => ({
  ...emptyData,
  status: 'loading',
  error: null,
  ghost: false,
  key: null,
  vaultId: VAULT_ID,
  currencyCode: 'INR',
  theme: 'system',
  accent: 'default',
  profiles: [],
  activeProfileId: '',
  pro: FREE,
  persistence: 'unsupported',
  pinFailures: 0,
  lockedOutUntil: 0,

  init: async () => {
    const meta = await db.vaults.get(VAULT_ID);
    const cur = lsGet(CURRENCY_KEY) ?? 'INR';
    const theme = (lsGet(THEME_KEY) as ThemeChoice) ?? 'system';
    const accent = (lsGet(ACCENT_KEY) as AccentName) ?? 'default';
    const ghost = lsGet(GHOST_KEY) === '1';
    set({
      status: meta ? 'locked' : 'uninitialized',
      currencyCode: cur,
      theme,
      accent,
      ghost,
      pinFailures: Number(lsGet(PIN_FAILURES_KEY) ?? 0) || 0,
      lockedOutUntil: Number(lsGet(LOCKOUT_UNTIL_KEY) ?? 0) || 0,
      pro: resolvePro(),
    });
    applyAppearance();
    // Read-only: asking to upgrade here would prompt before the user has any
    // data worth protecting. The request happens at vault creation.
    void persistenceState().then((persistence) => set({ persistence }));
  },

  setTheme: (t) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, t);
    set({ theme: t });
    applyAppearance();
  },

  setAccent: (a) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACCENT_KEY, a);
    set({ accent: a });
    applyAppearance();
  },

  setup: async (pin) => {
    set({ status: 'unlocking', error: null });
    try {
      const salt = randomBytes(32);
      const key = await deriveKey(pin, salt);
      const verifier = await encryptJson(key, VERIFIER);
      await db.vaults.put({ vaultId: VAULT_ID, name: 'My Vault', saltB64: bufToB64(salt.buffer), verifier, schemaVersion: SCHEMA_VERSION });
      set({ key });
      await get().reload();
      set({ status: 'unlocked' });
      // The moment to ask: the user has just deliberately created a vault, so
      // any browser prompt is expected and the answer is about data that is
      // about to exist. Asking at first page load instead would be a prompt
      // about nothing.
      void requestPersistence().then((persistence) => set({ persistence }));
    } catch (e) {
      set({ status: 'uninitialized', error: `Could not create vault: ${e}` });
    }
  },

  unlock: async (pin) => {
    // Throttle first — before the 600k-iteration derivation, which would
    // otherwise make an attacker's rate limit our CPU rather than our policy.
    const wait = get().lockedOutUntil - Date.now();
    if (wait > 0) {
      set({ status: 'locked', error: lockoutMessage(wait) });
      return;
    }

    set({ status: 'unlocking', error: null });
    try {
      const meta = await db.vaults.get(VAULT_ID);
      if (!meta) { set({ status: 'uninitialized' }); return; }
      const key = await deriveKey(pin, b64ToBuf(meta.saltB64));
      const token = await decryptJson<string>(key, meta.verifier); // throws on wrong PIN
      if (token !== VERIFIER) throw new Error('bad');
      set({ key });
      const ver = meta.schemaVersion ?? 1;
      if (ver < SCHEMA_VERSION) {
        await runMigrations(ver, key, VAULT_ID);
        await db.vaults.update(VAULT_ID, { schemaVersion: SCHEMA_VERSION });
      }
      lsSet(PIN_FAILURES_KEY, '0');
      lsSet(LOCKOUT_UNTIL_KEY, '0');
      set({ pinFailures: 0, lockedOutUntil: 0 });
      await get().reload();
      set({ status: 'unlocked' });
      void get().captureSnapshot();
      void persistenceState().then((persistence) => set({ persistence }));
    } catch {
      const failures = get().pinFailures + 1;
      const until = failures >= LOCKOUT_AFTER
        ? Date.now() + lockoutDelayMs(failures)
        : 0;
      lsSet(PIN_FAILURES_KEY, String(failures));
      lsSet(LOCKOUT_UNTIL_KEY, String(until));
      set({
        status: 'locked',
        pinFailures: failures,
        lockedOutUntil: until,
        error: until > 0
          ? lockoutMessage(until - Date.now())
          : 'Incorrect PIN.',
      });
    }
  },

  lock: () => set({ status: 'locked', key: null, ...emptyData, profiles: [] }),
  toggleGhost: () => set((s) => {
    const ghost = !s.ghost;
    lsSet(GHOST_KEY, ghost ? '1' : '0');
    return { ghost };
  }),

  /**
   * Applies a licence key the user pasted. Returns a message to show them.
   *
   * Never contacts anything. A key is a signature over a payload, and the
   * public half is compiled in — so this works offline, and no third party
   * learns that this person is unlocking Khazana today.
   */
  activateLicense: async (key) => {
    if (LICENSE_KEY_IS_PLACEHOLDER) {
      return 'This build cannot check licence keys yet. Please contact support.';
    }
    const check = verifyLicense(key, LICENSE_PUBLIC_KEY);
    if (check.verdict !== 'valid') {
      return {
        malformed: 'That does not look like a Khazana licence key. Copy the whole line, including the KHAZ1. prefix.',
        badSignature: 'That key could not be verified. Check it was copied in full.',
        wrongProduct: 'That is a valid key, but for a different product.',
        unsupportedVersion: 'That key was issued for a newer version of Khazana. Please update the app.',
        valid: '',
      }[check.verdict];
    }

    const entitlement: Entitlement = {
      isPro: true,
      source: 'licenseKey',
      grantedAt: check.issuedAt?.toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      orderRef: check.orderRef,
    };
    lsSet(LICENSE_KEY_STORAGE, key.trim());
    lsSet(PRO_KEY, JSON.stringify(entitlement));
    set({ pro: entitlement });
    return 'Licence accepted. Khazana Pro is unlocked.';
  },

  /** Removes a licence from this device — for handing a machine on. */
  removeLicense: () => {
    lsSet(LICENSE_KEY_STORAGE, '');
    lsSet(PRO_KEY, '');
    set({ pro: FREE });
  },

  setCurrency: (code) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CURRENCY_KEY, code);
    set({ currencyCode: code });
  },

  setActiveProfile: async (id) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    set({ activeProfileId: id });
    await get().reload();
    void get().captureSnapshot();
  },

  addProfile: async (name, kind) => {
    const { key, vaultId } = get();
    if (!key) return;
    const p: Profile = { id: uid(), vaultId, name: name.trim() || 'Profile', kind, createdAt: Date.now() };
    await putRecord(key, STORE.profile, vaultId, p.id, p);
    await get().setActiveProfile(p.id);
  },

  renameProfile: async (id, name) => {
    const { key, vaultId, profiles } = get();
    if (!key) return;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    await putRecord(key, STORE.profile, vaultId, id, { ...p, name: name.trim() || p.name });
    await get().reload();
  },

  deleteProfile: async (id) => {
    const { key, vaultId, profiles } = get();
    if (!key || profiles.length <= 1) return; // never delete the last profile
    // Remove the profile and all its scoped records.
    await deleteRecord(STORE.profile, id);
    for (const type of PROFILE_SCOPED) {
      const recs = await listRecords<{ id: string; profileId?: string }>(key, type, vaultId);
      for (const r of recs) if (r.profileId === id) await deleteRecord(type, r.id);
    }
    const remaining = profiles.filter((p) => p.id !== id);
    await get().setActiveProfile(remaining[0].id);
  },

  captureSnapshot: async () => {
    const {
      key, vaultId, activeProfileId, txns, holdings, liabilities,
      goals, insurances, budgets, snapshots, accounts, postings,
    } = get();
    if (!key || !activeProfileId) return;
    const day = new Date().toISOString().slice(0, 10);
    const id = `snap-${activeProfileId}-${day}`;
    const investments = investmentTotals(holdings);
    // From the ledger, not from summing transactions: opening balances are real
    // money, and a dashboard that ignores them would contradict the Accounts
    // page. Liabilities stay on their own table (they carry an APR and a term),
    // so only asset accounts count here and nothing is double-counted.
    const cash = liquidBalance(accounts, postings);
    const invest = investments.marketValue;
    const liab = liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO);
    // Both health fields stay null when the score cannot be computed. A day
    // with nothing tracked has no score, and writing 0 would put a failing
    // grade into the Score page's history chart for a day the app had no
    // opinion about.
    const health = healthScore({
      txns, investments, liabilities, goals, insurances, budgets, snapshots, cash,
    });
    const snap: NetWorthSnapshot = {
      id, vaultId, profileId: activeProfileId, date: Date.now(),
      netWorth: cash.plus(invest).minus(liab).toString(),
      cash: cash.toString(), investments: invest.toString(), liabilities: liab.toString(),
      healthScore: health.score,
      healthTrackedWeight: health.score === null ? null : Math.round(health.trackedWeight),
    };
    await putRecord(key, STORE.snapshot, vaultId, id, snap);
  },

  reload: async () => {
    // Records that will not decrypt are collected rather than skipped in
    // silence: one used to vanish from every screen *and* from the next backup
    // export, so the loss propagated into the user's only copy unannounced.
    const failures: ReadFailure[] = [];
    const { key, vaultId } = get();
    if (!key) return;

    // Categories are vault-wide (shared across profiles); seed defaults once.
    let categories = await listRecords<Category>(key, STORE.category, vaultId, failures);
    if (categories.length === 0) {
      for (const c of DEFAULT_CATEGORIES) {
        const cat: Category = { id: uid(), vaultId, name: c.name, icon: c.icon };
        await putRecord(key, STORE.category, vaultId, cat.id, cat);
      }
      categories = await listRecords<Category>(key, STORE.category, vaultId, failures);
    }

    // Profiles: seed a default if none exist.
    let profiles = await listRecords<Profile>(key, STORE.profile, vaultId, failures);
    if (profiles.length === 0) {
      const p: Profile = { id: uid(), vaultId, name: 'Personal', kind: 'self', createdAt: Date.now() };
      await putRecord(key, STORE.profile, vaultId, p.id, p);
      profiles = [p];
    }
    profiles.sort((a, b) => a.createdAt - b.createdAt);
    const defaultId = profiles[0].id;
    let active = get().activeProfileId
      || lsGet(ACTIVE_PROFILE_KEY)
      || defaultId;
    if (!profiles.some((p) => p.id === active)) active = defaultId;

    // Profile-scoped reads: a record with no profileId belongs to the default profile.
    const inProfile = <T extends { profileId?: string }>(r: T) => (r.profileId ?? defaultId) === active;

    const [
      txnsAll, budgetsAll, goalsAll, holdingsAll, liabilitiesAll, recurringAll,
      insurancesAll, snapshotsAll, pendingAll, watchAll, dividendsAll, alertsAll,
      transfersAll, batchesAll, lotsAll,
    ] = await Promise.all([
        listRecords<Txn>(key, STORE.txn, vaultId, failures),
        listRecords<Budget>(key, STORE.budget, vaultId, failures),
        listRecords<Goal>(key, STORE.goal, vaultId, failures),
        listRecords<Holding>(key, STORE.holding, vaultId, failures),
        listRecords<Liability>(key, STORE.liability, vaultId, failures),
        listRecords<RecurringRule>(key, STORE.recurring, vaultId, failures),
        listRecords<Insurance>(key, STORE.insurance, vaultId, failures),
        listRecords<NetWorthSnapshot>(key, STORE.snapshot, vaultId, failures),
        listRecords<PendingCapture>(key, STORE.pendingCapture, vaultId, failures),
        listRecords<WatchItem>(key, STORE.watchItem, vaultId, failures),
        listRecords<Dividend>(key, STORE.dividend, vaultId, failures),
        listRecords<Alert>(key, STORE.alert, vaultId, failures),
        listRecords<Transfer>(key, STORE.transfer, vaultId, failures),
        listRecords<ImportBatch>(key, STORE.importBatch, vaultId, failures),
        listRecords<HoldingLot>(key, STORE.lot, vaultId, failures),
      ]);

    // Double-entry (v3): lazily backfill the active profile's chart of accounts
    // + postings the first time it has none, then read them back.
    let accountsAll = await listRecords<Account>(key, STORE.account, vaultId, failures);
    if (!accountsAll.some(inProfile)) {
      await backfillDoubleEntry(key, vaultId, active, categories, txnsAll.filter(inProfile));
      accountsAll = await listRecords<Account>(key, STORE.account, vaultId, failures);
    }
    const [txnsReloaded, postingsAll] = await Promise.all([
      listRecords<Txn>(key, STORE.txn, vaultId, failures),
      listRecords<Posting>(key, STORE.posting, vaultId, failures),
    ]);

    // A goal linked to an account reports that account's balance, not the
    // number someone last typed. Substituted here, in the one place the slice
    // is built, so the goals page, the health score and the safety net all see
    // the same figure without threading a balances map through their
    // signatures. The stored record keeps its manual value, unused while linked.
    const accountsInProfile = accountsAll.filter(inProfile);
    const balances = accountBalances(accountsInProfile, postingsAll.filter(inProfile));
    const goalsInProfile = goalsAll.filter(inProfile).map((g) => (
      g.accountId && balances.has(g.accountId)
        ? { ...g, currentAmount: Decimal.max(ZERO, balances.get(g.accountId)!).toString() }
        : g
    ));

    set({
      categories,
      profiles,
      activeProfileId: active,
      txns: txnsReloaded.filter(inProfile),
      budgets: budgetsAll.filter(inProfile),
      goals: goalsInProfile,
      holdings: holdingsAll.filter(inProfile),
      liabilities: liabilitiesAll.filter(inProfile),
      recurring: recurringAll.filter(inProfile),
      insurances: insurancesAll.filter(inProfile),
      snapshots: snapshotsAll.filter(inProfile).sort((a, b) => a.date - b.date),
      importBatches: batchesAll.filter(inProfile).sort((a, b) => b.at - a.at),
      lots: lotsAll.filter(inProfile).sort((a, b) => a.purchaseDate - b.purchaseDate),
      accounts: accountsInProfile,
      postings: postingsAll.filter(inProfile),
      transfers: transfersAll.filter(inProfile).sort((a, b) => b.date - a.date),
      pendingCaptures: pendingAll.filter(inProfile),
      watchlist: watchAll.filter(inProfile).sort((a, b) => b.addedAt - a.addedAt),
      dividends: dividendsAll.filter(inProfile).sort((a, b) => b.payDate - a.payDate),
      alerts: alertsAll.filter(inProfile).sort((a, b) => b.createdAt - a.createdAt),
      unreadableRecords: failures,
      attachmentIds: await listRecordIds(STORE.attachment, vaultId),
      // Not profile-filtered: the rupee's value against the dollar does not
      // depend on whose portfolio is open.
      fxRates: await listRecords<FxRate>(key, STORE.fxRate, vaultId, failures),
    });
  },

  put: async (type, value) => {
    const { key, vaultId } = get();
    if (!key) return;
    await applyMutations(key, vaultId, entryMutations(get(), type, value, accountIdSet(get())));
    await get().reload();
  },

  /**
   * Writes many records as a single transaction and reloads once.
   *
   * Import used to call `put` per row, and `put` reloads the whole vault —
   * which means decrypting every record in it. A five-hundred-row statement
   * therefore decrypted the vault five hundred times, and a failure partway
   * through left half a statement imported with no way to undo the rest.
   */
  putMany: async (entries) => {
    const { key, vaultId } = get();
    if (!key || entries.length === 0) return;
    // One shared account set across the batch, so a structural or per-category
    // expense account is created once rather than once per row.
    const existing = accountIdSet(get());
    const mutations = entries.flatMap((e) => entryMutations(get(), e.type, e.value, existing));
    await applyMutations(key, vaultId, mutations);
    await get().reload();
  },

  del: async (type, id) => {
    const { key, vaultId } = get();
    if (!key) {
      await deleteRecord(type, id);
      await get().reload();
      return;
    }
    // Drop an entry's postings alongside it. Both transactions and transfers
    // own two deterministically-named legs; orphaned legs would keep moving
    // account balances for a record that no longer exists.
    const mutations: Mutation[] = [{ op: 'delete', type, id }];
    if (type === STORE.txn || type === STORE.transfer) {
      mutations.push(
        { op: 'delete', type: STORE.posting, id: `${id}:dr` },
        { op: 'delete', type: STORE.posting, id: `${id}:cr` },
      );
    }
    // A receipt outlives nothing. Left behind it is unreachable, still counted
    // against storage, and still inflating every future backup.
    if (type === STORE.txn) {
      const ref = get().txns.find((t) => t.id === id)?.attachmentRef;
      if (ref) mutations.push({ op: 'delete', type: STORE.attachment, id: ref });
    }
    await applyMutations(key, vaultId, mutations);
    await get().reload();
  },

  /**
   * Moves every transaction on one account to another, rewriting its postings.
   *
   * The one-off after adding real accounts: history recorded before they
   * existed all sits on the built-in Cash account. Rewriting the postings is
   * the point — leaving them behind would keep the old account's balance moving
   * for transactions that no longer belong to it.
   */
  reassignTxnAccounts: async (fromAccountId, toAccountId) => {
    const { key, vaultId, activeProfileId, txns, categories, accounts } = get();
    if (!key || fromAccountId === toAccountId) return 0;
    const moving = txns.filter((t) => (t.accountId ?? fromAccountId) === fromAccountId);
    if (moving.length === 0) return 0;
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const existing = new Set(accounts.map((a) => a.id));
    for (const t of moving) {
      const next = { ...t, accountId: toAccountId };
      await putRecord(key, STORE.txn, vaultId, t.id, next);
      await writeEntryPostings(key, vaultId, t.profileId ?? activeProfileId, next, names, existing);
    }
    await get().reload();
    return moving.length;
  },

  putAttachment: async (file) => {
    const { key, vaultId, activeProfileId } = get();
    if (!key) throw new Error('Vault is locked');
    const data = bufToB64(await file.arrayBuffer());
    const id = uid();
    // `attachment` is in PROFILE_SCOPED, but this wrote no profileId — so
    // receipts were effectively vault-wide while every other part of the app
    // treated them as belonging to a profile.
    await putRecord(key, STORE.attachment, vaultId, id, {
      id, vaultId, profileId: activeProfileId, mime: file.type || 'image/jpeg', data,
    });
    return id;
  },

  getAttachmentUrl: async (id) => {
    const { key } = get();
    if (!key) return null;
    const rec = await getRecord<{ mime: string; data: string }>(key, STORE.attachment, id);
    if (!rec) return null;
    return `data:${rec.mime};base64,${rec.data}`;
  },

  processRecurring: async () => {
    const { key, vaultId, activeProfileId, recurring, categories, accounts } = get();
    if (!key) return 0;
    // Generated transactions go through the ledger like any other. They used to
    // be written straight to storage, which left them with no postings at all —
    // invisible until per-account balances made the hole obvious.
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const existing = new Set(accounts.map((a) => a.id));
    let created = 0;
    for (const rule of recurring) {
      const { runs, nextRun } = materialize(rule);
      for (const when of runs) {
        const t: Txn = {
          id: uid(), vaultId, profileId: activeProfileId, amount: rule.amount, type: rule.type,
          categoryId: rule.categoryId, merchant: rule.merchant ?? null,
          note: 'Recurring', date: when, createdAt: Date.now(),
          accountId: rule.accountId ?? cashAcctId(activeProfileId),
        };
        await putRecord(key, STORE.txn, vaultId, t.id, t);
        await writeEntryPostings(key, vaultId, activeProfileId, t, names, existing);
        created++;
      }
      if (runs.length > 0) {
        await putRecord(key, STORE.recurring, vaultId, rule.id, { ...rule, nextRun });
      }
    }
    if (created > 0) await get().reload();
    return created;
  },

  /**
   * Exports every record, encrypted.
   *
   * v2 carries its own freshly-generated salt and is encrypted with a key
   * derived from `pin` + that salt. v1 used the *vault's* key, whose salt is
   * random per vault and stored only in that browser's IndexedDB — so a v1
   * file could only ever be restored into the exact vault that made it. The
   * same PIN on a second device derives a different key, which is why moving
   * data between the web app and the desktop app always failed.
   *
   * Passing no PIN still produces the legacy v1 shape, so nothing that already
   * relies on the old format breaks.
   */
  recordImportBatch: async (b) => {
    const { key, vaultId, activeProfileId } = get();
    if (!key) throw new Error('locked');
    const id = uid();
    await putRecord(key, STORE.importBatch, vaultId, id, {
      ...b, id, vaultId, profileId: activeProfileId,
    } satisfies ImportBatch);
    await get().reload();
    return id;
  },

  /**
   * Reverses an import.
   *
   * Deletes only the ids the run created — an import that refreshed an
   * existing holding's price is not rewound, because the prior value was never
   * captured. The batch is marked undone rather than deleted, so the history
   * still shows that it happened.
   */
  undoImportBatch: async (batchId) => {
    const { key, vaultId, importBatches } = get();
    if (!key) throw new Error('locked');
    const batch = importBatches.find((b) => b.id === batchId);
    if (!batch || batch.undone) return 0;

    let removed = 0;
    for (const rec of batch.created) {
      await deleteRecord(rec.type, rec.id);
      removed++;
    }
    // Postings are derived, so anything that belonged to a deleted entry has to
    // go with it or the ledger stops balancing.
    const postings = await listRecords<Posting>(key, STORE.posting, vaultId);
    const goneIds = new Set(batch.created.map((r) => r.id));
    for (const p of postings) {
      if (goneIds.has(p.entryId)) { await deleteRecord(STORE.posting, p.id); removed++; }
    }

    await putRecord(key, STORE.importBatch, vaultId, batch.id, { ...batch, undone: true });
    await get().reload();
    return removed;
  },

  exportBackup: async (pin?: string) => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');

    // A record that will not decrypt is silently absent from `listRecords`, so
    // exporting while the vault holds one writes the loss into the backup and
    // makes it permanent. Refuse, and point at the screen that names them.
    const failures: ReadFailure[] = [];
    const payload: Record<string, unknown[]> = {};
    for (const type of Object.values(STORE)) {
      payload[type] = await listRecords(key, type, vaultId, failures);
    }
    if (failures.length > 0) {
      throw new BackupError(
        'unreadable',
        `${failures.length} record${failures.length === 1 ? '' : 's'} in this vault cannot be read, and a backup taken now would not contain ${failures.length === 1 ? 'it' : 'them'}. Open Diagnostics to see which.`,
      );
    }

    const body = { vaultId, exportedAt: Date.now(), data: payload };

    if (!pin) {
      // Legacy v1: encrypted with the vault's own key, so it can only ever be
      // restored into the vault that wrote it. Kept for callers that predate
      // the PIN prompt; the UI always passes a PIN.
      const enc = await encryptJson(key, { ...body, v: 1 });
      return bufToB64(new TextEncoder().encode(JSON.stringify(enc)).buffer);
    }
    return encodeBackup(body, pin, SCHEMA_VERSION, APP_VERSION);
  },

  importBackup: async (b64, pin, mode = 'replace') => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');

    // Every gate runs before anything is written. `decodeBackup` reads and
    // validates; the vault is untouched until it returns cleanly (§6.1).
    const decoded = await decodeBackup(b64, pin, key, SCHEMA_VERSION);
    const parsed = decoded.body as unknown as { data: Record<string, { id: string }[]> };

    /*
     * The ledger the file claims to hold must actually balance. A backup that
     * restores into a broken book is not a recovery, and finding out after the
     * swap is too late.
     *
     * Only the *structural* checks gate the restore (`restoreBlockers`). This
     * used to be every error-level check, which meant a check about data the
     * user had not typed yet could refuse an intact file — and `fxRates` was
     * not passed here, so `fx-current` saw no rates at all and rejected every
     * backup holding a single foreign position. Both halves are fixed: the
     * rates the file carries are handed to the checker, and the gate no longer
     * cares what that checker concludes about them.
     */
    const incoming = <T,>(type: string) => (parsed.data[type] ?? []) as unknown as T[];
    const failed = restoreBlockers(runDiagnostics({
      txns: incoming<Txn>(STORE.txn),
      transfers: incoming<Transfer>(STORE.transfer),
      postings: incoming<Posting>(STORE.posting),
      accounts: incoming<Account>(STORE.account),
      categories: incoming<Category>(STORE.category),
      holdings: incoming<Holding>(STORE.holding),
      dividends: incoming<Dividend>(STORE.dividend),
      lots: incoming<HoldingLot>(STORE.lot),
      fxRates: incoming<FxRate>(STORE.fxRate),
    }));
    if (failed.length > 0) {
      // Every reason, not just the first: fixing one and being told about the
      // next is a worse afternoon than being told about both now.
      const reasons = failed.map((c) => `${c.label}: ${c.detail}`).join('; ');
      throw new BackupError(
        'unreadable',
        `This backup does not pass its own integrity checks (${reasons}) so it has not been restored. Your vault is unchanged.`,
      );
    }
    /*
     * Profile reconciliation.
     *
     * Every record is profile-scoped, and `reload` reads only the active
     * profile (`(r.profileId ?? default) === active`). Profile ids are random
     * per vault, so importing a backup verbatim wrote 367 perfectly good
     * records under an id this device has never heard of — present in the
     * vault, invisible on every screen, under a second profile with the same
     * name as the one you were looking at.
     *
     * So profiles are matched on what actually identifies them to a person —
     * name and kind — and the incoming ids are rewritten to the local ones.
     * "Personal" from the Mac lands in "Personal" here instead of beside it.
     */
    const incomingProfiles = (parsed.data[STORE.profile] ?? []) as unknown as Profile[];
    const localProfiles = await listRecords<Profile>(key, STORE.profile, vaultId);
    const sameProfile = (a: Profile, b: Profile) =>
      a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.kind === b.kind;

    const profileIdMap = new Map<string, string>();
    const absorbed = new Set<string>();
    for (const p of incomingProfiles) {
      const match = localProfiles.find((l) => sameProfile(l, p));
      if (match) {
        profileIdMap.set(p.id, match.id);
        absorbed.add(p.id); // don't write a duplicate profile row
      }
    }

    const { activeProfileId } = get();
    const knownLocally = new Set(localProfiles.map((p) => p.id));
    /**
     * Where a record should live. An id we mapped wins; an id this vault
     * already knows is kept; anything else — a backup with no profile records,
     * or a profile that was deleted — falls back to the profile in front of
     * the user, because silently invisible data is the worse failure.
     */
    const remap = (pid: string | undefined): string | undefined => {
      if (!pid) return pid;
      const mapped = profileIdMap.get(pid);
      if (mapped) return mapped;
      if (knownLocally.has(pid)) return pid;
      if (incomingProfiles.some((p) => p.id === pid)) return pid; // its profile ships with it
      return activeProfileId;
    };

    const mutations: Mutation[] = [];

    /*
     * Replace, not merge.
     *
     * Restoring used to write the backup's records over the live vault and
     * leave everything else in place, which is a merge wearing the word
     * "restore": records deleted since the backup came back from the dead, and
     * a failure partway through left a half-and-half vault with no way back.
     * `replace` clears the vault first so what you get is the book you exported.
     * `merge` is still available for pulling a second device's data in.
     */
    if (mode === 'replace') {
      for (const type of Object.values(STORE)) {
        for (const rec of await listRecords<{ id: string }>(key, type, vaultId)) {
          mutations.push({ op: 'delete', type, id: rec.id });
        }
      }
    }

    let count = 0;
    for (const type of Object.values(STORE)) {
      for (const rec of parsed.data[type] ?? []) {
        if (type === STORE.profile && absorbed.has(rec.id)) continue;
        const scoped = rec as { id: string; profileId?: string };
        mutations.push({
          op: 'put', type, id: rec.id,
          value: {
            ...rec,
            vaultId,
            ...(('profileId' in scoped) ? { profileId: remap(scoped.profileId) } : {}),
          },
        });
        count++;
      }
    }

    /*
     * Put back the local profile rows the records still point at.
     *
     * The clear pass above deletes every profile row, and an incoming profile
     * that was absorbed is skipped on the way back in — so after a replace,
     * nothing rewrites the row whose id remapping just stamped onto all 367
     * records. `reload` then finds no profiles at all, seeds a fresh one with
     * a new id, and filters the entire restore off every screen: "Restored 367
     * records" followed by an empty Transactions page. The same symptom the
     * remapping above exists to prevent, arriving by the opposite route.
     *
     * Only rows something actually references are kept, so a local profile the
     * backup has no data for is still cleared — replace stays replace.
     */
    if (mode === 'replace') {
      const written = new Set(
        mutations.filter((m) => m.op === 'put' && m.type === STORE.profile).map((m) => m.id),
      );
      const referenced = new Set(
        mutations.flatMap((m) => (m.op === 'put'
          ? [(m.value as { profileId?: string }).profileId]
          : [])).filter((p): p is string => p != null),
      );
      for (const p of localProfiles) {
        if (referenced.has(p.id) && !written.has(p.id)) {
          mutations.push({ op: 'put', type: STORE.profile, id: p.id, value: { ...p, vaultId } });
        }
      }
    }

    // One transaction: the vault is either the old book or the new one, never
    // a mixture. This is the webapp's equivalent of the plan's "restore to a
    // new database and swap" — there is no second database to stage into, so
    // the atomicity comes from the write itself.
    await applyMutations(key, vaultId, mutations);

    // An older backup's records are in an older shape; bring them forward
    // before anything reads them.
    if (decoded.schemaVersion != null && decoded.schemaVersion < SCHEMA_VERSION) {
      await runMigrations(decoded.schemaVersion, key, vaultId);
    }

    await get().reload();
    return count;
  },

  wipe: async () => {
    const { vaultId } = get();
    await clearVault(vaultId);
    set({ activeProfileId: '' });
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ACTIVE_PROFILE_KEY);
    await get().reload();
  },
}));
