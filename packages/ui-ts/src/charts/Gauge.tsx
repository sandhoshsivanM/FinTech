'use client';
import { useId, type ReactNode } from 'react';
import { useEntrance } from './useEntrance';

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
 * The Zentra score ring for a single graded number: a 270° arc open at the
 * bottom, round caps, a blue gradient with a soft blue glow, and the score
 * large and light in the middle. Bands still drive the grade word, not the
 * colour — the ring stays blue. The web twin of Flutter's `GaugeChart`.
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
  sweepDegrees = 270,
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
  const { progress, transition } = useEntrance(value);
  const gid = useId().replace(/:/g, '');
  const tracked = value !== null;
  const clamped = tracked ? Math.min(max, Math.max(min, value)) : min;
  const fraction = max <= min ? 0 : (clamped - min) / (max - min);

  // Bands are kept in the signature for the grade text callers derive; the
  // ring itself is always the blue gradient.
  void bands;

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
  // pushing everything below it down.
  const height = size * 0.9;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height }}
      role="img"
      aria-label={tracked ? `${label ?? Math.round(clamped)}${sublabel ? `, ${sublabel}` : ''}` : untrackedLabel}
    >
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`} aria-hidden className="overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--data-blue-a)" />
            <stop offset="1" stopColor="var(--data-blue)" />
          </linearGradient>
        </defs>
        <path
          d={arc(start, start + sweep)}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="color-mix(in srgb, var(--ink) 8%, transparent)"
        />
        {tracked && fraction > 0 && (() => {
          // Drawn at full length and revealed with dash-offset: stroke-dashoffset
          // animates reliably across browsers where a path's `d` does not.
          const len = r * sweep * fraction;
          return (
            <path
              d={arc(start, start + sweep * fraction)}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len * (1 - progress)}
              style={{
                transition: `stroke-dashoffset ${transition}`,
                filter: 'drop-shadow(0 5px 6px color-mix(in srgb, var(--data-blue) 35%, transparent))',
              }}
            />
          );
        })()}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <div>
            <div
              className="font-light leading-none tracking-[-0.03em] text-ink"
              style={{ fontSize: size * 0.24 }}
            >
              {label ?? (tracked ? Math.round(clamped) : '—')}
            </div>
            <div className="text-[12px] text-muted mt-1.5">
              {tracked ? (sublabel ?? '') : untrackedLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
