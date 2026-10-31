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
  color = 'var(--data-blue)',
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
              <stop offset="0%" stopColor={color} stopOpacity="0.42" />
              <stop offset="55%" stopColor={color} stopOpacity="0.14" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
            {/* A dot screen over the fill: texture, so the area reads as a
                material rather than a tint. */}
            <pattern id={`${gradId}-dots`} width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill={color} fillOpacity="0.35" />
            </pattern>
            {/* The draw-in is a left-to-right reveal, not a stroke-dash trick.
                `pathLength` dashes with `non-scaling-stroke` on a stretched
                viewBox are measured differently by Firefox, which ended the
                line about two-thirds of the way across. */}
            <clipPath id={`${gradId}-reveal`}>
              <rect
                x={-10} y={-20} width={VB_W + 20} height={height + 40}
                style={{ transform: `scaleX(${progress})`, transformOrigin: '0 0', transition: `transform ${transition}` }}
              />
            </clipPath>
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
          <path d={area} fill={`url(#${gradId}-dots)`} style={{ opacity: progress * 0.6, transition: `opacity ${transition}` }} />
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={CHART.lineWidth}
            strokeLinecap={CHART.lineCap}
            strokeLinejoin={CHART.lineJoin}
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${gradId}-reveal)`}
          />

        </svg>

        {/* The point in focus (hovered, else the latest) stands in a glass
            capsule that drops to the axis, with its value on a pill above. */}
        {(() => {
          const pt = hover != null ? activePt : last;
          const idx = hover != null ? active : n - 1;
          const top = (pt[1] / height) * 100;
          return (
            <>
              <span
                aria-hidden
                className="absolute bottom-0 w-[26px] -translate-x-1/2 rounded-full pointer-events-none"
                style={{
                  left: `${(pt[0] / VB_W) * 100}%`,
                  top: `calc(${top}% - 13px)`,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${color} 55%, transparent), color-mix(in srgb, ${color} 12%, transparent))`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
                }}
              />
              {hover == null && <span
                aria-hidden
                className="absolute -translate-x-1/2 -translate-y-full rounded-full px-2.5 py-1 fs-11 font-semibold text-white tnum pointer-events-none whitespace-nowrap"
                style={{
                  left: `clamp(36px, ${(pt[0] / VB_W) * 100}%, calc(100% - 36px))`,
                  top: `calc(${top}% - 18px)`,
                  background: color,
                  boxShadow: `0 6px 14px -6px ${color}`,
                }}
              >
                {format(values[idx])}
              </span>}
            </>
          );
        })()}

        {/* Round marks are HTML: the viewBox is stretched, which would turn a
            <circle> into an ellipse at anything but a 1:1 aspect. */}
        <span
          className="absolute w-[11px] h-[11px] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_0_3px_var(--card-2),0_4px_10px_rgba(0,0,0,0.25)]"
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
              <div className="fs-11.5 text-muted">{caption}</div>
              <div className="fs-16 font-normal tracking-[-0.02em] tnum mt-0.5">{format(values[active])}</div>
              <div className={`fs-11.5 mt-0.5 tnum ${changePct >= 0 ? 'text-success' : 'text-danger'}`}>
                {changePct >= 0 ? '+' : '−'}{Math.abs(changePct).toFixed(2)}% from previous
              </div>
            </div>
          </>
        )}

        {/* Y-axis ticks, in HTML for the same reason as the marks. */}
        {GRID_BANDS.map((f) => (
          <span
            key={f}
            className="absolute left-0 fs-11 text-muted pr-1.5 pointer-events-none"
            style={{ top: 12 + (height - 12) * f - 16 }}
          >
            {format(hi - (hi - lo) * f)}
          </span>
        ))}
      </div>

      {labels.length > 0 && (
        <div className="flex justify-between mt-2 fs-11 text-muted">
          {labels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
