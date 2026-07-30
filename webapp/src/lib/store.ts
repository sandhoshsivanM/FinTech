'use client';
import { create } from 'zustand';
import { db } from './db';
import { deriveKey, encryptJson, decryptJson, randomBytes, bufToB64, b64ToBuf } from './crypto';
import { clearVault, listRecords, getRecord, putRecord, deleteRecord } from './repo';
import { D, ZERO } from './money';
import {
  STORE, PROFILE_SCOPED,
  type Budget, type Category, type Goal, type Holding, type Liability,
  type RecurringRule, type Txn, type Profile, type ProfileKind, type Insurance, type NetWorthSnapshot,
  type Account, type Posting, type PendingCapture,
} from './types';
import { materialize } from '@/domain/recurrence';
import { postingsForEntry } from '@/domain/accountLedger';

const VAULT_ID = 'default';
const VERIFIER = 'FTOS-OK';

// Bump when the persisted data shape changes; add a step in runMigrations().
const SCHEMA_VERSION = 1;

async function runMigrations(from: number, _key: CryptoKey, _vaultId: string): Promise<void> {
  let v = from;
  // if (v < 2) { /* transform records */ v = 2; }
  void v;
}

/// Deterministic v3 account ids — keep the lazy backfill idempotent and isolated
/// per profile (matches the Flutter Drift migration).
const cashAcctId = (profileId: string) => `acct-cash-${profileId}`;
const openingAcctId = (profileId: string) => `acct-opening-${profileId}`;
const incomeAcctId = (profileId: string) => `acct-income-${profileId}`;
const expenseAcctId = (profileId: string, categoryId: string) => `acct-exp-${profileId}-${categoryId}`;

/// Lazily migrates a profile to double-entry: seeds its chart of accounts and
/// converts each existing transaction into balanced postings, so net worth is
/// preserved. Mirrors AppDatabase._migrateToDoubleEntry on Flutter.
async function backfillDoubleEntry(
  key: CryptoKey, vaultId: string, profileId: string,
  categories: Category[], txns: Txn[],
): Promise<void> {
  const cashId = cashAcctId(profileId);
  const seed = (a: Account) => putRecord(key, STORE.account, vaultId, a.id, a);
  await seed({ id: cashId, vaultId, profileId, name: 'Cash', type: 'asset', subtype: 'cash', openingBalance: '0' });
  await seed({ id: openingAcctId(profileId), vaultId, profileId, name: 'Opening Balances', type: 'equity', subtype: 'equity', openingBalance: '0' });
  await seed({ id: incomeAcctId(profileId), vaultId, profileId, name: 'Income', type: 'income', subtype: 'income', openingBalance: '0' });
  for (const c of categories) {
    await seed({ id: expenseAcctId(profileId, c.id), vaultId, profileId, name: c.name, type: 'expense', subtype: 'expense', openingBalance: '0' });
  }
  for (const t of txns) {
    const contra = t.type === 'income' ? incomeAcctId(profileId) : expenseAcctId(profileId, t.categoryId);
    const legs = postingsForEntry({ entryId: t.id, vaultId, amount: t.amount, type: t.type, moneyAccountId: cashId, categoryAccountId: contra });
    for (const leg of legs) {
      await putRecord(key, STORE.posting, vaultId, leg.id, { ...leg, profileId });
    }
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
  pendingCaptures: PendingCapture[];
}

const emptyData: Data = {
  txns: [], categories: [], budgets: [], goals: [], holdings: [],
  liabilities: [], recurring: [], insurances: [], snapshots: [],
  accounts: [], postings: [], pendingCaptures: [],
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
  putAttachment: (file: File) => Promise<string>;
  getAttachmentUrl: (id: string) => Promise<string | null>;
  processRecurring: () => Promise<number>;
  exportBackup: () => Promise<string>;
  importBackup: (b64: string) => Promise<number>;
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
function lsGet(key: string): string | null {
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

export type ThemeChoice = 'light' | 'dark' | 'system';
export type AccentName = 'default' | 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';

// Each accent is tuned separately for light and dark so it always reads well.
// [accent, accent-deep, accent-glow]. 'default' (indigo) uses the CSS defaults.
export const ACCENTS: Record<Exclude<AccentName, 'default'>, {
  label: string; swatch: string; light: [string, string, string]; dark: [string, string, string];
}> = {
  emerald: { label: 'Emerald', swatch: '#1f8a5b', light: ['#1f8a5b', '#15724a', '#34c98a'], dark: ['#34c98a', '#1f8a5b', '#5ee0a8'] },
  blue: { label: 'Blue', swatch: '#2563eb', light: ['#2563eb', '#1d4ed8', '#60a5fa'], dark: ['#5b8cff', '#3b6ae0', '#93b4ff'] },
  violet: { label: 'Violet', swatch: '#6d5bd0', light: ['#6d5bd0', '#5a48b8', '#9d8df0'], dark: ['#9d8df0', '#7c6ae0', '#c2b6ff'] },
  amber: { label: 'Amber', swatch: '#b07d12', light: ['#b07d12', '#8a610b', '#e0a93a'], dark: ['#e0a93a', '#b07d12', '#f2c869'] },
  rose: { label: 'Rose', swatch: '#c0392f', light: ['#c0392f', '#9d2b22', '#e06a5a'], dark: ['#f06a4d', '#c0392f', '#ff9582'] },
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
    const { key, vaultId, activeProfileId, txns, holdings, liabilities } = get();
    if (!key || !activeProfileId) return;
    const day = new Date().toISOString().slice(0, 10);
    const id = `snap-${activeProfileId}-${day}`;
    const cash = txns.reduce((s, t) => (t.type === 'income' ? s.plus(D(t.amount)) : s.minus(D(t.amount))), ZERO);
    const invest = holdings.reduce((s, h) => s.plus(D(h.quantity).times(D(h.lastPrice ?? h.avgCost))), ZERO);
    const liab = liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO);
    const snap: NetWorthSnapshot = {
      id, vaultId, profileId: activeProfileId, date: Date.now(),
      netWorth: cash.plus(invest).minus(liab).toString(),
      cash: cash.toString(), investments: invest.toString(), liabilities: liab.toString(),
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

    const [txnsAll, budgetsAll, goalsAll, holdingsAll, liabilitiesAll, recurringAll, insurancesAll, snapshotsAll, pendingAll] =
      await Promise.all([
        listRecords<Txn>(key, STORE.txn, vaultId),
        listRecords<Budget>(key, STORE.budget, vaultId),
        listRecords<Goal>(key, STORE.goal, vaultId),
        listRecords<Holding>(key, STORE.holding, vaultId),
        listRecords<Liability>(key, STORE.liability, vaultId),
        listRecords<RecurringRule>(key, STORE.recurring, vaultId),
        listRecords<Insurance>(key, STORE.insurance, vaultId),
        listRecords<NetWorthSnapshot>(key, STORE.snapshot, vaultId),
        listRecords<PendingCapture>(key, STORE.pendingCapture, vaultId),
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

    set({
      categories,
      profiles,
      activeProfileId: active,
      txns: txnsReloaded.filter(inProfile),
      budgets: budgetsAll.filter(inProfile),
      goals: goalsAll.filter(inProfile),
      holdings: holdingsAll.filter(inProfile),
      liabilities: liabilitiesAll.filter(inProfile),
      recurring: recurringAll.filter(inProfile),
      insurances: insurancesAll.filter(inProfile),
      snapshots: snapshotsAll.filter(inProfile).sort((a, b) => a.date - b.date),
      accounts: accountsAll.filter(inProfile),
      postings: postingsAll.filter(inProfile),
      pendingCaptures: pendingAll.filter(inProfile),
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
      const cashId = cashAcctId(profileId);
      record = { ...record, accountId: (value.accountId as string | undefined) ?? cashId };
      const t = record as unknown as Txn;
      const contra = t.type === 'income'
        ? incomeAcctId(profileId)
        : expenseAcctId(profileId, t.categoryId);
      const legs = postingsForEntry({
        entryId: t.id, vaultId, amount: t.amount, type: t.type,
        moneyAccountId: cashId, categoryAccountId: contra,
      });
      await putRecord(key, type, vaultId, value.id, record);
      for (const leg of legs) {
        await putRecord(key, STORE.posting, vaultId, leg.id, { ...leg, profileId });
      }
    } else {
      await putRecord(key, type, vaultId, value.id, record);
    }
    await get().reload();
  },

  del: async (type, id) => {
    const { key, vaultId } = get();
    // Drop an entry's postings alongside the transaction.
    if (type === STORE.txn && key) {
      await deleteRecord(STORE.posting, `${id}:dr`);
      await deleteRecord(STORE.posting, `${id}:cr`);
    }
    await deleteRecord(type, id);
    await get().reload();
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
    const { key, vaultId, activeProfileId, recurring } = get();
    if (!key) return 0;
    let created = 0;
    for (const rule of recurring) {
      const { runs, nextRun } = materialize(rule);
      for (const when of runs) {
        const t: Txn = {
          id: uid(), vaultId, profileId: activeProfileId, amount: rule.amount, type: rule.type,
          categoryId: rule.categoryId, merchant: rule.merchant ?? null,
          note: 'Recurring', date: when, createdAt: Date.now(),
        };
        await putRecord(key, STORE.txn, vaultId, t.id, t);
        created++;
      }
      if (runs.length > 0) {
        await putRecord(key, STORE.recurring, vaultId, rule.id, { ...rule, nextRun });
      }
    }
    if (created > 0) await get().reload();
    return created;
  },

  exportBackup: async () => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');
    const payload: Record<string, unknown[]> = {};
    for (const type of Object.values(STORE)) {
      payload[type] = await listRecords(key, type, vaultId);
    }
    const enc = await encryptJson(key, { v: 1, vaultId, exportedAt: Date.now(), data: payload });
    return bufToB64(new TextEncoder().encode(JSON.stringify(enc)).buffer);
  },

  importBackup: async (b64) => {
    const { key, vaultId } = get();
    if (!key) throw new Error('locked');
    const enc = JSON.parse(new TextDecoder().decode(b64ToBuf(b64)));
    const parsed = await decryptJson<{ data: Record<string, { id: string }[]> }>(key, enc);
    let count = 0;
    for (const type of Object.values(STORE)) {
      for (const rec of parsed.data[type] ?? []) {
        await putRecord(key, type, vaultId, rec.id, { ...rec, vaultId });
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
