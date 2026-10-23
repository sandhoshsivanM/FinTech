// The online app's live state: the decrypted ledger and the sync status, shared
// by every page. Sync runs on start, shortly after each change, when the tab
// comes back into view, and every 15 s while it's visible.
import { useSyncExternalStore } from 'react';
import { gateway } from './api';
import { keys } from './account';
import { EMPTY, LedgerWriter, readLedger, type Ledger } from './ledger';
import { SyncEngine } from './sync/engine';
import { records } from './vault';

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: Date }
  | { kind: 'offline'; pending: number }
  | { kind: 'error'; message: string };

type State = { ledger: Ledger; status: SyncStatus; loaded: boolean };

let state: State = { ledger: EMPTY, status: { kind: 'idle' }, loaded: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const engine = new SyncEngine(gateway(), records);
export const writer = new LedgerWriter(() => keys().dataKey, {
  save: async (r) => {
    await engine.save(r);
    await refresh();
    scheduleSync(300);
  },
});

async function refresh() {
  set({ ledger: await readLedger(keys().dataKey, await records.all()), loaded: true });
}

let running: Promise<void> | undefined;
export function syncNow(): Promise<void> {
  running ??= (async () => {
    set({ status: { kind: 'syncing' } });
    try {
      const report = await engine.sync();
      if (report.pulled || report.reset) await refresh();
      set({ status: { kind: 'synced', at: new Date() } });
    } catch (err) {
      const pending = await engine.pending();
      set({ status: err instanceof TypeError ? { kind: 'offline', pending } : { kind: 'error', message: err instanceof Error ? err.message : String(err) } });
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
  await refresh();
  await syncNow();
}

export function useOnline(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
