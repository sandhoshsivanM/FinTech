'use client';
import type { ReactNode } from 'react';
import { KhazanaStoreProvider } from '@khazana/screens/store';
import { useApp } from '@/lib/store';
import { installScreensPlatform } from '@/lib/screensPlatform';

installScreensPlatform();

/**
 * Hands the shared screens (`@khazana/screens`) this app's encrypted vault
 * store. Everything vault-specific (PIN, lock, backup, sync) stays on `useApp`
 * and is used directly by the parts of this app that need it.
 */
export function ScreensProvider({ children }: { children: ReactNode }) {
  return <KhazanaStoreProvider store={useApp}>{children}</KhazanaStoreProvider>;
}
