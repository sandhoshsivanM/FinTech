'use client';
import { useId, useRef, useState } from 'react';
import { CHART } from './tokens';
import { useEntrance } from './useEntrance';

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
  format,
  labels,
}: {
  values: number[];
  height?: number;
  color?: string;
  emptyLabel?: string;
  /** Renders the hovered point's figure. Without it the readout is the raw number. */
  format?: (n: number) => string;
  /** Label for the hovered point, e.g. a date. Index-aligned with `values`. */
  labels?: string[];
}) {
  const gradientId = useId();
  const { progress, transition } = useEntrance(values.length);
  // A trend line with no readout makes the reader estimate a value off an
  // unlabelled axis. Hovering names the point instead.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

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

  const onMove = (e: React.MouseEvent) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    // preserveAspectRatio="none" stretches the viewBox, so the nearest point is
    // found from the fraction across the element, not from SVG coordinates.
    const frac = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(values.length - 1, Math.round(frac * (values.length - 1)))));
  };

  const readout = hover != null ? values[hover] : null;

  return (
    <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {/* Overlaid, not stacked: a flow element here changed the component's
          height on hover and nudged everything below it. */}
      <div className="absolute top-0 left-0 right-0 text-center pointer-events-none z-10">
        {readout != null && (
          <span className="text-[12px] font-semibold tnum">
            {labels?.[hover!] && <span className="text-muted font-normal mr-2">{labels[hover!]}</span>}
            <span style={{ color }}>{format ? format(readout) : readout.toLocaleString('en-IN')}</span>
          </span>
        )}
      </div>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={CHART.areaFillOpacity + 0.06} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={area}
        fill={`url(#${gradientId})`}
        opacity={progress}
        style={{ transition: `opacity ${transition}` }}
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={CHART.lineWidth}
        strokeLinejoin={CHART.lineJoin}
        strokeLinecap={CHART.lineCap}
        vectorEffect="non-scaling-stroke"
        // Drawn left to right, the direction the data is read in. The length is
        // an over-estimate of the path — exactness does not matter, only that
        // it is never shorter than the real path, or the tail would be clipped.
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
        style={{ transition: `stroke-dashoffset ${transition}` }}
      />
      {hover != null && (
        <g>
          <line x1={hover * dx} y1={0} x2={hover * dx} y2={H} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <circle cx={hover * dx} cy={y(values[hover])} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
    </div>
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
