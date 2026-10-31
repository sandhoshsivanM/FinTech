'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

/**
 * The Zentra donut series: blue, green, pink, grey, then tints of those.
 * CSS variables, so dark mode lifts them.
 */
export const ZENTRA_SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
] as const;

/** Colours a caller passes that mean "not a category" keep their grey. */
const NEUTRAL = new Set(['var(--muted)', 'var(--disabled)']);

/** A single slice. `color` is the caller's; the ring recolours by position to the Zentra series unless `keepColors`. */
export interface DonutSeg {
  label: string;
  value: number;
  color: string;
  /** Optional second line in the legend, e.g. a rupee figure or a count. */
  sub?: string;
}

/**
 * Single-ring donut. The web twin of Flutter's `DonutChart`.
 *
 * Segments render in the order given and are never sorted here: for asset-group
 * data that order is `ASSET_GROUP_ORDER`, and the palette's colourblind
 * guarantee is a property of that exact adjacency.
 *
 * FOLDING AND EXPANSION
 *
 * Pass the FULL list and a `maxSlices`; the donut folds the tail itself. That
 * matters because a folded "Others (10)" row is a dead end otherwise — the
 * reader can see that a third of the portfolio is in it but not what it is.
 * Here the row is a disclosure: it expands in place and lists every folded item
 * with its own share.
 *
 * The expanded items are listed but NOT given their own arcs. Only eight hues
 * are validated for colourblind separation, so a fifteen-colour ring would be
 * unreadable — the honest split is "the ring keeps one Other arc, the legend
 * carries the full detail".
 */
export function Donut({
  segments,
  size = 150,
  stroke = 20,
  centerText,
  centerSub,
  legend = true,
  maxSlices,
  otherLabel = 'Others',
  otherColor = 'var(--series-4)',
  formatValue,
  keepColors = false,
}: {
  segments: DonutSeg[];
  size?: number;
  stroke?: number;
  centerText?: string;
  centerSub?: string;
  legend?: boolean;
  /** Fold everything past this many slices into one "Others" arc. */
  maxSlices?: number;
  otherLabel?: string;
  otherColor?: string;
  /** Renders each legend row's absolute figure beside its share. */
  formatValue?: (n: number) => string;
  /** Use each segment's own colour instead of the Zentra series. */
  keepColors?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // Recolour by position: the legend is drawn from the same list, so ring and
  // legend always agree. Grey "unclassified" slices stay grey.
  let k = 0;
  segments = keepColors ? segments : segments.map((x) => (
    NEUTRAL.has(x.color) ? x : { ...x, color: ZENTRA_SERIES[k++ % ZENTRA_SERIES.length] }
  ));
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const shouldFold = maxSlices != null && segments.length > maxSlices;
  const head = shouldFold ? segments.slice(0, maxSlices) : segments;
  const tail = shouldFold ? segments.slice(maxSlices) : [];
  const tailTotal = tail.reduce((s, x) => s + Math.max(0, x.value), 0);

  const arcs: DonutSeg[] = shouldFold
    ? [...head, { label: `${otherLabel} (${tail.length})`, value: tailTotal, color: otherColor }]
    : head;

  const pct = (v: number) => (total <= 0 ? '0%' : `${Math.round((v / total) * 100)}%`);
  const hovered = hover != null ? arcs[hover] : undefined;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Floating % pills need room around the ring; small donuts in a tight
  // grid keep just the legend.
  const callouts = size >= 140;
  let offset = 0;

  return (
    // Container query, not a viewport one: the same donut sits in a 300px
    // quarter-panel and in a 700px half-panel on the same screen. Below ~380px
    // the legend stacks under the ring so labels like "Information Technology"
    // have the full width instead of truncating to "Inform…".
    // Top-aligned in both layouts, not centred. Centring made the ring float
    // against a taller legend, so a row of donuts whose legends differ in
    // length showed its rings at different heights — the alignment complaint.
    <div className="@container/donut flex flex-col @[380px]/donut:flex-row @[380px]/donut:items-start gap-4 @[380px]/donut:gap-5 min-w-0 w-full">
      <div className={clsx('shrink-0 self-center', callouts && 'p-6')}>
      {/* Padding holds the floating % pills, which sit outside the ring. */}
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        // The ring floats: a soft drop under it, the way the reference lifts
        // its donut off the card.
        style={{ filter: 'drop-shadow(0 8px 10px rgba(0, 0, 0, 0.14))' }}
      >
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="color-mix(in srgb, var(--ink) 7%, transparent)" strokeWidth={stroke} />
          {/* A raised centre disc the total sits on. */}
          <circle r={Math.max(0, r - stroke / 2 - 7)} fill="var(--card-2)" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.14))' }} />
          {total > 0 &&
            arcs.map((s, i) => {
              const len = (Math.max(0, s.value) / total) * c;
              const el = (
                <circle
                  key={`${s.label}-${i}`}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  // The 3px shortfall is the surface showing through between
                  // neighbouring fills — a real gap, not a drawn line.
                  strokeDasharray={`${Math.max(0, len - 3)} ${c}`}
                  strokeDashoffset={-offset}
                  // Hovering an arc must answer "what is this slice worth".
                  // Reading it off the legend means matching a colour by eye,
                  // which is exactly what a donut is bad at.
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    cursor: 'default',
                    opacity: hover == null || hover === i ? 1 : 0.35,
                    transition: 'opacity 120ms ease',
                  }}
                >
                  {/* Native tooltip too: it survives touch-less hover, print
                      and screen readers, and costs nothing. */}
                  <title>
                    {`${s.label}: ${formatValue ? formatValue(s.value) : s.value} (${pct(s.value)})`}
                  </title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </g>
        {/* Floating % pills on leader lines, for the slices big enough to
            name — the legend still carries every one. */}
        {callouts && total > 0 && (() => {
          let acc = 0;
          const out: React.ReactNode[] = [];
          arcs.forEach((sg, i) => {
            const v = Math.max(0, sg.value);
            const share = v / total;
            const mid = (acc + v / 2) / total;
            acc += v;
            if (share < 0.06 || out.length >= 5) return;
            const a = mid * Math.PI * 2 - Math.PI / 2;
            const cx = size / 2, cy = size / 2;
            const r1 = r + stroke / 2 + 2, r2 = r + stroke / 2 + 13;
            const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
            const x2 = cx + Math.cos(a) * r2, y2 = cy + Math.sin(a) * r2;
            const right = Math.cos(a) >= 0;
            const px = x2 + (right ? 6 : -6);
            const label = `${Math.round(share * 100)}%`;
            const w = label.length * 6.2 + 12;
            out.push(
              <g key={`co-${i}`} pointerEvents="none">
                <polyline points={`${x1},${y1} ${x2},${y2} ${px},${y2}`} fill="none" stroke="var(--line-strong)" strokeWidth={0.8} />
                <rect
                  x={right ? px : px - w} y={y2 - 9} width={w} height={18} rx={9}
                  fill="var(--card-2)"
                  style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}
                />
                <text
                  x={right ? px + w / 2 : px - w / 2} y={y2 + 0.5} textAnchor="middle" dominantBaseline="middle"
                  className="fill-ink" style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {label}
                </text>
              </g>,
            );
          });
          return out;
        })()}
        {/* While an arc is hovered the centre reports that slice instead of the
            total — the value appears where the reader is already looking,
            rather than in a tooltip that covers the neighbouring arcs. */}
        {(hovered ? true : centerText) && (
          <text
            x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
            className="fill-ink"
            style={{ fontSize: size > 150 ? 19 : 16, fontWeight: 400, letterSpacing: '-0.02em' }}
          >
            {hovered
              ? (formatValue ? formatValue(hovered.value) : String(hovered.value))
              : centerText}
          </text>
        )}
        {(hovered ? true : centerSub) && (
          <text
            x="50%" y="60%" textAnchor="middle" dominantBaseline="middle"
            fill="var(--muted)" style={{ fontSize: 'calc(10.5px * var(--font-scale, 1))' }}
          >
            {hovered ? `${hovered.label} · ${pct(hovered.value)}` : centerSub}
          </text>
        )}
      </svg>
      </div>

      {legend && (
        <div className="flex-1 min-w-0 w-full grid gap-2 @[380px]/donut:gap-2.5 grid-cols-1 @[240px]/donut:grid-cols-2 @[380px]/donut:grid-cols-1">
          {head.map((s, i) => (
            <Row key={`${s.label}-${i}`} seg={s} pct={pct(s.value)} formatValue={formatValue} />
          ))}

          {shouldFold && (
            <div className="min-w-0 @[240px]/donut:col-span-2 @[380px]/donut:col-span-1">
              <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="focus-ring w-full flex items-center gap-2.5 fs-13.5 rounded-[var(--radius-btn)] py-0.5 hover:bg-fill transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: otherColor }} />
                <span className="flex-1 min-w-0 text-ink-soft truncate text-left">
                  {otherLabel} ({tail.length})
                </span>
                <span className="shrink-0 font-semibold text-ink tnum tabular-nums">{pct(tailTotal)}</span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                />
              </button>

              {open && (
                // Capped and scrollable: a 20-item tail would otherwise treble
                // the card's height and drag its grid row with it. Everything
                // is still reachable — nothing is truncated away.
                <div className="mt-2 ml-[18px] pl-3 border-l border-line grid gap-1.5 max-h-[264px] overflow-y-auto">
                  {tail.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="flex items-center gap-2.5 fs-12.5 min-w-0">
                      <span className="flex-1 min-w-0 text-muted truncate">{s.label}</span>
                      {formatValue && (
                        <span className="shrink-0 text-muted tnum">{formatValue(s.value)}</span>
                      )}
                      <span className="shrink-0 font-semibold text-ink-soft tnum tabular-nums w-10 text-right">
                        {pct(s.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  seg, pct, formatValue,
}: { seg: DonutSeg; pct: string; formatValue?: (n: number) => string }) {
  return (
    // In the two-column legend (240–380px) large text leaves no room for the
    // figure and the share side by side, so there the share may wrap to its
    // own line. Only there: elsewhere wrapping lowers the legend's min-content
    // width and cards sized by their content shrink with it.
    <div className="flex items-center gap-x-2.5 fs-13.5 min-w-0 @[240px]/donut:flex-wrap @[380px]/donut:flex-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
      <span className="flex-1 min-w-0 text-ink-soft truncate">{seg.label}</span>
      {formatValue && <span className="shrink-0 text-muted tnum hidden @[300px]/donut:inline">{formatValue(seg.value)}</span>}
      <span className="shrink-0 font-semibold text-ink tnum tabular-nums">{pct}</span>
    </div>
  );
}
