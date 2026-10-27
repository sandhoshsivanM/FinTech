// The online app's data store, with the same shape as the offline app's
// Zustand store (webapp/src/lib/store.ts AppState: the pure data and CRUD
// part), so screens written against that store can render on online data.
//
// Storage is the end-to-end encrypted sync: every entity is one encrypted
// record (sync/codec.ts), saved through the SyncEngine, which queues it for
// the server. The record store is the single source of truth; every write goes
// to it and the state is rebuilt from it (only changed records are decrypted).
//
// What is NOT stored or synced:
// - postings: derived. Recomputed from transactions and transfers on every load,
//   so two devices that merge never disagree on a balance.
// - attachments and profile photos: too big for a record. Attachments go to
//   /v1/sync/attachments (encrypted); profile photos stay on the device.
//
// The write logic (which records a put writes, double-entry accounts, recurring,
// snapshots, captures) is @khazana/domain, shared with the offline app.
import { create } from 'zustand';
import { accountBalances } from '@khazana/domain/accountLedger';
import { accentVars, type AccentName, type ThemeChoice } from '@khazana/domain/appearance';
import {
  approvalRecords, planCaptures, rejectionRecord, staleCaptureIds,
  type CaptureEdits, type CaptureInput, type CaptureOutcome,
} from '@khazana/domain/capture';
import {
  DEFAULT_PROFILE_ID, DEFAULT_VAULT_ID, buildSnapshot, defaultCategories, defaultProfile, deleteMutations,
  derivePostings, entryMutations, inProfile, linkGoalBalances, missingAccountMutations, postRecurringOncePlan,
  processRecurringPlan, reassignMutations, undoImportBatchPlan, type EntityValue, type Mutation,
} from '@khazana/domain/vaultWrites';
import {
  STORE, PROFILE_SCOPED,
  type Account, type Alert, type Budget, type Category, type Dividend, type FxRate, type Goal, type Holding,
  type HoldingLot, type ImportBatch, type Insurance, type Liability, type NetWorthSnapshot, type PendingCapture,
  type Posting, type Profile, type ProfileKind, type RecurringRule, type Transfer, type WatchItem,
} from '@khazana/domain/types';
import { toBase64 } from './crypto/bytes';
import { decryptRecord, encryptRecord, KEY_VERSION } from './crypto/e2e';
import { readLedger, type CardValue, type CreditCard } from './ledger';
import { migrateLegacy, type OnlineTxn } from './migrate';
import {
  CARDS, LEGACY_ACCOUNTS, LEGACY_TRANSACTIONS, collectionOf, decodeEntity, encodeEntity, recordIdFor, tombstoneFor,
  MAX_CIPHERTEXT, RecordTooLargeError,
} from './sync/codec';
import type { SyncEngine } from './sync/engine';
import type { LocalRecord, RecordStore } from './vault';

export type { AccentName, ThemeChoice };

/** Receipts and other blobs: uploaded encrypted, fetched on demand. */
export interface AttachmentTransport {
  put(id: string, ciphertext: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | undefined>;
}

export interface AppDeps {
  dek: () => Uint8Array;
  engine: Pick<SyncEngine, 'save'>;
  records: Pick<RecordStore, 'all'>;
  attachments?: AttachmentTransport;
  now?: () => number;
  uid?: () => string;
  /** UI preferences. Defaults to localStorage when there is one. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Called after a local write, so the app can schedule a sync. */
  onChange?: () => void;
}

export interface AppData {
  txns: OnlineTxn[];
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
  /** Derived, never synced. */
  postings: Posting[];
  transfers: Transfer[];
  pendingCaptures: PendingCapture[];
  watchlist: WatchItem[];
  dividends: Dividend[];
  alerts: Alert[];
  fxRates: FxRate[];
}

export interface AppState extends AppData {
  /** False until the first load from the local record store finishes. */
  loaded: boolean;
  vaultId: string;
  profiles: Profile[];
  activeProfileId: string;
  ghost: boolean;
  currencyCode: string;
  theme: ThemeChoice;
  accent: AccentName;
  /** Online-only credit cards. */
  cards: CreditCard[];

  setActiveProfile: (id: string) => Promise<void>;
  addProfile: (name: string, kind: ProfileKind) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  toggleGhost: () => void;
  setCurrency: (code: string) => void;
  setTheme: (t: ThemeChoice) => void;
  setAccent: (a: AccentName) => void;

  reload: () => Promise<void>;
  /** Like `reload`, but seeds nothing: used before the first sync, so a new device doesn't write defaults over another device's edits. */
  loadOnly: () => Promise<void>;
  put: (type: string, value: EntityValue) => Promise<void>;
  putMany: (entries: { type: string; value: EntityValue }[]) => Promise<void>;
  del: (type: string, id: string) => Promise<void>;
  delMany: (entries: { type: string; id: string }[]) => Promise<void>;
  reassignTxnAccounts: (fromAccountId: string, toAccountId: string) => Promise<number>;
  processRecurring: () => Promise<number>;
  postRecurringOnce: (ruleId: string, opts?: { date?: number; amount?: string }) => Promise<boolean>;
  recordImportBatch: (b: Omit<ImportBatch, 'id' | 'vaultId' | 'profileId'>) => Promise<string>;
  undoImportBatch: (batchId: string) => Promise<number>;
  captureSnapshot: () => Promise<void>;
  addCaptures: (inputs: CaptureInput[]) => Promise<CaptureOutcome[]>;
  approveCaptures: (items: { id: string; edits?: CaptureEdits }[]) => Promise<void>;
  rejectCapture: (id: string) => Promise<void>;
  putAttachment: (file: File) => Promise<string>;
  getAttachmentUrl: (id: string) => Promise<string | null>;

  putCard: (card: CardValue & { id?: string }) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
}

// localStorage keys: the same names the offline app uses (a different origin, so no clash).
const KEYS = { currency: 'khazana-currency', profile: 'khazana-active-profile', theme: 'khazana-theme', accent: 'khazana-accent', ghost: 'khazana-ghost' };

const emptyData = (): AppData => ({
  txns: [], categories: [], budgets: [], goals: [], holdings: [], liabilities: [], recurring: [], insurances: [],
  snapshots: [], importBatches: [], lots: [], accounts: [], postings: [], transfers: [], pendingCaptures: [],
  watchlist: [], dividends: [], alerts: [], fxRates: [],
});

type Entity = EntityValue;
type Decoded = { type: string; entity: Entity } | undefined;

export function createAppStore(deps: AppDeps) {
  const now = deps.now ?? Date.now;
  const uid = deps.uid ?? (() => crypto.randomUUID());
  const storage = deps.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const pref = (k: string): string | null => { try { return storage?.getItem(k) ?? null; } catch { return null; } };
  const setPref = (k: string, v: string) => { try { storage?.setItem(k, v); } catch { /* quota or private mode */ } };

  // Decrypted entities by record, reused while the record is unchanged.
  const cache = new Map<string, { updatedAt: string; decoded: Decoded; card?: CardValue }>();
  // The newest stamp seen or written per record, so a local write always beats what it replaces.
  const stamps = new Map<string, string>();
  // Every entity of every profile, as of the last load.
  let raw = new Map<string, Entity[]>();
  const keyOf = (r: Pick<LocalRecord, 'collection' | 'recordId'>) => `${r.collection}/${r.recordId}`;
  const attachmentUrls = new Map<string, string>();

  const stampFor = (key: string): string => {
    const prev = stamps.get(key);
    const t = Math.max(now(), prev ? Date.parse(prev) + 1 : 0);
    const iso = new Date(t).toISOString();
    stamps.set(key, iso);
    return iso;
  };

  const store = create<AppState>((set, get) => {
    const list = <T,>(type: string) => (raw.get(type) ?? []) as unknown as T[];

    /** The planning view the domain builders read: the active profile's slice. */
    const planState = () => {
      const s = get();
      return { vaultId: s.vaultId, activeProfileId: s.activeProfileId, txns: s.txns, transfers: s.transfers, categories: s.categories, accounts: s.accounts, recurring: s.recurring };
    };

    async function readRecords(): Promise<LocalRecord[]> {
      const recs = await deps.records.all();
      const dek = deps.dek();
      for (const r of recs) {
        const k = keyOf(r);
        if (!stamps.has(k) || Date.parse(stamps.get(k)!) < Date.parse(r.updatedAt)) stamps.set(k, r.updatedAt);
        const hit = cache.get(k);
        if (hit && hit.updatedAt === r.updatedAt) continue;
        if (r.collection === CARDS) {
          let card: CardValue | undefined;
          if (!r.deleted && r.ciphertext) {
            try { card = await decryptRecord<CardValue>(dek, { recordId: r.recordId, collection: r.collection, keyVersion: r.keyVersion }, r.ciphertext); } catch { /* other key version or damaged */ }
          }
          cache.set(k, { updatedAt: r.updatedAt, decoded: undefined, card });
        } else {
          cache.set(k, { updatedAt: r.updatedAt, decoded: await decodeEntity(dek, r) });
        }
      }
      return recs;
    }

    async function commitRecords(recs: LocalRecord[]) {
      for (const r of recs) await deps.engine.save(r);
      if (recs.length > 0) deps.onChange?.();
    }

    /** Writes a mutation batch (postings skipped: derived). Encrypts everything first, so a refused record writes nothing. */
    async function writeMutations(muts: Mutation[]) {
      const last = new Map<string, Mutation>();
      for (const m of muts) if (m.type !== STORE.posting) last.set(`${m.type} ${m.id}`, m);
      const out: LocalRecord[] = [];
      const dek = deps.dek();
      for (const m of last.values()) {
        if (m.op === 'delete') {
          const t = await tombstoneFor(m.type, m.id, '');
          out.push({ ...t, updatedAt: stampFor(keyOf(t)) });
        } else {
          const probe = await recordIdFor(m.type, m.id);
          out.push(await encodeEntity(dek, m.type, m.value as Entity, stampFor(`${collectionOf(m.type)}/${probe}`)));
        }
      }
      await commitRecords(out);
    }

    async function migrateOnce(recs: LocalRecord[], profiles: Profile[], categories: Category[], accounts: Account[], txns: Entity[]): Promise<boolean> {
      const legacyLive = recs.some((r) => !r.deleted && (r.collection === LEGACY_ACCOUNTS || r.collection === LEGACY_TRANSACTIONS));
      if (!legacyLive) return false;
      const legacy = await readLedger(deps.dek(), recs);
      const fallback = [...profiles].sort((a, b) => a.createdAt - b.createdAt)[0]?.id ?? DEFAULT_PROFILE_ID;
      const known = categories.length > 0 ? categories : defaultCategories();
      const m = migrateLegacy(legacy, {
        vaultId: DEFAULT_VAULT_ID, profileId: fallback, categories: known,
        existingAccountIds: new Set(accounts.map((a) => a.id)), existingTxnIds: new Set(txns.map((t) => t.id)),
      });
      const muts: Mutation[] = [];
      if (profiles.length === 0) muts.push({ op: 'put', type: STORE.profile, id: DEFAULT_PROFILE_ID, value: defaultProfile(now()) });
      if (categories.length === 0) for (const c of defaultCategories()) muts.push({ op: 'put', type: STORE.category, id: c.id, value: c });
      for (const c of m.categories) muts.push({ op: 'put', type: STORE.category, id: c.id, value: c });
      for (const a of m.accounts) muts.push({ op: 'put', type: STORE.account, id: a.id, value: a });
      for (const t of m.txns) muts.push({ op: 'put', type: STORE.txn, id: t.id, value: t });
      await writeMutations(muts);
      // Tombstone the old records, so every other device converges instead of migrating twice.
      const tombs: LocalRecord[] = [];
      for (const r of recs) {
        if (r.deleted || (r.collection !== LEGACY_ACCOUNTS && r.collection !== LEGACY_TRANSACTIONS)) continue;
        tombs.push({ collection: r.collection, recordId: r.recordId, updatedAt: stampFor(keyOf(r)), deleted: true, ciphertext: null, keyVersion: r.keyVersion });
      }
      await commitRecords(tombs);
      return true;
    }

    // Loads run one at a time: a slow one must not finish after a newer one and overwrite its state.
    let queue: Promise<unknown> = Promise.resolve();
    const load = (seed: boolean): Promise<void> => {
      const run = queue.then(() => loadNow(seed));
      queue = run.catch(() => undefined);
      return run;
    };

    async function loadNow(seed: boolean): Promise<void> {
      let recs = await readRecords();
      for (let pass = 0; pass < 3; pass++) {
        const byType = collect(recs);
        const profiles = (byType.get(STORE.profile) ?? []) as unknown as Profile[];
        const categories = (byType.get(STORE.category) ?? []) as unknown as Category[];
        const accounts = (byType.get(STORE.account) ?? []) as unknown as Account[];
        const txns = byType.get(STORE.txn) ?? [];
        if (await migrateOnce(recs, profiles, categories, accounts, txns)) { recs = await readRecords(); continue; }
        if (!seed) break;
        const muts: Mutation[] = [];
        if (categories.length === 0) for (const c of defaultCategories()) muts.push({ op: 'put', type: STORE.category, id: c.id, value: c });
        if (profiles.length === 0) muts.push({ op: 'put', type: STORE.profile, id: DEFAULT_PROFILE_ID, value: defaultProfile(now()) });
        const profs = profiles.length ? profiles : [defaultProfile(now())];
        muts.push(...missingAccountMutations({
          vaultId: DEFAULT_VAULT_ID, txns: txns as unknown as OnlineTxn[], profiles: profs,
          categories: categories.length ? categories : defaultCategories(), accounts,
        }));
        if (muts.length === 0) break;
        await writeMutations(muts);
        recs = await readRecords();
      }
      build(recs);
    }

    /** Live decoded entities by type, all profiles. */
    function collect(recs: LocalRecord[]): Map<string, Entity[]> {
      const byType = new Map<string, Entity[]>();
      for (const r of recs) {
        if (r.deleted) continue;
        const d = cache.get(keyOf(r))?.decoded;
        if (!d) continue;
        const arr = byType.get(d.type) ?? [];
        arr.push(d.entity);
        byType.set(d.type, arr);
      }
      return byType;
    }

    function build(recs: LocalRecord[]) {
      raw = collect(recs);
      const vaultId = DEFAULT_VAULT_ID;
      const categories = list<Category>(STORE.category).sort((a, b) => a.name.localeCompare(b.name));
      const profiles = list<Profile>(STORE.profile).sort((a, b) => a.createdAt - b.createdAt);
      const defaultId = profiles[0]?.id ?? DEFAULT_PROFILE_ID;
      let active = get().activeProfileId || pref(KEYS.profile) || defaultId;
      if (profiles.length > 0 && !profiles.some((p) => p.id === active)) active = defaultId;
      const mine = <T extends { profileId?: string }>(rows: T[]) => rows.filter((r) => inProfile(r, active, defaultId));

      const txnsAll = list<OnlineTxn>(STORE.txn);
      const transfersAll = list<Transfer>(STORE.transfer);
      const postings = mine(derivePostings({ vaultId, txns: txnsAll, transfers: transfersAll, defaultProfileId: defaultId }));
      const accounts = mine(list<Account>(STORE.account));
      const balances = accountBalances(accounts, postings);

      const cards: CreditCard[] = [];
      for (const r of recs) {
        const c = cache.get(keyOf(r));
        if (r.collection === CARDS && !r.deleted && c?.card) cards.push({ ...c.card, id: r.recordId, updatedAt: r.updatedAt });
      }
      cards.sort((a, b) => a.name.localeCompare(b.name));

      set({
        loaded: true, categories, profiles, activeProfileId: active, cards,
        txns: mine(txnsAll), accounts, postings,
        budgets: mine(list<Budget>(STORE.budget)),
        goals: linkGoalBalances(mine(list<Goal>(STORE.goal)), balances),
        holdings: mine(list<Holding>(STORE.holding)),
        liabilities: mine(list<Liability>(STORE.liability)),
        recurring: mine(list<RecurringRule>(STORE.recurring)),
        insurances: mine(list<Insurance>(STORE.insurance)),
        snapshots: mine(list<NetWorthSnapshot>(STORE.snapshot)).sort((a, b) => a.date - b.date),
        importBatches: mine(list<ImportBatch>(STORE.importBatch)).sort((a, b) => b.at - a.at),
        lots: mine(list<HoldingLot>(STORE.lot)).sort((a, b) => a.purchaseDate - b.purchaseDate),
        transfers: mine(transfersAll).sort((a, b) => b.date - a.date),
        pendingCaptures: mine(list<PendingCapture>(STORE.pendingCapture)),
        watchlist: mine(list<WatchItem>(STORE.watchItem)).sort((a, b) => b.addedAt - a.addedAt),
        dividends: mine(list<Dividend>(STORE.dividend)).sort((a, b) => b.payDate - a.payDate),
        alerts: mine(list<Alert>(STORE.alert)).sort((a, b) => b.createdAt - a.createdAt),
        fxRates: list<FxRate>(STORE.fxRate),
      });
    }

    const writeAndReload = async (muts: Mutation[]) => {
      if (muts.length === 0) return;
      await writeMutations(muts);
      await load(true);
    };

    function applyAppearance() {
      if (typeof document === 'undefined') return;
      const { theme, accent } = get();
      const dark = theme === 'dark' || (theme === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? 'dark' : 'light';
      for (const p of ['--accent', '--accent-deep', '--accent-glow', '--accent-on']) root.style.removeProperty(p);
      for (const [p, v] of Object.entries(accentVars(accent, dark))) root.style.setProperty(p, v);
    }

    return {
      ...emptyData(),
      loaded: false,
      vaultId: DEFAULT_VAULT_ID,
      profiles: [],
      activeProfileId: '',
      ghost: pref(KEYS.ghost) === '1',
      currencyCode: pref(KEYS.currency) ?? 'INR',
      theme: (pref(KEYS.theme) as ThemeChoice | null) ?? 'system',
      accent: (pref(KEYS.accent) as AccentName | null) ?? 'default',
      cards: [],

      toggleGhost: () => set((s) => { setPref(KEYS.ghost, s.ghost ? '0' : '1'); return { ghost: !s.ghost }; }),
      setCurrency: (code) => { setPref(KEYS.currency, code); set({ currencyCode: code }); },
      setTheme: (t) => { setPref(KEYS.theme, t); set({ theme: t }); applyAppearance(); },
      setAccent: (a) => { setPref(KEYS.accent, a); set({ accent: a }); applyAppearance(); },

      setActiveProfile: async (id) => {
        setPref(KEYS.profile, id);
        set({ activeProfileId: id });
        await load(true);
        void get().captureSnapshot();
      },
      addProfile: async (name, kind) => {
        const p: Profile = { id: uid(), vaultId: get().vaultId, name: name.trim() || 'Profile', kind, createdAt: now() };
        await writeMutations([{ op: 'put', type: STORE.profile, id: p.id, value: p }]);
        await get().setActiveProfile(p.id);
      },
      renameProfile: async (id, name) => {
        const p = get().profiles.find((x) => x.id === id);
        if (!p) return;
        await writeAndReload([{ op: 'put', type: STORE.profile, id, value: { ...p, name: name.trim() || p.name } }]);
      },
      deleteProfile: async (id) => {
        const { profiles } = get();
        if (profiles.length <= 1) return; // never delete the last profile
        const defaultId = profiles[0].id;
        const muts: Mutation[] = [{ op: 'delete', type: STORE.profile, id }];
        for (const type of PROFILE_SCOPED) {
          if (type === STORE.posting || type === STORE.attachment) continue;
          for (const r of (raw.get(type) ?? []) as (Entity & { profileId?: string })[]) {
            if ((r.profileId ?? defaultId) === id) muts.push({ op: 'delete', type, id: r.id });
          }
        }
        await writeMutations(muts);
        await get().setActiveProfile(profiles.filter((p) => p.id !== id)[0].id);
      },

      reload: () => load(true),
      loadOnly: () => load(false),

      put: async (type, value) => writeAndReload(entryMutations(planState(), type, value, new Set(get().accounts.map((a) => a.id)))),
      putMany: async (entries) => {
        const existing = new Set(get().accounts.map((a) => a.id));
        await writeAndReload(entries.flatMap((e) => entryMutations(planState(), e.type, e.value, existing)));
      },
      del: async (type, id) => writeAndReload(deleteMutations(planState(), type, id)),
      delMany: async (entries) => writeAndReload(entries.flatMap((e) => deleteMutations(planState(), e.type, e.id))),

      reassignTxnAccounts: async (from, to) => {
        const { mutations, moved } = reassignMutations(planState(), from, to);
        await writeAndReload(mutations);
        return moved;
      },
      processRecurring: async () => {
        const { mutations, created } = processRecurringPlan(planState(), { now: now(), uid });
        await writeAndReload(mutations);
        return created;
      },
      postRecurringOnce: async (ruleId, opts) => {
        const muts = postRecurringOncePlan(planState(), ruleId, opts, { now: now(), uid });
        if (!muts) return false;
        await writeAndReload(muts);
        return true;
      },
      recordImportBatch: async (b) => {
        const id = uid();
        const batch: ImportBatch = { ...b, id, vaultId: get().vaultId, profileId: get().activeProfileId };
        await writeAndReload([{ op: 'put', type: STORE.importBatch, id, value: batch }]);
        return id;
      },
      undoImportBatch: async (batchId) => {
        const batch = get().importBatches.find((b) => b.id === batchId);
        if (!batch) return 0;
        const plan = undoImportBatchPlan(batch, get().postings);
        if (!plan) return 0;
        await writeAndReload(plan.mutations);
        return plan.removed;
      },
      captureSnapshot: async () => {
        const s = get();
        if (!s.activeProfileId) return;
        const snap = buildSnapshot({ ...s, profileId: s.activeProfileId, now: now() });
        const same = s.snapshots.find((x) => x.id === snap.id);
        if (same && same.netWorth === snap.netWorth && same.cash === snap.cash && same.investments === snap.investments
          && same.liabilities === snap.liabilities && same.healthScore === snap.healthScore) return;
        await writeAndReload([{ op: 'put', type: STORE.snapshot, id: snap.id, value: snap }]);
      },

      addCaptures: async (inputs) => {
        if (inputs.length === 0) return [];
        const t = now();
        const s = get();
        // Every capture, not just this profile's: a message already captured under another profile is a duplicate.
        const existing = list<PendingCapture>(STORE.pendingCapture);
        const plan = await planCaptures(inputs, { vaultId: s.vaultId, now: t, existing, txns: s.txns, categories: s.categories, newId: uid });
        const accounts = new Set(s.accounts.map((a) => a.id));
        const muts: Mutation[] = [
          ...plan.captures.flatMap((c) => entryMutations(planState(), STORE.pendingCapture, c as unknown as EntityValue, accounts)),
          ...staleCaptureIds(existing, t).map((id): Mutation => ({ op: 'delete', type: STORE.pendingCapture, id })),
        ];
        await writeAndReload(muts);
        return plan.outcomes;
      },
      approveCaptures: async (items) => {
        const s = get();
        const t = now();
        const accounts = new Set(s.accounts.map((a) => a.id));
        const muts: Mutation[] = [];
        for (const { id, edits } of items) {
          const c = s.pendingCaptures.find((p) => p.id === id);
          if (!c || (c.status ?? 'pending') !== 'pending') continue;
          const { txn, capture } = approvalRecords(c, edits ?? {}, { now: t, txnId: uid() });
          // The transaction and the decision land together.
          muts.push(
            ...entryMutations(planState(), STORE.txn, txn as unknown as EntityValue, accounts),
            ...entryMutations(planState(), STORE.pendingCapture, capture as unknown as EntityValue, accounts),
          );
        }
        await writeAndReload(muts);
      },
      rejectCapture: async (id) => {
        const c = get().pendingCaptures.find((p) => p.id === id);
        if (c) await get().put(STORE.pendingCapture, rejectionRecord(c, now()) as unknown as EntityValue);
      },

      putAttachment: async (file) => {
        if (!deps.attachments) throw new Error('Attachments are not available here.');
        const id = uid();
        const data = toBase64(new Uint8Array(await file.arrayBuffer()));
        const value = { id, vaultId: get().vaultId, profileId: get().activeProfileId, mime: file.type || 'image/jpeg', data };
        const blob = await encryptRecord(deps.dek(), { recordId: id, collection: 'attachment', keyVersion: KEY_VERSION }, value);
        await deps.attachments.put(id, blob);
        attachmentUrls.set(id, `data:${value.mime};base64,${data}`);
        return id;
      },
      getAttachmentUrl: async (id) => {
        const hit = attachmentUrls.get(id);
        if (hit) return hit;
        if (!deps.attachments) return null;
        try {
          const blob = await deps.attachments.get(id);
          if (!blob) return null;
          const v = await decryptRecord<{ mime: string; data: string }>(deps.dek(), { recordId: id, collection: 'attachment', keyVersion: KEY_VERSION }, blob);
          const url = `data:${v.mime};base64,${v.data}`;
          attachmentUrls.set(id, url);
          return url;
        } catch {
          return null;
        }
      },

      putCard: async (card) => {
        const id = card.id ?? uid();
        const { id: _id, ...value } = card;
        const rec: LocalRecord = {
          collection: CARDS, recordId: id, updatedAt: stampFor(`${CARDS}/${id}`), deleted: false, keyVersion: KEY_VERSION,
          ciphertext: await encryptRecord(deps.dek(), { recordId: id, collection: CARDS, keyVersion: KEY_VERSION }, value),
        };
        if (rec.ciphertext!.length > MAX_CIPHERTEXT) throw new RecordTooLargeError('card', id, rec.ciphertext!.length);
        await commitRecords([rec]);
        await load(true);
      },
      deleteCard: async (id) => {
        await commitRecords([{ collection: CARDS, recordId: id, updatedAt: stampFor(`${CARDS}/${id}`), deleted: true, ciphertext: null, keyVersion: KEY_VERSION }]);
        await load(true);
      },
    };
  });
  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
