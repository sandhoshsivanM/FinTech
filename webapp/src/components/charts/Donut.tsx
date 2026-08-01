'use client';

/** A single slice. `color` is supplied by the caller — see ASSET_GROUP_META. */
export interface DonutSeg {
  label: string;
  value: number;
  color: string;
}

/**
 * Single-ring donut. The web twin of Flutter's `DonutChart`.
 *
 * Segments render in the order given and are never sorted here: for asset-group
 * data that order is `ASSET_GROUP_ORDER`, and the palette's colourblind
 * guarantee is a property of that exact adjacency.
 */
export function Donut({
  segments,
  size = 150,
  stroke = 20,
  centerText,
  centerSub,
  legend = true,
}: {
  segments: DonutSeg[];
  size?: number;
  stroke?: number;
  centerText?: string;
  centerSub?: string;
  legend?: boolean;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="var(--fill-strong)" strokeWidth={stroke} />
          {total > 0 &&
            segments.map((s, i) => {
              const frac = Math.max(0, s.value) / total;
              const len = frac * c;
              const el = (
                <circle
                  key={i}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${Math.max(0, len - 3)} ${c}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </g>
        {centerText && (
          <text
            x="50%"
            y="46%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-ink"
            style={{ fontSize: size > 150 ? 19 : 16, fontWeight: 700, letterSpacing: '-0.02em' }}
          >
            {centerText}
          </text>
        )}
        {centerSub && (
          <text
            x="50%"
            y="60%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--muted)"
            style={{ fontSize: 10.5, letterSpacing: '0.04em' }}
          >
            {centerSub}
          </text>
        )}
      </svg>
      {legend && (
        <div className="flex-1 min-w-0 space-y-2.5">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 text-[13.5px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="flex-1 min-w-0 text-ink-soft truncate">{s.label}</span>
              <span className="shrink-0 font-semibold text-ink tnum tabular-nums">
                {total <= 0 ? '0%' : `${Math.round((s.value / total) * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
