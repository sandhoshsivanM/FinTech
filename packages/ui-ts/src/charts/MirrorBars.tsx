'use client';
/**
 * Two quantities per period mirrored about one line — money in above, money
 * out below — so a month where the lower bar outgrows the upper one is visible
 * without reading a number. Both halves share one scale; a separate scale per
 * side would make a ₹1L outflow and a ₹1.4L inflow look the same length.
 *
 * The selected period is solid and the rest are tinted; hovering or focusing a
 * period selects it and the readout above names its figures.
 */
import clsx from 'clsx';
import { useState } from 'react';

export interface MirrorRow { label: string; up: number; down: number }

export function MirrorBars({
  rows, format, upLabel = 'in', downLabel = 'out',
  upColor = 'var(--data-blue)', downColor = 'var(--ink-soft)', height = 150, ariaLabel,
}: {
  rows: MirrorRow[];
  format: (n: number) => string;
  upLabel?: string;
  downLabel?: string;
  upColor?: string;
  downColor?: string;
  height?: number;
  ariaLabel?: string;
}) {
  const last = rows.length - 1;
  const [sel, setSel] = useState(last);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.flatMap((r) => [r.up, r.down]), 0) || 1;
  const s = rows[Math.min(sel, last)];
  const kept = s.up - s.down;

  return (
    <div>
      <p className="fs-12 text-muted tnum mb-3 truncate">
        <span className="text-ink font-semibold">{s.label}</span>
        {' · '}<span className="text-success">{format(s.up)} {upLabel}</span>
        {' · '}<span>{format(s.down)} {downLabel}</span>
        {' · '}<span className={kept >= 0 ? 'text-success' : 'text-danger'}>{kept >= 0 ? 'kept ' : 'short '}{format(Math.abs(kept))}</span>
      </p>
      <div
        role="img"
        aria-label={ariaLabel ?? rows.map((r) => `${r.label}: ${format(r.up)} ${upLabel}, ${format(r.down)} ${downLabel}`).join('; ')}
        className="relative flex gap-1"
        style={{ height }}
        onMouseLeave={() => setSel(last)}
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        {rows.map((r, i) => {
          const on = i === sel;
          return (
            <div key={`${r.label}-${i}`} className="flex-1 min-w-0 flex flex-col items-center cursor-default" onMouseEnter={() => setSel(i)}>
              <div className="h-1/2 w-full flex justify-center items-end pb-0.5">
                <span className="block w-full max-w-3 rounded-full transition-colors duration-150"
                  style={{ height: `${(r.up / max) * 100}%`, background: on ? upColor : `color-mix(in srgb, ${upColor} 28%, transparent)` }} />
              </div>
              <div className="h-1/2 w-full flex justify-center items-start pt-0.5">
                <span className="block w-full max-w-3 rounded-full transition-colors duration-150"
                  style={{ height: `${(r.down / max) * 100}%`, background: on ? downColor : `color-mix(in srgb, ${downColor} 22%, transparent)` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1.5">
        {rows.map((r, i) => (
          <span key={`${r.label}-${i}`} className={clsx('flex-1 min-w-0 text-center fs-11 whitespace-nowrap',
            i === sel ? 'text-ink font-semibold' : 'text-muted')}>
            {/* Every other label, plus the selected one, so twelve fit on a phone. */}
            {(last - i) % 2 === 0 || i === sel ? r.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
