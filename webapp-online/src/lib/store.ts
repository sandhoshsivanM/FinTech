// The online app's live state, shared by every page: the shared entity store
// (appStore.ts) over encrypted sync, and the sync status. Sync runs on start,
// shortly after each change, when the tab comes back into view, and every 15 s
// while it's visible.
//
// `useAppStore` is the offline-shaped store (screens written for the offline
// app read this). `useOnline()` and `writer` keep the first online screens
// (accounts, account, cards) working unchanged; see legacyView.ts.
import { useMemo, useSyncExternalStore } from 'react';
import { gateway } from './api';
import { keys } from './account';
import { createAppStore } from './appStore';
import { legacyWriter, ledgerView } from './legacyView';
import type { Ledger } from './ledger';
import { SyncEngine } from './sync/engine';
import { records } from './vault';

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: Date }
  | { kind: 'offline'; pending: number }
  | { kind: 'error'; message: string };

type Status = { status: SyncStatus };
let state: Status = { status: { kind: 'idle' } };
const listeners = new Set<() => void>();
const setStatus = (status: SyncStatus) => {
  state = { status };
  listeners.forEach((l) => l());
};

const engine = new SyncEngine(gateway(), records);

export const useAppStore = createAppStore({
  dek: () => keys().dataKey,
  engine,
  records,
  onChange: () => scheduleSync(300),
  attachments: {
    put: async (id, ciphertext) => void (await gateway().callBytes('PUT', `/v1/sync/attachments/${id}`, ciphertext)),
    get: (id) => gateway().callBytes('GET', `/v1/sync/attachments/${id}`),
  },
});

export const writer = legacyWriter(useAppStore);

let running: Promise<void> | undefined;
export function syncNow(): Promise<void> {
  running ??= (async () => {
    setStatus({ kind: 'syncing' });
    try {
      const report = await engine.sync();
      if (report.pulled || report.reset) await useAppStore.getState().reload();
      setStatus({ kind: 'synced', at: new Date() });
    } catch (err) {
      const pending = await engine.pending();
      setStatus(err instanceof TypeError ? { kind: 'offline', pending } : { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  })().finally(() => (running = undefined));
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

let started = false;
/** Call once the data key is unlocked. Safe to call again. */
export async function startSync(): Promise<void> {
  if (!started) {
    started = true;
    setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, 15_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNow();
    });
    window.addEventListener('online', () => void syncNow());
  }
  // Show what is on this device first, without seeding defaults: a new device
  // must not write its own "Personal" profile over one another device renamed.
  await useAppStore.getState().loadOnly();
  await syncNow();
  await useAppStore.getState().reload();
  void useAppStore.getState().captureSnapshot();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** What the first online screens read: the ledger view, the sync status, and whether data has loaded. */
export function useOnline(): { ledger: Ledger; status: SyncStatus; loaded: boolean } {
  const { status } = useSyncExternalStore(subscribe, () => state, () => state);
  const accounts = useAppStore((s) => s.accounts);
  const txns = useAppStore((s) => s.txns);
  const categories = useAppStore((s) => s.categories);
  const cards = useAppStore((s) => s.cards);
  const loaded = useAppStore((s) => s.loaded);
  const ledger = useMemo(() => ledgerView({ accounts, txns, categories, cards }), [accounts, txns, categories, cards]);
  return { ledger, status, loaded };
}
