'use client';
import type { ReactNode } from 'react';
import { CHART } from './tokens';

export interface GaugeBand {
  /** Upper bound of this band, on the gauge's own scale. */
  upTo: number;
  color: string;
  label: string;
}

/** The health-score bands, matching `gradeOf` in domain/health.ts. */
export const HEALTH_BANDS: GaugeBand[] = [
  { upTo: 40, color: 'var(--expense)', label: 'At risk' },
  { upTo: 55, color: 'var(--warn)', label: 'Needs work' },
  { upTo: 70, color: 'var(--warn)', label: 'Fair' },
  { upTo: 85, color: 'var(--income)', label: 'Strong' },
  { upTo: 100, color: 'var(--income)', label: 'Excellent' },
];

/**
 * A banded arc gauge for a single graded number. The web twin of Flutter's
 * `GaugeChart`.
 *
 * Two things separate it from `Ring`, which is used for goals and budgets:
 *
 *  * It sweeps 240°, not 360°. A full ring reads as "proportion of a whole"; an
 *    open arc reads as "position on a scale", which is what a score is.
 *  * `value` is nullable. Null renders an empty track and "Not yet tracked" —
 *    not an arc at zero, which would show a failing grade for data the app does
 *    not have. If you find yourself writing `value={x ?? 0}`, that rule has
 *    been lost.
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  bands = HEALTH_BANDS,
  size = 180,
  stroke = 14,
  sweepDegrees = 240,
  label,
  sublabel,
  untrackedLabel = 'Not yet tracked',
  children,
}: {
  value: number | null;
  min?: number;
  max?: number;
  bands?: GaugeBand[];
  size?: number;
  stroke?: number;
  sweepDegrees?: number;
  label?: string;
  sublabel?: string;
  untrackedLabel?: string;
  children?: ReactNode;
}) {
  const tracked = value !== null;
  const clamped = tracked ? Math.min(max, Math.max(min, value)) : min;
  const fraction = max <= min ? 0 : (clamped - min) / (max - min);

  const bandColor = (v: number) =>
    bands.find((b) => v <= b.upTo)?.color ?? bands[bands.length - 1]?.color ?? 'var(--accent)';
  const active = tracked ? bandColor(clamped) : 'var(--muted)';

  const cx = size / 2;
  const r = (size - stroke) / 2;
  const cy = r + stroke / 2;
  const sweep = (sweepDegrees * Math.PI) / 180;
  const start = -Math.PI / 2 - sweep / 2;

  const point = (angle: number, radius: number) => [
    cx + Math.cos(angle) * radius,
    cy + Math.sin(angle) * radius,
  ];
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from, r);
    const [x2, y2] = point(to, r);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  // The arc is open at the bottom; trimming that dead space stops the gauge
  // pushing everything below it down by a quarter of its own height.
  const height = size * 0.82;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height }}
      role="img"
      aria-label={tracked ? `${label ?? Math.round(clamped)}${sublabel ? `, ${sublabel}` : ''}` : untrackedLabel}
    >
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`} aria-hidden>
        {/* Track: the active band lightened toward the surface, so the state
            reads across the whole arc rather than only its filled part. */}
        <path
          d={arc(start, start + sweep)}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={tracked ? active : 'var(--fill-strong)'}
          opacity={tracked ? 0.18 : 1}
        />
        {tracked && fraction > 0 && (
          <path
            d={arc(start, start + sweep * fraction)}
            fill="none"
            stroke={active}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ transition: 'd .6s cubic-bezier(.4,0,.2,1)' }}
          />
        )}
        {/* Band boundaries as gaps in the track. Five coloured segments would
            put a rainbow on what is an ordered scale. */}
        {tracked && max > min && bands.map((b) => {
          if (b.upTo <= min || b.upTo >= max) return null;
          const a = start + sweep * ((b.upTo - min) / (max - min));
          const [x1, y1] = point(a, r - stroke / 2);
          const [x2, y2] = point(a, r + stroke / 2);
          return (
            <line
              key={b.upTo}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--surface)"
              strokeWidth={CHART.markGap}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" style={{ paddingTop: size * 0.08 }}>
        {children ?? (
          <div>
            <div
              className="font-extrabold leading-none"
              style={{ color: active, fontSize: size * 0.19 }}
            >
              {label ?? (tracked ? Math.round(clamped) : '—')}
            </div>
            <div className="text-[11px] font-semibold text-muted mt-1">
              {tracked ? (sublabel ?? '') : untrackedLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
