'use client';
import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useApp } from '@/lib/store';
import { VaultGate } from './VaultGate';
import { Shell } from './Shell';
import { AutoLock } from './AutoLock';
import { ConfirmProvider } from './Confirm';
import { usePathname, useRouter } from 'next/navigation';
import { ErrorBoundary } from './ErrorBoundary';
import { onNotificationNavigate } from '@/lib/notify';
import { useNotificationDriver } from '@/lib/useNotificationDriver';

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useApp((s) => s.status);
  const init = useApp((s) => s.init);

  useEffect(() => { void init(); }, [init]);

  // Tapping a notification. The worker posts rather than navigating, so this
  // routes in place — a hard navigation would re-mount the app, discard the
  // in-memory vault key, and put the PIN screen in front of someone who was
  // already looking at their data.
  useEffect(() => onNotificationNavigate((url) => router.push(url)), [router]);

  // Register the offline service worker (production builds only — it conflicts
  // with the dev/Turbopack HMR pipeline).
  //
  // Only ever under http(s). The desktop wrapper serves from tauri://localhost,
  // where a service-worker fetch of the custom protocol can fail and take the
  // whole screen down with it; the desktop build already ships every asset
  // inside the binary, so a worker there is all risk and no benefit.
  //
  // Existing desktop installs already carry the old worker, and a broken one
  // cannot be relied on to update itself — so unregister rather than merely
  // skipping registration. This is what un-bricks an app that is already
  // showing "This page couldn't load".
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
    if (!isWeb || process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations?.()
        .then((rs) => Promise.all(rs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }

    const id = setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 1200);
    return () => clearTimeout(id);
  }, []);

  if (status === 'loading') {
    return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>;
  }
  // `reducedMotion="user"` honours the OS setting for every Framer animation in
  // the tree, so individual components never have to check it themselves.
  if (status !== 'unlocked') {
    return (
      <MotionConfig reducedMotion="user">
        <VaultGate />
      </MotionConfig>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <ConfirmProvider>
        <AutoLock />
        {/* Mounted inside the unlocked branch only: it reads decrypted records,
            which do not exist until the vault is open. */}
        <NotificationDriver />
        <Shell>
          {/* Per-route: a screen that throws must not take the shell with it. */}
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </Shell>
      </ConfirmProvider>
    </MotionConfig>
  );
}

/**
 * Runs the notification scheduler for as long as a window is open.
 *
 * A component rather than a hook call in [AppFrame] because the hook reads
 * decrypted records, and AppFrame renders before the vault is unlocked — hooks
 * cannot be conditional, but a child can be.
 */
function NotificationDriver() {
  useNotificationDriver();
  return null;
}
