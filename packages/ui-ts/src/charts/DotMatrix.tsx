'use client';
/**
 * A block of dots per item, filled to its share — goals saved, quotas used.
 *
 * Read as "how full", not as a precise value: the % above each block carries
 * the number, the dots carry the comparison between blocks. Dots fill column
 * by column from the left, so a fuller block is visibly wider on the ink side.
 */
import clsx from 'clsx';
import { useState } from 'react';

export interface DotGroup {
  label: string;
  /** 0–1. */
  fraction: number;
  color: string;
  /** Shown under the blocks while this one is hovered, e.g. "₹42,000 of ₹60,000". */
  detail?: string;
}

const ROWS = 5;
const COLS = 7;

export function DotMatrix({ groups, ariaLabel }: { groups: DotGroup[]; ariaLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (groups.length === 0) return null;
  const n = ROWS * COLS;
  const shown = hover != null ? groups[hover] : null;

  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel ?? groups.map((g) => `${g.label} ${Math.round(g.fraction * 100)}%`).join(', ')}
        className="flex justify-between gap-2.5"
        onMouseLeave={() => setHover(null)}
      >
        {groups.slice(0, 4).map((g, gi) => {
          const filled = Math.round(Math.min(Math.max(g.fraction, 0), 1) * n);
          return (
            <div key={g.label} className="grid gap-2 justify-items-start cursor-default" onMouseEnter={() => setHover(gi)}>
              <span className={clsx('text-[20px] font-light tracking-[-0.02em] tnum leading-none transition-colors',
                hover === gi ? 'text-ink' : 'text-muted')}>
                {Math.round(g.fraction * 100)}%
              </span>
              <span className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: `repeat(${ROWS}, 7px)`, gridAutoColumns: '7px' }}>
                {Array.from({ length: n }, (_, i) => (
                  <span
                    key={i}
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ background: i < filled ? g.color : `color-mix(in srgb, ${g.color} 16%, transparent)` }}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 h-[18px] text-center text-[12px] text-ink-soft tnum truncate">
        {shown ? `${shown.label}${shown.detail ? ` · ${shown.detail}` : ''}` : ''}
      </p>
      <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1.5 text-[12px] text-ink-soft">
        {groups.slice(0, 4).map((g) => (
          <span key={g.label} className="inline-flex items-center gap-1.5 min-w-0">
            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: g.color }} />
            <span className="truncate">{g.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
