'use client';
// In-app confirmation dialog. Replaces window.confirm(), which is a no-op in
// the Tauri/wry webview (it returns false, so confirm-gated deletes silently
// fail in the desktop app). Works everywhere and matches the app's look.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, GlassCard } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Resolver = (ok: boolean) => void;
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[100] grid place-items-center p-5" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => close(false)} />
          <GlassCard className="relative w-full max-w-sm p-5">
            <h2 className="text-[16px] font-bold tracking-tight">{opts.title}</h2>
            {opts.message && <p className="mt-2 text-[13.5px] text-ink-soft leading-relaxed">{opts.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)}>{opts.cancelLabel ?? 'Cancel'}</Button>
              <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {opts.confirmLabel ?? (opts.danger ? 'Delete' : 'Confirm')}
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
