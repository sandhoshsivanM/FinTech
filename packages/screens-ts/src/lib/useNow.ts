'use client';
import { useSyncExternalStore } from 'react';

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
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.get, serverNow);
}

/**
 * One shared ticker per interval rather than one `setInterval` per caller.
 * The dashboard alone mounted a dozen; each fired on its own schedule and
 * re-rendered its corner of the page separately. Now every screen reading the
 * clock updates in one batched render, and the timer stops when nobody reads.
 */
interface Clock { subscribe: (cb: () => void) => () => void; get: () => number }
const clocks = new Map<number, Clock>();
const serverNow = () => 0;

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (clock) return clock;
  let now = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let first: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const tick = () => {
    now = Date.now();
    for (const l of listeners) l();
  };
  clock = {
    get: () => now,
    subscribe: (cb) => {
      listeners.add(cb);
      if (listeners.size === 1) {
        // Scheduled, not inline: the first reading lands one task after mount.
        first = setTimeout(tick, 0);
        timer = setInterval(tick, intervalMs);
      }
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) {
          clearTimeout(first);
          clearInterval(timer);
          timer = undefined;
          // Back to "not known yet", as a fresh mount always saw: a reading
          // left over from an earlier visit could be hours old.
          now = 0;
        }
      };
    },
  };
  clocks.set(intervalMs, clock);
  return clock;
}

/** Whole days from `now` until `then`. Null while the clock is not known. */
export function daysUntil(then: number, now: number): number | null {
  if (!now) return null;
  return Math.ceil((then - now) / 86_400_000);
}
