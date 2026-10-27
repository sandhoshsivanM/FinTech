// Compile-time check: the online store satisfies the shared screens' data
// contract (packages/screens-ts/src/store.tsx), so the shared screens can be
// mounted on it unchanged with <KhazanaStoreProvider store={useAppStore}>.
import type { KhazanaStore } from '@khazana/screens/store';
import type { AppState } from './appStore';

export const satisfiesKhazanaStore = (s: AppState): KhazanaStore => s;
