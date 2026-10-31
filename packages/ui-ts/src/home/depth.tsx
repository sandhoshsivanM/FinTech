'use client';
/**
 * The depth kit, Zentra edition: plain tinted icon circles and the thick
 * gauge with a % chip. Shapes and shadows live in globals.css (.gloss-tile,
 * .gauge-*); these components only pick colours.
 */
import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Hues by meaning. Values are CSS variables so dark mode lifts them.
 * `ink` is neutral; blue is the data colour; green = in / good; pink = out /
 * over; amber = close to a limit.
 */
export const HUES = {
  ink: 'var(--ink)',
  blue: 'var(--data-blue)',
  green: 'var(--data-green)',
  pink: 'var(--data-rose)',
  amber: 'var(--data-amber)',
  grey: 'var(--muted)',
} as const;
export type Hue = keyof typeof HUES;

/** A plain icon circle, tinted in its hue: no gloss, no gradient. */
export function GlossTile({
  hue, size = 40, children, className,
}: { hue: Hue; size?: number; radius?: number; children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('gloss-tile grid place-items-center shrink-0 rounded-full', className)}
      style={{ width: size, height: size, ['--tile-b' as string]: HUES[hue] }}
    >
      {children}
    </span>
  );
}

/** The gauge hue for a used fraction: blue while fine, amber from 80%, pink over. */
export function gaugeHue(fraction: number): Hue {
  return fraction > 1 ? 'pink' : fraction >= 0.8 ? 'amber' : 'blue';
}

/**
 * A thick gauge with the value on a chip at its tip, inside a white recessed
 * track — the budget / coverage / goal progress bar.
 */
export function Gauge({
  fraction, hue, label, scale = false, className,
}: { fraction: number; hue?: Hue; label?: string; scale?: boolean; className?: string }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const safe = Number.isFinite(fraction) ? fraction : 0;
  const pct = Math.max(0, Math.min(1, safe)) * 100;
  const color = HUES[hue ?? gaugeHue(safe)];
  return (
    <div className={className}>
      <div className="gauge-track">
        <div
          className="gauge-fill transition-[width] duration-700 ease-standard"
          style={{ width: grown ? `max(46px, ${pct}%)` : '46px', ['--g-b' as string]: color }}
        >
          <span className="gauge-chip tnum">{label ?? `${Math.round(safe * 100)}%`}</span>
        </div>
      </div>
      {scale && (
        <div className="mt-1 flex justify-between px-1 fs-10 text-muted tnum" aria-hidden>
          {[0, 20, 40, 60, 80, 100].map((n) => <span key={n}>{n}</span>)}
        </div>
      )}
    </div>
  );
}
