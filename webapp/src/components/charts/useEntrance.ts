'use client';
import { useEffect, useState } from 'react';
import { CHART, prefersReducedMotion } from './tokens';

/**
 * Drives a chart's draw-in.
 *
 * Returns `progress` (0 before paint, 1 after) plus the transition string to
 * hand to the animated property. Starting at 0 and flipping to 1 in an effect
 * is what gives CSS a change to transition — setting the final value directly
 * would render it instantly.
 *
 * Reduced motion skips straight to 1 with no transition, so the chart is
 * complete on first paint rather than merely faster.
 */
export function useEntrance(key?: unknown): { progress: number; transition: string } {
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();
  const [progress, setProgress] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    setProgress(0);
    // Two frames: one for the browser to paint the 0 state, one to change it.
    // A single rAF sometimes lands in the same paint and the transition is
    // dropped.
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => setProgress(1));
      cleanup = () => cancelAnimationFrame(inner);
    });
    let cleanup = () => cancelAnimationFrame(outer);
    return () => cleanup();
    // Re-runs when the caller's key changes — e.g. drilling into a sunburst.
  }, [key, reduced]);

  return {
    progress,
    transition: reduced
      ? 'none'
      : `${CHART.entranceMs}ms ${CHART.entranceEasing}`,
  };
}
