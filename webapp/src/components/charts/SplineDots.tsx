'use client';
/**
 * A short daily series as a smooth line with a point per day — "spent this
 * week". Few enough points that each one is worth marking; the latest is
 * larger and carries its value, and hovering any point moves the readout there.
 *
 * The line is a stretched SVG (non-scaling stroke keeps it 2px); the points and
 * readout are HTML laid over it, so they stay round at every card width.
 */
import clsx from 'clsx';
import { useId, useState } from 'react';
import { CHART } from './tokens';
import { smoothPath } from './smoothPath';

export interface SplinePoint { label: string; value: number; title?: string }

const W = 600;
const H = 130;

export function SplineDots({ points, format, color = 'var(--data-rose)', ariaLabel }: {
  points: SplinePoint[];
  format: (n: number) => string;
  color?: string;
  ariaLabel?: string;
}) {
  const gradId = useId().replace(/:/g, '');
  const last = points.length - 1;
  const [active, setActive] = useState<number>(last);
  if (points.length < CHART.minSeriesPoints) return null;

  const max = Math.max(...points.map((p) => p.value), 0) * 1.2 || 1;
  const x = (i: number) => 4 + (i / last) * (W - 8);
  const y = (v: number) => H - 8 - (Math.max(0, v) / max) * (H - 16);
  const xy = points.map((p, i) => [x(i), y(p.value)] as const);
  const line = smoothPath(xy);
  const px = (i: number) => `${(x(i) / W) * 100}%`;
  const py = (v: number) => `${(y(v) / H) * 100}%`;
  const a = points[active] ?? points[last];

  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel ?? points.map((p) => `${p.title ?? p.label} ${format(p.value)}`).join(', ')}
        className="relative h-[130px] mt-1"
        onMouseLeave={() => setActive(last)}
      >
        {points.map((_, i) => (
          <span key={i} className="absolute inset-y-0 w-px bg-[var(--grid-line)]" style={{ left: px(i) }} />
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.16} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${xy[last][0]},${H} L${xy[0][0]},${H} Z`} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={CHART.lineWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <span
            key={i}
            onMouseEnter={() => setActive(i)}
            className={clsx('absolute rounded-full -translate-x-1/2 -translate-y-1/2 cursor-default',
              i === active ? 'w-3 h-3 shadow-[0_0_0_3px_var(--card-2),0_4px_10px_rgba(0,0,0,0.25)]' : 'w-[9px] h-[9px] shadow-[0_0_0_2.5px_var(--card)]')}
            style={{ left: px(i), top: py(p.value), background: color }}
          />
        ))}
        <span
          className="float-pill absolute px-2.5 py-[3px] text-[11.5px] font-semibold tnum whitespace-nowrap pointer-events-none"
          style={{
            left: px(active), top: py(a.value),
            // Slide toward the inside at either end so the pill never leaves the card.
            transform: `translate(${-(active / last) * 100}%, calc(-100% - 14px))`,
          }}
        >
          {a.title ?? a.label} {format(a.value)}
        </span>
      </div>
      <div className="flex justify-between mt-2 text-[11.5px]">
        {points.map((p, i) => (
          <span key={i} className={clsx('w-0 flex justify-center whitespace-nowrap', i === active ? 'text-ink font-semibold' : 'text-muted')}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
