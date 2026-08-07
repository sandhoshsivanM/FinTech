'use client';
/**
 * The portfolio performance chart.
 *
 * Gradient area, 2px line, recessive grid, emphasised endpoint, and a
 * crosshair + tooltip on hover — an HTML chart is interactive by default, so
 * the hover layer ships rather than being an enhancement.
 *
 * Two geometry decisions worth knowing before editing:
 *   - The SVG is stretched (`preserveAspectRatio="none"`), so it carries paths
 *     and grid lines ONLY. Text would be squashed horizontally and circles
 *     would become ellipses, so axis labels and the round marks are HTML
 *     positioned over the plot.
 *   - Strokes use `vector-effect="non-scaling-stroke"` so a 2px line stays 2px
 *     at every width.
 */
import { useId, useMemo, useRef, useState } from 'react';
import { CHART } from './tokens';
import { useEntrance } from './useEntrance';
import { EmptyChart } from './AreaChart';

export interface LineChartProps {
  values: number[];
  /** Tick labels, spread evenly across the x-axis. */
  labels?: string[];
  height?: number;
  color?: string;
  /** Formats the y-axis ticks and the tooltip figure. */
  format?: (n: number) => string;
  /** Tooltip caption for a point — defaults to the nearest x-axis label. */
  captionFor?: (index: number, total: number) => string;
  emptyLabel?: string;
  ariaLabel?: string;
}

const VB_W = 1000;
const GRID_BANDS = [0.18, 0.45, 0.72];

export function LineChart({
  values,
  labels = [],
  height = 260,
  color = 'var(--accent)',
  format = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
  captionFor,
  emptyLabel = 'Not enough history yet',
  ariaLabel,
}: LineChartProps) {
  const gradId = useId().replace(/:/g, '');
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { progress, transition } = useEntrance(values.length);

  const geom = useMemo(() => {
    const n = values.length;
    if (n < CHART.minSeriesPoints) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return null;
    // Headroom below and above so the line never touches an edge.
    const lo = min - (max - min) * 0.22;
    const hi = max + (max - min) * 0.14;
    const X = (i: number) => (i / (n - 1)) * (VB_W - 8) + 4;
    const Y = (v: number) => height - ((v - lo) / (hi - lo)) * (height - 12);
    const pts = values.map((v, i) => [X(i), Y(v)] as const);

    // Catmull-Rom converted to cubic Bézier: smooth, and every control point is
    // derived from real neighbours, so the curve cannot invent a peak the data
    // does not have.
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? pts[i + 1];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const area = `${d}L${X(n - 1).toFixed(1)},${height}L${X(0).toFixed(1)},${height}Z`;
    return { d, area, pts, lo, hi, n };
  }, [values, height]);

  if (!geom) return <EmptyChart label={emptyLabel} />;

  const { d, area, pts, lo, hi, n } = geom;
  const last = pts[n - 1];
  const active = hover ?? n - 1;
  const activePt = pts[active];

  const onMove = (e: React.PointerEvent) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r) return;
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    setHover(Math.round(f * (n - 1)));
  };

  const caption = captionFor
    ? captionFor(active, n)
    : labels.length
      ? labels[Math.min(Math.round((active / (n - 1)) * (labels.length - 1)), labels.length - 1)]
      : `Point ${active + 1} of ${n}`;

  const prev = values[Math.max(active - 1, 0)];
  const changePct = prev ? ((values[active] - prev) / prev) * 100 : 0;

  return (
    <div>
      <div
        ref={plotRef}
        className="relative"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel ?? `Value over the selected range, from ${format(values[0])} to ${format(values[n - 1])}`}
          className="block overflow-visible"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.24" />
              <stop offset="48%" stopColor={color} stopOpacity="0.06" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {GRID_BANDS.map((f) => {
            const y = 12 + (height - 12) * f;
            return (
              <line
                key={f} x1={0} y1={y} x2={VB_W} y2={y}
                stroke="var(--grid-line)" strokeWidth={1} vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path d={area} fill={`url(#${gradId})`} style={{ opacity: progress, transition: `opacity ${transition}` }} />
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={CHART.lineWidth}
            strokeLinecap={CHART.lineCap}
            strokeLinejoin={CHART.lineJoin}
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
            style={{ transition: `stroke-dashoffset ${transition}` }}
          />

          {hover != null && (
            <line
              x1={activePt[0]} y1={6} x2={activePt[0]} y2={height}
              stroke="var(--ink-soft)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Round marks are HTML: the viewBox is stretched, which would turn a
            <circle> into an ellipse at anything but a 1:1 aspect. */}
        <span
          className="absolute w-[9px] h-[9px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_0_2.5px_var(--card)]"
          style={{ left: `${(last[0] / VB_W) * 100}%`, top: `${(last[1] / height) * 100}%`, background: color }}
        />
        {hover != null && (
          <>
            <span
              className="absolute w-[11px] h-[11px] rounded-full border-[2.5px] bg-card -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${(activePt[0] / VB_W) * 100}%`, top: `${(activePt[1] / height) * 100}%`, borderColor: color }}
            />
            <div
              className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full card px-3 py-2 min-w-[132px] shadow-[var(--shadow-2)]"
              style={{
                // Clamped so the tooltip never hangs off either edge.
                left: `clamp(74px, ${(activePt[0] / VB_W) * 100}%, calc(100% - 74px))`,
                top: `calc(${(activePt[1] / height) * 100}% - 14px)`,
              }}
            >
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">{caption}</div>
              <div className="text-[15px] font-bold tracking-[-0.025em] tnum mt-0.5">{format(values[active])}</div>
              <div className={`text-[11.5px] mt-0.5 tnum ${changePct >= 0 ? 'text-success' : 'text-danger'}`}>
                {changePct >= 0 ? '+' : '−'}{Math.abs(changePct).toFixed(2)}% from previous
              </div>
            </div>
          </>
        )}

        {/* Y-axis ticks, in HTML for the same reason as the marks. */}
        {GRID_BANDS.map((f) => (
          <span
            key={f}
            className="absolute left-0 text-[11px] font-semibold text-muted bg-card pr-1.5 pointer-events-none"
            style={{ top: 12 + (height - 12) * f - 16 }}
          >
            {format(hi - (hi - lo) * f)}
          </span>
        ))}
      </div>

      {labels.length > 0 && (
        <div className="flex justify-between mt-2 text-[11px] font-semibold text-muted">
          {labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
