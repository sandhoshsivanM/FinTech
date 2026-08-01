'use client';
import { useId } from 'react';
import { CHART } from './tokens';

/**
 * Trend line with a gradient area fill. The web twin of Flutter's `AreaChart`.
 *
 * Was `Sparkline` in ui.tsx. The rename is not cosmetic: this now renders on
 * three screens at once (Dashboard trend, Investments trend, Score history), and
 * the old version hardcoded `<linearGradient id="spark">`, so the second and
 * third instance on a page silently inherited the first one's gradient — SVG
 * ids are document-global. `useId()` is the fix.
 */
export function AreaChart({
  values,
  height = 140,
  color = 'var(--accent)',
  emptyLabel = 'Not enough data yet',
}: {
  values: number[];
  height?: number;
  color?: string;
  emptyLabel?: string;
}) {
  const gradientId = useId();

  if (values.length < CHART.minSeriesPoints) return <EmptyChart label={emptyLabel} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A perfectly flat series has no trend to draw, and dividing by its zero range
  // would put every point at NaN.
  if (max - min < 1e-9) return <EmptyChart label={emptyLabel} />;

  const W = 600;
  const H = height;
  const dx = W / (values.length - 1);
  const y = (v: number) => H - 10 - ((v - min) / (max - min)) * (H - 20);
  const pts = values.map((v, i) => `${i * dx},${y(v)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `${line} L ${W},${H} L 0,${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={CHART.areaFillOpacity + 0.06} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={CHART.lineWidth}
        strokeLinejoin={CHART.lineJoin}
        strokeLinecap={CHART.lineCap}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function EmptyChart({ label = 'Not enough data yet' }: { label?: string }) {
  return (
    <div className="h-36 flex flex-col items-center justify-center text-muted text-[13px] gap-1">
      <span className="w-8 h-px bg-[var(--line-strong)]" />
      {label}
    </div>
  );
}
