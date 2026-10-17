'use client';
/**
 * A headline figure with its recent trend tucked into the corner: the number
 * large, a change chip, and a faded line whose last point is pinned with the
 * same figure — so the line and the number can never disagree.
 *
 * The change chip is coloured by whether the move is good, not by its sign:
 * liabilities falling is green. The arrow carries the direction for anyone who
 * cannot tell the colours apart.
 *
 * The line owns the right half of the tile and the number the left, at every
 * width. It is a stretched SVG (non-scaling stroke); the end dot and its label
 * are HTML placed by percentage, so they stay round when the tile is wide.
 */
import clsx from 'clsx';
import { useId } from 'react';
import { CHART } from './tokens';
import { smoothPath } from './smoothPath';

const SW = 200;
const SH = 110;

export function TrendTile({
  title, value, values, color, tint, change, compareLabel = 'vs last month', sub, marker, markerSub, ghost = false, className,
}: {
  title: string;
  /** Already formatted. */
  value: string;
  /** Oldest first; the last entry is the figure in `value`. */
  values: number[];
  color: string;
  /** Corner wash, usually the soft version of `color`. */
  tint: string;
  /** Direction, worded size (e.g. "4.4%" or "2.1×") and whether it is good news; null hides the chip. */
  change: { up: boolean; text: string; good: boolean } | null;
  compareLabel?: string;
  sub?: string;
  /** The pinned label on the line's last point, e.g. "₹15.07 L". */
  marker: string;
  markerSub?: string;
  ghost?: boolean;
  className?: string;
}) {
  const gradId = useId().replace(/:/g, '');
  const hasLine = values.length >= CHART.minSeriesPoints && !ghost;
  const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * 0.3 || Math.abs(hi) * 0.05 || 1;
  const pts = values.map((v, i) => [
    2 + ((SW - 10) * i) / Math.max(values.length - 1, 1),
    12 + (SH - 24) * (1 - (v - lo + pad) / (hi - lo + 2 * pad)),
  ] as const);
  const line = hasLine ? smoothPath(pts) : '';
  const [ex, ey] = pts[pts.length - 1] ?? [0, 0];
  const ax = `${(ex / SW) * 100}%`, ay = `${(ey / SH) * 100}%`;

  return (
    <section
      className={clsx('card relative overflow-hidden', className)}
      aria-label={ghost ? `${title} hidden` : `${title} ${value}${change ? `, ${change.up ? 'up' : 'down'} ${change.text} ${compareLabel}` : ''}`}
    >
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(120% 140% at 100% 100%, ${tint}, transparent 60%)` }} />
      <div className="relative min-h-[190px] px-5 pt-4 pb-5 flex flex-col">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="mr-auto text-[16px] font-medium tracking-[-0.01em]">{title}</h3>
          {change && (
            <span className={clsx('inline-flex items-center gap-1 text-[12.5px] font-semibold tnum', change.good ? 'text-success' : 'text-danger')}>
              <span aria-hidden className={clsx('w-[18px] h-[18px] rounded-[6px] grid place-items-center text-[11px]', change.good ? 'bg-success-soft' : 'bg-danger-soft')}>
                {change.up ? '↑' : '↓'}
              </span>
              {change.text}
              <span className="font-normal text-muted">{compareLabel}</span>
            </span>
          )}
        </div>
        {hasLine && (
          <div aria-hidden className="absolute right-0 bottom-0 w-1/2 h-[110px]">
            <span className="absolute inset-0 [mask-image:linear-gradient(to_left,#000,transparent)]"
              style={{ backgroundImage: 'radial-gradient(var(--grid-line) 1.1px, transparent 1.3px)', backgroundSize: '8px 8px' }} />
            <svg viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
              <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={color} stopOpacity={0.22} />
                  <stop offset="1" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <line x1={ex} x2={ex} y1={0} y2={SH} stroke="var(--grid-line)" vectorEffect="non-scaling-stroke" />
              <path d={`${line} L${ex},${SH} L${pts[0][0]},${SH} Z`} fill={`url(#${gradId})`} />
              <path d={line} fill="none" stroke={color} strokeWidth={CHART.lineWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_2px_var(--card)]"
              style={{ left: ax, top: ay, background: color }} />
            <span className="absolute card px-2 py-[3px] text-[12px] font-semibold leading-tight tnum whitespace-nowrap shadow-[var(--shadow-float)] rounded-[8px]"
              style={{ left: ax, top: ay, transform: 'translate(calc(-100% - 10px), -50%)' }}>
              {marker}
              {markerSub && <span className="block text-[10.5px] font-normal text-muted">{markerSub}</span>}
            </span>
          </div>
        )}
        <div className="relative mt-auto pt-8 max-w-[50%] text-[clamp(28px,3.2vw,40px)] font-light tracking-[-0.035em] leading-none tnum">{ghost ? '••••••' : value}</div>
        {sub && <div className="relative mt-1.5 text-[12.5px] text-muted truncate max-w-[50%]">{sub}</div>}
      </div>
    </section>
  );
}
