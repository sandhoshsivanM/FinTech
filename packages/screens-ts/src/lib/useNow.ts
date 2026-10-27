'use client';
import { useEffect, useState } from 'react';

/**
 * The current time, as React state.
 *
 * Calling `Date.now()` during render is impure — the value changes between
 * renders for reasons React cannot see, which makes any memo derived from it
 * unstable. This reads the clock in an effect instead and refreshes it on an
 * interval, so "Due in 3 days" is still correct on a tab that has been open
 * since yesterday.
 *
 * Returns 0 until the first tick lands (one frame after mount, and during the
 * static-export prerender). Callers must treat 0 as "not known yet" rather than
 * as the epoch — `useNowReady` below is the usual guard.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    // Scheduled rather than called inline: a synchronous setState in an effect
    // body cascades an extra render on every mount.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [intervalMs]);

  return now;
}

/** Whole days from `now` until `then`. Null while the clock is not known. */
export function daysUntil(then: number, now: number): number | null {
  if (!now) return null;
  return Math.ceil((then - now) / 86_400_000);
}
