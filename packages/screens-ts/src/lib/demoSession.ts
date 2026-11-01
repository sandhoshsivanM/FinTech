/**
 * The "Try demo" session flag, for reviewers who want to look around without
 * creating a vault of their own.
 *
 * It lives in sessionStorage, never localStorage, on purpose: it is scoped to
 * one tab, so a demo opened beside a real vault cannot switch that vault's tab
 * into demo mode, and nothing about it survives into a later visit to `/`.
 *
 * Every read is guarded. sessionStorage is absent during static export (SSR)
 * and throws in some private modes; either way the answer is "not a demo",
 * which is the safe default — it routes to the real vault and its real PIN.
 */
export const DEMO_SESSION_KEY = 'khazana.demo';
/** The demo vault's generated PIN. Random, per tab, and never shown. */
export const DEMO_PIN_KEY = 'khazana.demo.pin';

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function isDemoSession(): boolean {
  try { return session()?.getItem(DEMO_SESSION_KEY) === '1'; } catch { return false; }
}

export function demoSessionGet(key: string): string | null {
  try { return session()?.getItem(key) ?? null; } catch { return null; }
}

export function demoSessionSet(key: string, value: string): void {
  try { session()?.setItem(key, value); } catch { /* private mode */ }
}

export function demoSessionRemove(key: string): void {
  try { session()?.removeItem(key); } catch { /* private mode */ }
}
