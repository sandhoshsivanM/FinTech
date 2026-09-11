'use client';
/**
 * Whether the desktop app may fetch live prices.
 *
 * **Defaults to ON, and is opt-out.** That is the opposite of `useDemoData()`
 * next door, and the difference is deliberate: the demo feed defaults off
 * because it *invents* figures about instruments a user really owns, which is a
 * claim they never agreed to. A Yahoo quote invents nothing — it is the real
 * price, and the request carries a ticker and nothing else. The privacy page
 * has listed `query1.finance.yahoo.com` as a destination since before this
 * existed, so a user reading the app's own disclosure already expects it.
 *
 * Turning it off is absolute: `fetchQuotes` is never called, so the app makes
 * no network request at all and prices come from import or manual entry, as
 * they did before.
 *
 * Stored in localStorage rather than the vault: it is a device preference, not
 * financial data, and it has to be readable before anything is unlocked.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'khazana-live-prices';

// Same external-store shape as `useDemoData`: localStorage fires no event for a
// same-tab write, so the setter notifies subscribers itself.
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Absent means on — this is opt-out, so only an explicit '0' disables it. */
function read(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function useLivePrices(): [boolean, (v: boolean) => void] {
  // The server snapshot must match `read()`'s default, or the first client
  // render disagrees with the prerendered HTML and React discards it.
  const on = useSyncExternalStore(subscribe, read, () => true);

  const set = (v: boolean) => {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private mode */ }
    listeners.forEach((fn) => fn());
  };

  return [on, set];
}

/** The same value outside React, for code paths that are not components. */
export function livePricesEnabled(): boolean {
  return read();
}
