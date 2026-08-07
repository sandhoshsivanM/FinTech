'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** A single slice. `color` is supplied by the caller — see ASSET_GROUP_META. */
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
  otherColor = 'var(--muted)',
  formatValue,
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
}) {
  const [open, setOpen] = useState(false);

  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const shouldFold = maxSlices != null && segments.length > maxSlices;
  const head = shouldFold ? segments.slice(0, maxSlices) : segments;
  const tail = shouldFold ? segments.slice(maxSlices) : [];
  const tailTotal = tail.reduce((s, x) => s + Math.max(0, x.value), 0);

  const arcs: DonutSeg[] = shouldFold
    ? [...head, { label: `${otherLabel} (${tail.length})`, value: tailTotal, color: otherColor }]
    : head;

  const pct = (v: number) => (total <= 0 ? '0%' : `${Math.round((v / total) * 100)}%`);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    // Container query, not a viewport one: the same donut sits in a 300px
    // quarter-panel and in a 700px half-panel on the same screen. Below ~380px
    // the legend stacks under the ring so labels like "Information Technology"
    // have the full width instead of truncating to "Inform…".
    <div className="@container/donut flex flex-col @[380px]/donut:flex-row @[380px]/donut:items-center gap-4 @[380px]/donut:gap-5 min-w-0 w-full">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 self-center">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="var(--fill-strong)" strokeWidth={stroke} />
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
                />
              );
              offset += len;
              return el;
            })}
        </g>
        {centerText && (
          <text
            x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
            className="fill-ink"
            style={{ fontSize: size > 150 ? 19 : 16, fontWeight: 700, letterSpacing: '-0.02em' }}
          >
            {centerText}
          </text>
        )}
        {centerSub && (
          <text
            x="50%" y="60%" textAnchor="middle" dominantBaseline="middle"
            fill="var(--muted)" style={{ fontSize: 10.5, letterSpacing: '0.04em' }}
          >
            {centerSub}
          </text>
        )}
      </svg>

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
                className="focus-ring w-full flex items-center gap-2.5 text-[13.5px] rounded-md py-0.5 hover:bg-fill transition-colors"
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
                    <div key={`${s.label}-${i}`} className="flex items-center gap-2.5 text-[12.5px] min-w-0">
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
    <div className="flex items-center gap-2.5 text-[13.5px] min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
      <span className="flex-1 min-w-0 text-ink-soft truncate">{seg.label}</span>
      {formatValue && <span className="shrink-0 text-muted tnum hidden @[300px]/donut:inline">{formatValue(seg.value)}</span>}
      <span className="shrink-0 font-semibold text-ink tnum tabular-nums">{pct}</span>
    </div>
  );
}
