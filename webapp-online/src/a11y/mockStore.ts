// A KhazanaStore (the shared screens' data contract) with nothing in it, for tests
// that render the shared screens and the shell without a database or a server.
// Every action is an async no-op; `seed` fills collections for states with data.
import { createStore } from 'zustand/vanilla';
import type { KhazanaData, KhazanaStore } from '@khazana/screens/store';

const empty = (): KhazanaData => ({
  txns: [], categories: [], budgets: [], goals: [], holdings: [], liabilities: [], recurring: [], insurances: [],
  snapshots: [], importBatches: [], lots: [], accounts: [], postings: [], transfers: [], pendingCaptures: [],
  watchlist: [], dividends: [], alerts: [], fxRates: [],
});

export function createMockStore(seed: Partial<KhazanaStore> = {}) {
  const noop = async () => undefined;
  return createStore<KhazanaStore>((set) => ({
    ...empty(),
    vaultId: 'default',
    activeProfileId: 'default',
    profiles: [{ id: 'default', vaultId: 'default', name: 'Personal', kind: 'self', createdAt: 0 }],
    ghost: false,
    currencyCode: 'INR',
    theme: 'light',
    accent: 'default',
    setActiveProfile: noop,
    addProfile: noop,
    renameProfile: noop,
    deleteProfile: noop,
    toggleGhost: () => set((s) => ({ ghost: !s.ghost })),
    setCurrency: (code) => set({ currencyCode: code }),
    setTheme: (theme) => set({ theme }),
    setAccent: (accent) => set({ accent }),
    put: noop,
    putMany: noop,
    del: noop,
    reload: noop,
    reassignTxnAccounts: async () => 0,
    processRecurring: async () => 0,
    postRecurringOnce: async () => false,
    recordImportBatch: async () => 'batch',
    undoImportBatch: async () => 0,
    captureSnapshot: noop,
    addCaptures: async () => [],
    approveCaptures: noop,
    rejectCapture: noop,
    putAttachment: async () => 'att',
    getAttachmentUrl: async () => null,
    ...seed,
  }));
}
