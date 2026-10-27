'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from '@khazana/screens/components/ErrorBoundary';
import { useReady } from '@/lib/useReady';
import { OnlineShell } from './OnlineShell';

/**
 * Screens that run before an account is ready (sign-in, key setup, approving a
 * device from a link) or that explain the product: no shell, no data.
 */
const PLAIN = ['/sign-in', '/setup', '/pair', '/how', '/coming-soon'];
const isPlain = (path: string) => path === '/' || PLAIN.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * The gate every data screen sits behind: signed out goes to sign-in, an account
 * without keys on this device goes to setup, otherwise sync starts and the full
 * app (shell and shared screens) renders.
 */
function Gate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, error } = useReady();
  if (error) {
    return <main id="main" tabIndex={-1} className="mx-auto min-h-screen max-w-xl px-4 py-10"><p role="alert" className="text-sm">{error}</p></main>;
  }
  if (!ready) {
    return (
      <main id="main" tabIndex={-1} className="min-h-screen grid place-items-center px-4 text-muted">
        <p role="status" aria-live="polite" className="text-sm">Unlocking your data…</p>
      </main>
    );
  }
  return (
    <OnlineShell>
      {/* The skip link's target, inside the shell's own <main>. */}
      <div id="main" tabIndex={-1}>
        {/* Per-route: a screen that throws must not take the shell with it. */}
        <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
      </div>
    </OnlineShell>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isPlain(pathname)) {
    return <main id="main" tabIndex={-1} className="mx-auto min-h-screen max-w-xl px-4 py-10">{children}</main>;
  }
  return <Gate>{children}</Gate>;
}
