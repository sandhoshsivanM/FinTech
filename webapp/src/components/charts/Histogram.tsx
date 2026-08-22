'use client';
/**
 * Count histogram — bars rise from a single baseline, one per bucket.
 *
 * Distinct from [ColumnChart], which is a *signed* chart: its bars grow up and
 * down from a centre rule because the value's sign is the point. Here every
 * count is positive and the sign lives in the bucket, not the bar, so a centre
 * rule would draw a zero line that nothing ever crosses.
 *
 * Per-bar colour is the whole reason this is separate: the buckets below cost
 * take the danger token, which is what makes the losing side legible without
 * reading the axis.
 */
import clsx from 'clsx';
import { useState } from 'react';

export interface Bin {
  label: string;
  /** Long form for the hover title and the accessible description. */
  title?: string;
  count: number;
  /** Any CSS colour. Defaults to the accent. */
  color?: string;
}

export function Histogram({
  bins,
  height = 190,
  unit = 'position',
  ariaLabel,
}: {
  bins: Bin[];
  height?: number;
  /** Singular noun for the tooltip: "3 positions". */
  unit?: string;
  ariaLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (bins.length === 0) return null;

  // Headroom so the tallest bar does not touch the top of the plot, and a
  // floor of 1 so an all-empty histogram still lays out instead of dividing
  // by zero.
  const max = Math.max(...bins.map((b) => b.count)) * 1.16 || 1;
  const plotH = height - 24;
  const total = bins.reduce((s, b) => s + b.count, 0);

  return (
    <div
      role="img"
      aria-label={
        ariaLabel
        ?? `${total} ${unit}s across ${bins.length} buckets: `
          + bins.map((b) => `${b.title ?? b.label}, ${b.count}`).join('; ')
      }
      className="flex items-stretch gap-[2px]"
      onMouseLeave={() => setHover(null)}
    >
      {bins.map((b, i) => {
        // An empty bucket draws nothing at all. A minimum-height stub would
        // make "no positions here" look identical to "one position here",
        // which is the single most misleading thing a histogram can do.
        const empty = b.count === 0;
        const barH = empty ? 0 : Math.max((b.count / max) * plotH, 3);
        const title = `${b.title ?? b.label}: ${b.count} ${unit}${b.count === 1 ? '' : 's'}`;
        return (
          <div
            key={`${b.label}-${i}`}
            className="flex min-w-0 flex-1 cursor-default flex-col items-center gap-1.5"
            onMouseEnter={() => setHover(i)}
            style={{
              opacity: hover == null || hover === i ? 1 : 0.4,
              transition: 'opacity 120ms ease',
            }}
          >
            <div className="flex w-full flex-col items-center justify-end" style={{ height: plotH }}>
              {/* Reserved whether or not it is shown: inserting the figure on
                  hover pushed the bar down, so the chart jumped under the
                  cursor. */}
              <span
                className="mb-0.5 whitespace-nowrap text-[10px] font-bold tnum text-ink"
                style={{ visibility: !empty && hover === i ? 'visible' : 'hidden' }}
              >
                {b.count}
              </span>
              {!empty && (
                <span
                  title={title}
                  className="block w-full min-w-[5px] max-w-[26px] rounded-t-[4px] transition-[filter] duration-150 hover:brightness-110"
                  style={{
                    height: barH,
                    background: b.color ?? 'var(--accent)',
                    animation: 'kz-grow 620ms var(--ease) backwards',
                  }}
                />
              )}
            </div>
            <span
              className={clsx(
                'max-w-full truncate text-[11px] transition-colors',
                hover === i ? 'font-bold text-ink' : 'font-semibold text-muted',
              )}
            >
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
