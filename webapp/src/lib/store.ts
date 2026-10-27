'use client';
import { create } from 'zustand';
import { db, persistenceState, requestPersistence, type PersistenceState } from './db';
import { deriveKey, encryptJson, decryptJson, randomBytes, bufToB64, b64ToBuf, type Encrypted } from './crypto';
import { BackupError } from './backupError';
import {
  planCaptures, staleCaptureIds, approvalRecords, rejectionRecord,
  type CaptureInput, type CaptureOutcome, type CaptureEdits,
} from '@khazana/screens/lib/capture';
import { decodeBackup, encodeBackup } from './backupFormat';
import {
  clearVault, listRecords, listRecordIds, getRecord, putRecord, deleteRecord, applyMutations,
  applySync, listTombstones, observeStamp, userRecordCount,
  type Mutation, type ReadFailure,
} from './repo';
import {
  LOCAL_ONLY_TYPES, buildBundle, decodeSyncFile, encodeSyncFile, planSync, syncFileName,
  SyncFileError, type SyncPayload,
} from './syncFile';
import { D, ZERO } from '@khazana/domain/money';
import {
  STORE, PROFILE_SCOPED, isSpending,
  type Budget, type Category, type Goal, type Holding, type Liability,
  type RecurringRule, type Txn, type Profile, type ProfileKind, type Insurance, type NetWorthSnapshot,
  type ImportBatch, type HoldingLot,
  type Account, type Posting, type Transfer, type PendingCapture,
  type WatchItem, type Dividend, type Alert, type FxRate,
} from '@khazana/domain/types';
import { materialize, advance } from '@khazana/domain/recurrence';
import { postingsForEntry, postingsForTransfer, accountBalances, liquidBalance } from '@khazana/domain/accountLedger';
import Decimal from 'decimal.js';
import { healthScore } from '@khazana/domain/health';
import { investmentTotals } from '@khazana/domain/investmentTotals';
import { runDiagnostics, restoreBlockers } from '@khazana/domain/diagnostics';

import { uid, cashAcctId, DEFAULT_CATEGORIES } from '@khazana/screens/lib/storeHelpers';
import { LAST_ACCOUNT_KEY } from '@khazana/screens/lib/prefs';
import type { ThemeChoice, AccentName, KhazanaStore } from '@khazana/screens/store';
import { ACCENTS } from '@khazana/domain/appearance';
import { contraAccountFor, supersedeMutations as supersede } from '@khazana/domain/vaultWrites';

// Definitions live in @khazana/screens so the shared screens and this store
// cannot disagree; re-exported because the rest of the app imports them here.
export { uid, cashAcctId, DEFAULT_CATEGORIES, LAST_ACCOUNT_KEY };

/** The shared screens' contract: this store must satisfy it (checked at compile time). */
export const asKhazanaStore = (s: AppState): KhazanaStore => s;
export type { ThemeChoice, AccentName };

const VAULT_ID = 'default';

/**
 * Stamped into every backup header so a file can name the build that wrote it,
 * and onto every exported report so a figure can be traced to a build.
 *
 * Exported rather than copied: `tool/check_versions.sh` asserts five files state
 * the same version, and a sixth literal elsewhere in the app would sit outside
 * that check and drift silently.
 */
export const APP_VERSION = '1.0.0';
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
    ], { preserve: true });
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

// Canonical in @khazana/domain (vaultWrites.ts); see there for why changing an entry's kind retires the old record.
export const supersedeMutations = supersede;

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
  await applyMutations(key, vaultId, structuralAccountMutations(vaultId, profileId, existing), { preserve: true });
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
  await applyMutations(key, vaultId, entryPostingMutations(vaultId, profileId, t, categoryNames, existing), { preserve: true });
}

async function writeTransferPostings(
  key: CryptoKey, vaultId: string, profileId: string, t: Transfer,
): Promise<void> {
  await applyMutations(key, vaultId, transferPostingMutations(vaultId, profileId, t), { preserve: true });
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
    } satisfies Account, { preserve: true });
    existing.add(expenseAcctId(profileId, c.id));
  }
  await ensureStructuralAccounts(key, vaultId, profileId, existing);
  for (const t of txns) {
    await writeEntryPostings(key, vaultId, profileId, t, names, existing);
    if (!t.accountId) {
      await putRecord(key, STORE.txn, vaultId, t.id, { ...t, accountId: cashId, profileId: t.profileId ?? profileId }, { preserve: true });
    }
  }
}


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
  persistence: PersistenceState;
  /**
   * Encrypted records found with no vault row to open them (no salt). Setup
   * is refused while this is > 0: a new vault would write a new salt over the
   * same store and bury them for good. See `setAsideStranded`.
   */
  strandedRecords: number;
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
  /** Sets or clears (null) a profile's photo. */
  setProfilePhoto: (id: string, photo: string | null) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  captureSnapshot: () => Promise<void>;
  reload: () => Promise<void>;
  put: (type: string, value: { id: string } & Record<string, unknown>) => Promise<void>;
  /** Many records as one atomic batch and one reload. See `putMany` below. */
  putMany: (entries: { type: string; value: { id: string } & Record<string, unknown> }[]) => Promise<void>;
  del: (type: string, id: string) => Promise<void>;
  /**
   * Parses bank messages into review-inbox drafts. The text is never stored;
   * see `lib/capture.ts`. Also clears decided captures past their dedup window.
   */
  addCaptures: (inputs: CaptureInput[]) => Promise<CaptureOutcome[]>;
  /** This device's sync settings, or null when sync is off. */
  getSyncConfig: () => Promise<SyncConfig | null>;
  setSyncConfig: (c: SyncConfig | null) => Promise<void>;
  /**
   * Merges other devices' sync files into this vault and returns this
   * device's file to write back. See `lib/syncFile.ts`.
   */
  syncWith: (files: { name: string; text: string }[], opts?: { confirmSeparate?: boolean }) => Promise<SyncReport>;
  /** Records that this device's file now holds `digest`, so an unchanged vault is not rewritten. */
  markSyncWritten: (digest: string) => Promise<void>;
  /** Writes each capture's transaction and marks it decided, in one batch. */
  approveCaptures: (items: { id: string; edits?: CaptureEdits }[]) => Promise<void>;
  rejectCapture: (id: string) => Promise<void>;
  reassignTxnAccounts: (fromAccountId: string, toAccountId: string) => Promise<number>;
  putAttachment: (file: File) => Promise<string>;
  getAttachmentUrl: (id: string) => Promise<string | null>;
  processRecurring: () => Promise<number>;
  /**
   * Posts ONE occurrence of ONE rule, and advances only that rule.
   *
   * `processRecurring` is all-or-nothing: it posts every rule that is due. That
   * is wrong whenever one obligation has landed and the others have not — a
   * salary credited late is the common case, and running the batch to capture
   * it also posts the broadband bill that has not actually gone out yet.
   *
   * `date` and `amount` override the schedule because the schedule is a
   * prediction, not a record. A salary due on the 7th that arrives on the 10th
   * happened on the 10th, and pay that varies with a bonus or arrears is not
   * the figure written on the rule.
   */
  postRecurringOnce: (
    ruleId: string,
    opts?: { date?: number; amount?: string },
  ) => Promise<boolean>;
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
  /** Moves stranded records out of the way (kept, not deleted) so setup can run. */
  setAsideStranded: () => Promise<void>;
}


/** Per-device sync settings. Stored encrypted in the vault row, never in a record or a backup. */
export interface SyncConfig {
  /** Shared by every device; derives each sync file's key. Not the PIN. */
  passphrase: string;
  /** Random, and this device's file name. */
  deviceId: string;
  deviceName: string;
  lastSyncAt: number | null;
  /** SHA-256 of the last bundle written, so an unchanged vault is not rewritten. */
  lastDigest?: string;
}

export interface SyncDevice { deviceId: string; deviceName: string; exportedAt: number }

export interface SyncReport {
  /**
   * This device has data and has never synced, and the other devices' data
   * shares no profile with it: two separate histories. Nothing was written;
   * the caller asks before running again with `confirmSeparate`.
   */
  needsConfirm: boolean;
  /**
   * This device's file, or null when it has not changed since the last write.
   * Once it is safely written, pass `digest` to `markSyncWritten`.
   */
  own: { name: string; text: string; digest: string } | null;
  devices: SyncDevice[];
  /** Files that could not be opened, by name. */
  errors: { name: string; message: string }[];
  /** Records written or removed here. */
  changed: number;
  /** Devices whose files were too old to merge safely. */
  stale: string[];
}
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
 * One-time marker for the Zentra redesign. Accents picked before it (Jade,
 * Sapphire, …) painted the nav and primary buttons in a colour the new
 * near-black pill was never designed around, so every existing install is
 * reset to 'default' exactly once. Once the marker is set the accent is never
 * touched again: a choice made after the redesign is the user's to keep.
 *
 * The no-FOUC script in app/layout.tsx runs the same migration before first
 * paint (it can't import this), so the old accent never flashes on load.
 */
export const ACCENT_MIGRATION_KEY = 'khazana-accent-zentra';
/**
 * Ghost mode (amounts masked). Persisted because the reason someone hides their
 * balances — an open-plan desk, a commute, a shared screen — is still true the
 * next time they open the app. Not a vault secret: it records that the figures
 * were hidden, never what they were.
 */
const GHOST_KEY = 'khazana-ghost';
/** Account the add-transaction form defaults to. A convenience, not vault data. */

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


// The accent table (ACCENTS) is canonical in @khazana/domain/appearance. Any change
// there must be mirrored in the no-FOUC script in app/layout.tsx.
export { ACCENTS };

/**
 * Resets a pre-Zentra accent to 'default', once per browser (see
 * ACCENT_MIGRATION_KEY). Touches only the accent preference — never vault,
 * profile or any other stored data. Silent when storage is unavailable or
 * blocked: the worst case is the old accent surviving, never a crash.
 */
export function migrateLegacyAccent(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(ACCENT_MIGRATION_KEY) === '1') return;
    localStorage.setItem(ACCENT_KEY, 'default');
    localStorage.setItem(ACCENT_MIGRATION_KEY, '1');
  } catch { /* storage blocked or full — leave things as they are */ }
}

function applyAccent(name: string, dark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const a = (ACCENTS as Record<string, (typeof ACCENTS)[keyof typeof ACCENTS]>)[name];
  if (!a) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-deep');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-on');
    return;
  }
  const [c, d, g] = dark ? a.dark : a.light;
  root.style.setProperty('--accent', c);
  root.style.setProperty('--accent-deep', d);
  root.style.setProperty('--accent-glow', g);
  if (a.on) root.style.setProperty('--accent-on', dark ? a.on.dark : a.on.light);
  else root.style.removeProperty('--accent-on');
}

/** Records belonging to THE vault — set-aside ones live under another id. */
const vaultRecordCount = () => db.records.where('vaultId').equals(VAULT_ID).count();

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
  persistence: 'unsupported',
  strandedRecords: 0,
  pinFailures: 0,
  lockedOutUntil: 0,

  init: async () => {
    const meta = await db.vaults.get(VAULT_ID);
    // No vault row is not proof of no data — check the records themselves.
    const strandedRecords = meta ? 0 : await vaultRecordCount();
    const cur = lsGet(CURRENCY_KEY) ?? 'INR';
    const theme = (lsGet(THEME_KEY) as ThemeChoice) ?? 'system';
    migrateLegacyAccent();
    const accent = (lsGet(ACCENT_KEY) as AccentName) ?? 'default';
    const ghost = lsGet(GHOST_KEY) === '1';
    set({
      status: meta ? 'locked' : 'uninitialized',
      strandedRecords,
      currencyCode: cur,
      theme,
      accent,
      ghost,
      pinFailures: Number(lsGet(PIN_FAILURES_KEY) ?? 0) || 0,
      lockedOutUntil: Number(lsGet(LOCKOUT_UNTIL_KEY) ?? 0) || 0,
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
      // Never over existing data. A vault row means a vault already exists;
      // records without one are stranded data. Either way a fresh salt here
      // would make what is already stored permanently unreadable.
      const existing = await db.vaults.get(VAULT_ID);
      const records = await vaultRecordCount();
      if (existing || records > 0) {
        set({
          status: existing ? 'locked' : 'uninitialized',
          strandedRecords: existing ? 0 : records,
          error: existing
            ? 'A vault already exists in this browser. Unlock it with your PIN.'
            : 'Data from an earlier vault is still in this browser. Nothing was changed.',
        });
        return;
      }
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
      if (!meta) {
        set({ status: 'uninitialized', strandedRecords: await vaultRecordCount() });
        return;
      }
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
      // Asked on every unlock, not only at setup: vaults created before the
      // request existed were never asked, and an unpersisted vault is one the
      // browser may evict under storage pressure — with it, every record.
      void requestPersistence().then((persistence) => set({ persistence }));
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

  setProfilePhoto: async (id, photo) => {
    const { key, vaultId, profiles } = get();
    if (!key) return;
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    await putRecord(key, STORE.profile, vaultId, id, { ...p, photo });
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
  getSyncConfig: async () => {
    const { key } = get();
    if (!key) return null;
    const meta = await db.vaults.get(VAULT_ID);
    if (!meta?.sync) return null;
    try {
      return await decryptJson<SyncConfig>(key, meta.sync);
    } catch {
      return null;
    }
  },

  setSyncConfig: async (c) => {
    const { key } = get();
    if (!key) throw new Error('locked');
    await db.vaults.update(VAULT_ID, { sync: c ? await encryptJson(key, c) : undefined });
  },

  syncWith: async (files, opts = {}) => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');
    const cfg = await get().getSyncConfig();
    if (!cfg) throw new Error('Sync is not set up on this device.');
    const now = Date.now();

    // 1. Open the other devices' files. One bad file does not stop the rest.
    const errors: SyncReport['errors'] = [];
    const remotes: SyncPayload[] = [];
    for (const f of files) {
      if (f.name === syncFileName(cfg.deviceId)) continue;
      try {
        remotes.push(await decodeSyncFile(f.text, cfg.passphrase, SCHEMA_VERSION));
      } catch (e) {
        errors.push({ name: f.name, message: e instanceof SyncFileError ? e.message : 'Could not be read.' });
      }
    }
    const devices = remotes.map((r) => ({ deviceId: r.deviceId, deviceName: r.deviceName, exportedAt: r.exportedAt }));

    // 2. This vault as a bundle. Like export, refuse while anything is
    //    unreadable: a record missing from our file reads as "never existed".
    const failures: ReadFailure[] = [];
    const records: { type: string; value: { id: string } & Record<string, unknown> }[] = [];
    for (const type of Object.values(STORE)) {
      if (LOCAL_ONLY_TYPES.has(type)) continue;
      for (const value of await listRecords<{ id: string } & Record<string, unknown>>(key, type, vaultId, failures)) {
        records.push({ type, value });
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} record${failures.length === 1 ? '' : 's'} in this vault cannot be read. Open Diagnostics before syncing.`);
    }
    const local = buildBundle(records, await listTombstones(vaultId));

    // 3. A first sync either joins (empty vault) or, if both sides have
    //    unrelated data, asks first.
    const firstSync = cfg.lastSyncAt == null;
    const joining = firstSync && (await userRecordCount(vaultId)) === 0;
    if (firstSync && !joining && !opts.confirmSeparate && remotes.length > 0) {
      const mine = new Set(local.records.filter((r) => r.type === STORE.profile).map((r) => r.id));
      const shared = remotes.some((r) => r.bundle.records.some((x) => x.type === STORE.profile && mine.has(x.id)));
      if (!shared) return { needsConfirm: true, own: null, devices, errors, changed: 0, stale: [] };
    }

    const plan = planSync(local, remotes, { now, joining });

    // 4. Apply, rebuilding the ledger legs of every entry that changed.
    const merged = new Map(plan.merged.records.map((r) => [`${r.type} ${r.id}`, r.value]));
    const mergedOf = <T,>(type: string) =>
      plan.merged.records.filter((r) => r.type === type).map((r) => r.value as unknown as T);
    const categoryNames = new Map(mergedOf<Category>(STORE.category).map((c) => [c.id, c.name]));
    const accountIds = new Set(mergedOf<Account>(STORE.account).map((a) => a.id));
    const fallbackProfile = mergedOf<Profile>(STORE.profile).sort((a, b) => a.createdAt - b.createdAt)[0]?.id ?? 'default';

    const mutations: Mutation[] = [];
    for (const u of plan.upserts) {
      mutations.push({ op: 'put', type: u.type, id: u.id, value: u.value });
      if (u.type === STORE.txn) {
        const t = u.value as unknown as Txn;
        mutations.push(...entryPostingMutations(vaultId, t.profileId ?? fallbackProfile, t, categoryNames, accountIds));
      } else if (u.type === STORE.transfer) {
        const t = u.value as unknown as Transfer;
        mutations.push(...transferPostingMutations(vaultId, t.profileId ?? fallbackProfile, t));
      }
    }
    for (const d of plan.deletes) {
      mutations.push({ op: 'delete', type: d.type, id: d.id });
      const stillEntry = merged.has(`${STORE.txn} ${d.id}`) || merged.has(`${STORE.transfer} ${d.id}`);
      if ((d.type === STORE.txn || d.type === STORE.transfer) && !stillEntry) {
        mutations.push(
          { op: 'delete', type: STORE.posting, id: `${d.id}:dr` },
          { op: 'delete', type: STORE.posting, id: `${d.id}:cr` },
        );
      }
    }
    await applySync(key, vaultId, mutations, plan.tombstones);
    observeStamp(plan.maxRemoteStamp);

    // 5. This device's file, unless nothing changed since the last write.
    const digest = bufToB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(plan.merged))));
    let own: SyncReport['own'] = null;
    if (digest !== cfg.lastDigest || files.every((f) => f.name !== syncFileName(cfg.deviceId))) {
      own = {
        name: syncFileName(cfg.deviceId),
        digest,
        text: await encodeSyncFile({
          deviceId: cfg.deviceId, deviceName: cfg.deviceName, exportedAt: now,
          schemaVersion: SCHEMA_VERSION, bundle: plan.merged,
        }, cfg.passphrase),
      };
    }
    await get().setSyncConfig({ ...cfg, lastSyncAt: now });
    if (mutations.length > 0) await get().reload();
    return { needsConfirm: false, own, devices, errors, changed: plan.upserts.length + plan.deletes.length, stale: plan.stale };
  },

  markSyncWritten: async (digest) => {
    const cfg = await get().getSyncConfig();
    if (cfg) await get().setSyncConfig({ ...cfg, lastDigest: digest });
  },

  addCaptures: async (inputs) => {
    const { key, vaultId } = get();
    if (!key || inputs.length === 0) return [];
    const now = Date.now();
    const state = get();
    // Every capture, not just the active profile's: a message already captured
    // under another profile is still a duplicate.
    const existing = await listRecords<PendingCapture>(key, STORE.pendingCapture, vaultId);
    const plan = await planCaptures(inputs, {
      vaultId, now, existing, txns: state.txns, categories: state.categories, newId: uid,
    });
    const accounts = accountIdSet(state);
    const mutations: Mutation[] = [
      ...plan.captures.flatMap((c) =>
        entryMutations(state, STORE.pendingCapture, c as unknown as PendingCapture & Record<string, unknown>, accounts)),
      ...staleCaptureIds(existing, now).map((id): Mutation => ({ op: 'delete', type: STORE.pendingCapture, id })),
    ];
    if (mutations.length > 0) {
      await applyMutations(key, vaultId, mutations);
      await get().reload();
    }
    return plan.outcomes;
  },

  approveCaptures: async (items) => {
    const { key, vaultId } = get();
    if (!key || items.length === 0) return;
    const now = Date.now();
    const state = get();
    const accounts = accountIdSet(state);
    const mutations: Mutation[] = [];
    for (const { id, edits } of items) {
      const c = state.pendingCaptures.find((p) => p.id === id);
      if (!c || (c.status ?? 'pending') !== 'pending') continue;
      const { txn, capture } = approvalRecords(c, edits ?? {}, { now, txnId: uid() });
      // The transaction and the decision land together: a capture marked
      // approved with no transaction behind it would hide a real spend.
      mutations.push(
        ...entryMutations(state, STORE.txn, txn as unknown as Txn & Record<string, unknown>, accounts),
        ...entryMutations(state, STORE.pendingCapture, capture as unknown as PendingCapture & Record<string, unknown>, accounts),
      );
    }
    if (mutations.length === 0) return;
    await applyMutations(key, vaultId, mutations);
    await get().reload();
  },

  rejectCapture: async (id) => {
    const c = get().pendingCaptures.find((p) => p.id === id);
    if (!c) return;
    await get().put(STORE.pendingCapture, rejectionRecord(c, Date.now()) as unknown as PendingCapture & Record<string, unknown>);
  },

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

  postRecurringOnce: async (ruleId, opts) => {
    const { key, vaultId, activeProfileId, recurring, categories, accounts } = get();
    if (!key) return false;
    const rule = recurring.find((r) => r.id === ruleId);
    if (!rule) return false;

    const names = new Map(categories.map((c) => [c.id, c.name]));
    const existing = new Set(accounts.map((a) => a.id));

    // Defaults to the occurrence the rule is actually waiting on, so posting
    // without overrides matches what the batch run would have produced.
    const when = opts?.date ?? rule.nextRun;
    const amount = opts?.amount ?? rule.amount;

    const t: Txn = {
      id: uid(), vaultId, profileId: activeProfileId, amount, type: rule.type,
      categoryId: rule.categoryId, merchant: rule.merchant ?? null,
      note: 'Recurring', date: when, createdAt: Date.now(),
      accountId: rule.accountId ?? cashAcctId(activeProfileId),
    };
    await putRecord(key, STORE.txn, vaultId, t.id, t);
    await writeEntryPostings(key, vaultId, activeProfileId, t, names, existing);

    // Advances from the SCHEDULED date, never from the date it was posted on.
    // Stepping from an actual late payment would drag every future occurrence
    // along with it — a salary paid three days late would permanently become a
    // rule dated the 10th rather than one that was simply late once.
    await putRecord(key, STORE.recurring, vaultId, rule.id, {
      ...rule, nextRun: advance(rule.nextRun, rule.frequency),
    });

    await get().reload();
    return true;
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
    //
    // Preserved stamps and no tombstones: a restore is not the user editing
    // every record now, and must not tell other devices to delete what the
    // backup happens not to contain.
    await applyMutations(key, vaultId, mutations, { preserve: true });

    // An older backup's records are in an older shape; bring them forward
    // before anything reads them.
    if (decoded.schemaVersion != null && decoded.schemaVersion < SCHEMA_VERSION) {
      await runMigrations(decoded.schemaVersion, key, vaultId);
    }

    await get().reload();
    return count;
  },

  setAsideStranded: async () => {
    // Re-tagged, not deleted: the records stay in this browser under a vault id
    // nothing opens, so they can still be recovered if their salt turns up.
    const aside = `set-aside-${Date.now()}`;
    await db.transaction('rw', db.records, db.tombstones, async () => {
      await db.records.where('vaultId').equals(VAULT_ID).modify({ vaultId: aside });
      await db.tombstones.where('vaultId').equals(VAULT_ID).modify({ vaultId: aside });
    });
    set({ strandedRecords: 0, error: null, status: 'uninitialized' });
  },

  wipe: async () => {
    const { vaultId } = get();
    await clearVault(vaultId);
    set({ activeProfileId: '' });
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ACTIVE_PROFILE_KEY);
    await get().reload();
  },
}));
