'use client';
import { useEffect, type ReactNode } from 'react';
import { useApp } from '@/lib/store';
import { VaultGate } from './VaultGate';
import { Shell } from './Shell';
import { AutoLock } from './AutoLock';

export function AppFrame({ children }: { children: ReactNode }) {
  const status = useApp((s) => s.status);
  const init = useApp((s) => s.init);

  useEffect(() => { void init(); }, [init]);

  // Register the offline service worker (production builds only — it conflicts
  // with the dev/Turbopack HMR pipeline).
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const id = setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 1200);
    return () => clearTimeout(id);
  }, []);

  if (status === 'loading') {
    return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>;
  }
  if (status !== 'unlocked') return <VaultGate />;
  return (
    <>
      <AutoLock />
      <Shell>{children}</Shell>
    </>
  );
}
