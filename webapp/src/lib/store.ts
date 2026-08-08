'use client';
import { create } from 'zustand';
import { db } from './db';
import { deriveKey, encryptJson, decryptJson, randomBytes, bufToB64, b64ToBuf, type Encrypted } from './crypto';
import { BackupError } from './backupError';
import { clearVault, listRecords, getRecord, putRecord, deleteRecord } from './repo';
import { D, ZERO } from './money';
import {
  STORE, PROFILE_SCOPED,
  type Budget, type Category, type Goal, type Holding, type Liability,
  type RecurringRule, type Txn, type Profile, type ProfileKind, type Insurance, type NetWorthSnapshot,
  type Account, type Posting, type Transfer, type PendingCapture,
  type WatchItem, type Dividend, type Alert,
} from './types';
import { materialize } from '@/domain/recurrence';
import { postingsForEntry, postingsForTransfer, accountBalances, liquidBalance } from '@/domain/accountLedger';
import Decimal from 'decimal.js';
import { healthScore } from '@/domain/health';
import { investmentTotals } from '@/domain/investmentTotals';

const VAULT_ID = 'default';
const VERIFIER = 'FTOS-OK';

// Bump when the persisted data shape changes; add a step in runMigrations().
const SCHEMA_VERSION = 2;

async function runMigrations(from: number, key: CryptoKey, vaultId: string): Promise<void> {
  let v = from;
  if (v < 2) {
    await repairPostings(key, vaultId);
    v = 2;
  }
  void v;
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

/// Deterministic v3 account ids — keep the lazy backfill idempotent and isolated
/// per profile (matches the Flutter Drift migration).
export const cashAcctId = (profileId: string) => `acct-cash-${profileId}`;
const openingAcctId = (profileId: string) => `acct-opening-${profileId}`;
const incomeAcctId = (profileId: string) => `acct-income-${profileId}`;
const expenseAcctId = (profileId: string, categoryId: string) => `acct-exp-${profileId}-${categoryId}`;

/**
 * Seeds the accounts every profile has regardless of what it has recorded.
 * A brand-new vault needs these before it has a single transaction, or the
 * Accounts page opens empty.
 */
async function ensureStructuralAccounts(
  key: CryptoKey, vaultId: string, profileId: string, existing: Set<string>,
): Promise<void> {
  const base = { vaultId, profileId, openingBalance: '0' };
  const structural: Account[] = [
    { ...base, id: cashAcctId(profileId), name: 'Cash', type: 'asset', subtype: 'cash' },
    { ...base, id: openingAcctId(profileId), name: 'Opening Balances', type: 'equity', subtype: 'equity' },
    { ...base, id: incomeAcctId(profileId), name: 'Income', type: 'income', subtype: 'income' },
  ];
  for (const a of structural) {
    if (existing.has(a.id)) continue;
    existing.add(a.id);
    await putRecord(key, STORE.account, vaultId, a.id, a);
  }
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
async function writeEntryPostings(
  key: CryptoKey, vaultId: string, profileId: string, t: Txn,
  categoryNames: Map<string, string>, existing: Set<string>,
): Promise<void> {
  await ensureStructuralAccounts(key, vaultId, profileId, existing);
  if (t.type === 'expense' && !existing.has(expenseAcctId(profileId, t.categoryId))) {
    existing.add(expenseAcctId(profileId, t.categoryId));
    await putRecord(key, STORE.account, vaultId, expenseAcctId(profileId, t.categoryId), {
      id: expenseAcctId(profileId, t.categoryId), vaultId, profileId,
      name: categoryNames.get(t.categoryId) ?? 'Expense',
      type: 'expense', subtype: 'expense', openingBalance: '0',
    } satisfies Account);
  }

  const legs = postingsForEntry({
    entryId: t.id, vaultId, amount: t.amount, type: t.type,
    moneyAccountId: t.accountId ?? cashAcctId(profileId),
    categoryAccountId: t.type === 'income' ? incomeAcctId(profileId) : expenseAcctId(profileId, t.categoryId),
  });
  for (const leg of legs) {
    await putRecord(key, STORE.posting, vaultId, leg.id, { ...leg, profileId });
  }
}

/** Persists a transfer's two legs. Ids are deterministic, so edits overwrite. */
async function writeTransferPostings(
  key: CryptoKey, vaultId: string, profileId: string, t: Transfer,
): Promise<void> {
  for (const leg of postingsForTransfer(t)) {
    await putRecord(key, STORE.posting, vaultId, leg.id, { ...leg, profileId });
  }
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
  txns: Txn[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  holdings: Holding[];
  liabilities: Liability[];
  recurring: RecurringRule[];
  insurances: Insurance[];
  snapshots: NetWorthSnapshot[];
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
  liabilities: [], recurring: [], insurances: [], snapshots: [],
  accounts: [], postings: [], transfers: [], pendingCaptures: [],
  watchlist: [], dividends: [], alerts: [],
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
  del: (type: string, id: string) => Promise<void>;
  reassignTxnAccounts: (fromAccountId: string, toAccountId: string) => Promise<number>;
  putAttachment: (file: File) => Promise<string>;
  getAttachmentUrl: (id: string) => Promise<string | null>;
  processRecurring: () => Promise<number>;
  exportBackup: (pin?: string) => Promise<string>;
  importBackup: (b64: string, pin?: string) => Promise<number>;
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
/** Account the add-transaction form defaults to. A convenience, not vault data. */
export const LAST_ACCOUNT_KEY = 'khazana-last-account';

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

  init: async () => {
    const meta = await db.vaults.get(VAULT_ID);
    const cur = lsGet(CURRENCY_KEY) ?? 'INR';
    const theme = (lsGet(THEME_KEY) as ThemeChoice) ?? 'system';
    const accent = (lsGet(ACCENT_KEY) as AccentName) ?? 'default';
    set({ status: meta ? 'locked' : 'uninitialized', currencyCode: cur, theme, accent });
    applyAppearance();
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
    } catch (e) {
      set({ status: 'uninitialized', error: `Could not create vault: ${e}` });
    }
  },

  unlock: async (pin) => {
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
      await get().reload();
      set({ status: 'unlocked' });
      void get().captureSnapshot();
    } catch {
      set({ status: 'locked', error: 'Incorrect PIN.' });
    }
  },

  lock: () => set({ status: 'locked', key: null, ...emptyData, profiles: [] }),
  toggleGhost: () => set((s) => ({ ghost: !s.ghost })),
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
    const { key, vaultId } = get();
    if (!key) return;

    // Categories are vault-wide (shared across profiles); seed defaults once.
    let categories = await listRecords<Category>(key, STORE.category, vaultId);
    if (categories.length === 0) {
      for (const c of DEFAULT_CATEGORIES) {
        const cat: Category = { id: uid(), vaultId, name: c.name, icon: c.icon };
        await putRecord(key, STORE.category, vaultId, cat.id, cat);
      }
      categories = await listRecords<Category>(key, STORE.category, vaultId);
    }

    // Profiles: seed a default if none exist.
    let profiles = await listRecords<Profile>(key, STORE.profile, vaultId);
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
      transfersAll,
    ] = await Promise.all([
        listRecords<Txn>(key, STORE.txn, vaultId),
        listRecords<Budget>(key, STORE.budget, vaultId),
        listRecords<Goal>(key, STORE.goal, vaultId),
        listRecords<Holding>(key, STORE.holding, vaultId),
        listRecords<Liability>(key, STORE.liability, vaultId),
        listRecords<RecurringRule>(key, STORE.recurring, vaultId),
        listRecords<Insurance>(key, STORE.insurance, vaultId),
        listRecords<NetWorthSnapshot>(key, STORE.snapshot, vaultId),
        listRecords<PendingCapture>(key, STORE.pendingCapture, vaultId),
        listRecords<WatchItem>(key, STORE.watchItem, vaultId),
        listRecords<Dividend>(key, STORE.dividend, vaultId),
        listRecords<Alert>(key, STORE.alert, vaultId),
        listRecords<Transfer>(key, STORE.transfer, vaultId),
      ]);

    // Double-entry (v3): lazily backfill the active profile's chart of accounts
    // + postings the first time it has none, then read them back.
    let accountsAll = await listRecords<Account>(key, STORE.account, vaultId);
    if (!accountsAll.some(inProfile)) {
      await backfillDoubleEntry(key, vaultId, active, categories, txnsAll.filter(inProfile));
      accountsAll = await listRecords<Account>(key, STORE.account, vaultId);
    }
    const [txnsReloaded, postingsAll] = await Promise.all([
      listRecords<Txn>(key, STORE.txn, vaultId),
      listRecords<Posting>(key, STORE.posting, vaultId),
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
      accounts: accountsInProfile,
      postings: postingsAll.filter(inProfile),
      transfers: transfersAll.filter(inProfile).sort((a, b) => b.date - a.date),
      pendingCaptures: pendingAll.filter(inProfile),
      watchlist: watchAll.filter(inProfile).sort((a, b) => b.addedAt - a.addedAt),
      dividends: dividendsAll.filter(inProfile).sort((a, b) => b.payDate - a.payDate),
      alerts: alertsAll.filter(inProfile).sort((a, b) => b.createdAt - a.createdAt),
    });
  },

  put: async (type, value) => {
    const { key, vaultId, activeProfileId } = get();
    if (!key) return;
    const needsProfile = PROFILE_SCOPED.includes(type) && !value.profileId;
    const profileId = (value.profileId as string | undefined) ?? activeProfileId;
    let record = needsProfile ? { ...value, profileId } : value;

    // Double-entry (PRD §16): a transaction also moves a money account and
    // writes balanced postings, mirroring the Flutter LedgerWriter.
    if (type === STORE.txn) {
      record = { ...record, accountId: (value.accountId as string | undefined) ?? cashAcctId(profileId) };
      await putRecord(key, type, vaultId, value.id, record);
      const { categories, accounts } = get();
      await writeEntryPostings(
        key, vaultId, profileId, record as unknown as Txn,
        new Map(categories.map((c) => [c.id, c.name])),
        new Set(accounts.map((a) => a.id)),
      );
    } else if (type === STORE.transfer) {
      await putRecord(key, type, vaultId, value.id, record);
      await writeTransferPostings(key, vaultId, profileId, record as unknown as Transfer);
    } else {
      await putRecord(key, type, vaultId, value.id, record);
    }
    await get().reload();
  },

  del: async (type, id) => {
    const { key, vaultId } = get();
    // Drop an entry's postings alongside it. Both transactions and transfers
    // own two deterministically-named legs; orphaned legs would keep moving
    // account balances for a record that no longer exists.
    if ((type === STORE.txn || type === STORE.transfer) && key) {
      await deleteRecord(STORE.posting, `${id}:dr`);
      await deleteRecord(STORE.posting, `${id}:cr`);
    }
    await deleteRecord(type, id);
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
    const { key, vaultId } = get();
    if (!key) throw new Error('Vault is locked');
    const data = bufToB64(await file.arrayBuffer());
    const id = uid();
    await putRecord(key, STORE.attachment, vaultId, id, {
      id, mime: file.type || 'image/jpeg', data,
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
  exportBackup: async (pin?: string) => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');
    const payload: Record<string, unknown[]> = {};
    for (const type of Object.values(STORE)) {
      payload[type] = await listRecords(key, type, vaultId);
    }
    const body = { v: 2, vaultId, exportedAt: Date.now(), data: payload };

    if (!pin) {
      const enc = await encryptJson(key, { ...body, v: 1 });
      return bufToB64(new TextEncoder().encode(JSON.stringify(enc)).buffer);
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const portableKey = await deriveKey(pin, salt);
    const enc = await encryptJson(portableKey, body);
    const envelope = { v: 2, kdf: 'PBKDF2-SHA256', saltB64: bufToB64(salt.buffer), enc };
    return bufToB64(new TextEncoder().encode(JSON.stringify(envelope)).buffer);
  },

  importBackup: async (b64, pin) => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');

    let outer: { v?: number; saltB64?: string; enc?: unknown };
    try {
      outer = JSON.parse(new TextDecoder().decode(b64ToBuf(b64)));
    } catch {
      throw new BackupError('unreadable', 'That file is not a Khazana backup, or it was altered in transit. Re-export it and try again.');
    }

    // v2 is self-contained: its salt travels with it, so any vault can open it
    // given the PIN it was exported with. v1 has no salt and is decryptable
    // only by the vault that wrote it.
    let openWith: CryptoKey;
    let envelope: Encrypted;
    if (outer && outer.v === 2 && typeof outer.saltB64 === 'string') {
      if (!pin) {
        throw new BackupError('needs-pin', 'This backup needs the PIN it was exported with.');
      }
      openWith = await deriveKey(pin, new Uint8Array(b64ToBuf(outer.saltB64)));
      envelope = outer.enc as Encrypted;
    } else {
      openWith = key;
      envelope = outer as unknown as Encrypted;
    }

    let parsed: { data: Record<string, { id: string }[]> };
    try {
      parsed = await decryptJson<{ data: Record<string, { id: string }[]> }>(openWith, envelope);
    } catch {
      throw new BackupError(
        outer?.v === 2 ? 'wrong-pin' : 'wrong-vault',
        outer?.v === 2
          ? 'That PIN does not open this backup. It must be the PIN in use when the backup was exported, which is not necessarily your current one.'
          : 'This is an older backup that can only be restored into the exact vault that created it — the same browser or app install, never a second device. Export a new backup from that device to move the data.',
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

    let count = 0;
    for (const type of Object.values(STORE)) {
      for (const rec of parsed.data[type] ?? []) {
        if (type === STORE.profile && absorbed.has(rec.id)) continue;
        const scoped = rec as { id: string; profileId?: string };
        await putRecord(key, type, vaultId, rec.id, {
          ...rec,
          vaultId,
          ...(('profileId' in scoped) ? { profileId: remap(scoped.profileId) } : {}),
        });
        count++;
      }
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
