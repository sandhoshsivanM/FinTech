'use client';
/**
 * The small trend line that sits inside a KPI tile.
 *
 * Deliberately unlabelled and unaxised — it carries shape, not magnitude. The
 * tile beside it owns the number. Renders nothing at all when there are fewer
 * than two points, rather than drawing a flat line that would imply "no change"
 * where the truth is "no history".
 */
import { useId } from 'react';

export function MiniSparkline({
  values,
  width = 92,
  height = 30,
  color = 'var(--accent)',
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  const gradId = useId().replace(/:/g, '');
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 2) + 1,
    height - pad - ((v - min) / span) * (height - pad * 2),
  ] as const);

  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${d}L${pts[pts.length - 1][0].toFixed(1)},${height}L${pts[0][0].toFixed(1)},${height}Z`;
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible shrink-0">
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
    </svg>
  );
}

/**
 * A ranked list of proportional bars — "Top 5 gainers", "Top 5 losers".
 *
 * Bars are scaled against the largest absolute value in the list, so the
 * longest bar always fills the track and the rest read relative to it. The
 * number is printed beside every row: bar length alone is a comparison, not a
 * value.
 */
export function RankBars({
  rows,
  color,
  formatValue,
  emptyLabel = 'Nothing to show',
}: {
  rows: { key: string; label: string; sub?: string; value: number }[];
  color: string;
  formatValue: (n: number) => string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-muted">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  return (
    <ol className="grid gap-3">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-center gap-3">
          <span className="w-3.5 shrink-0 text-[11.5px] font-semibold text-muted tnum">{i + 1}</span>
          <span className="w-[86px] shrink-0 min-w-0">
            <span className="block text-[12.5px] font-semibold truncate">{r.label}</span>
            {r.sub && <span className="block text-[10.5px] text-muted truncate">{r.sub}</span>}
          </span>
          <span className="flex-1 h-2 rounded-full bg-fill-strong overflow-hidden min-w-0">
            <span
              className="block h-full rounded-full transition-[width] duration-500 ease-standard"
              style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: color }}
            />
          </span>
          <span className="shrink-0 text-[12.5px] font-semibold tnum tabular-nums" style={{ color }}>
            {formatValue(r.value)}
          </span>
        </li>
      ))}
    </ol>
  );
}
