'use client';
import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';

// Locks the vault after a period of inactivity, and when the tab has been
// hidden long enough — so an unlocked session never sits open unattended.
const IDLE_MS = 5 * 60 * 1000;       // 5 min of no interaction
const HIDDEN_GRACE_MS = 2 * 60 * 1000; // locks if hidden longer than this

export function AutoLock() {
  const lock = useApp((s) => s.lock);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => lock(), IDLE_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else {
        if (hiddenAt.current && Date.now() - hiddenAt.current > HIDDEN_GRACE_MS) {
          lock();
          return;
        }
        hiddenAt.current = null;
        reset();
      }
    };
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => document.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => document.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lock]);

  return null;
}
