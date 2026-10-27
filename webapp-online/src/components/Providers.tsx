'use client';
import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { KhazanaStoreProvider } from '@khazana/screens/store';
import { ConfirmProvider } from '@khazana/screens/components/Confirm';
import { useAppStore } from '@/lib/store';
import { installScreensPlatform } from '@/lib/screensPlatform';

installScreensPlatform();

/**
 * Hands the shared screens (`@khazana/screens`) Online's store, which keeps
 * records end-to-end encrypted and syncs them. `reducedMotion="user"` honours
 * the OS setting for every animation in the tree.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <KhazanaStoreProvider store={useAppStore}>
      <MotionConfig reducedMotion="user">
        <ConfirmProvider>{children}</ConfirmProvider>
      </MotionConfig>
    </KhazanaStoreProvider>
  );
}
