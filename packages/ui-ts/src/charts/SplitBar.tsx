'use client';
/**
 * One whole split into its parts, side by side: a % column over a coloured
 * track for each part. Income by source, spending by account — anything where
 * the parts add up to the headline above it.
 *
 * Widths are true proportions; a floor keeps a 3% part wide enough to carry
 * its label, and the label still states the real share. Hovering a part names
 * its amount in the column itself rather than in an OS tooltip, which never
 * appears on a touch screen.
 */
import clsx from 'clsx';
import { useState } from 'react';

export interface SplitSeg { label: string; value: number; color: string }

export function SplitBar({ segments, format, ariaLabel }: {
  segments: SplitSeg[];
  format: (n: number) => string;
  ariaLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((Math.max(0, v) / total) * 100);

  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel ?? segments.map((s) => `${s.label} ${pct(s.value)}%`).join(', ')}
        className="flex gap-1.5 items-stretch"
        onMouseLeave={() => setHover(null)}
      >
        {segments.map((s, i) => (
          <div
            key={s.label}
            className="min-w-[52px] flex flex-col gap-2 cursor-default"
            style={{ flex: `${Math.max(0, s.value) / total} 1 0` }}
            onMouseEnter={() => setHover(i)}
          >
            <div
              className={clsx(
                'h-[70px] rounded-[12px] grid place-content-center text-center transition-colors duration-150',
                hover === i ? 'text-ink' : 'text-muted',
              )}
              style={hover === i
                ? { background: 'repeating-linear-gradient(-45deg, var(--fill-strong) 0 2px, transparent 2px 6px)' }
                : undefined}
            >
              <span className="text-[22px] font-light tracking-[-0.02em] tnum leading-none">{pct(s.value)}%</span>
              <span
                className="mt-1 text-[11px] font-semibold tnum whitespace-nowrap"
                style={{ visibility: hover === i ? 'visible' : 'hidden' }}
              >
                {format(s.value)}
              </span>
            </div>
            <span className="block h-2.5 rounded-full" style={{ background: s.color }} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-3.5 gap-y-1.5 text-[12px] text-ink-soft">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
