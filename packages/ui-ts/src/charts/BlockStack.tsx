'use client';
/**
 * Each period as a column of rounded blocks that stack to its total — a
 * month's income split into what was spent and what was kept. The blocks are
 * parts of one whole, which is the only case where stacking is honest: stacking
 * income, spending and savings together counts the savings twice.
 *
 * The selected column is solid with the Zentra stripe and carries a readout
 * card; the others are tinted. Columns are buttons, so the selection works by
 * keyboard and touch as well as hover.
 */
import { useState } from 'react';

export interface BlockPart { label: string; value: number; color: string }
export interface BlockColumn {
  label: string;
  parts: BlockPart[];
  /** The readout's first line, e.g. { label: 'Income', value: 142000 }. */
  total?: { label: string; value: number; color: string };
}

const GAP = 4;

/** Round, readable ticks: 0 and three steps up to just past `max`. */
export function niceTicks(max: number, steps = 3): number[] {
  if (max <= 0) return [0];
  const raw = max / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

export function BlockStack({ columns, format, formatTick, height = 220, ariaLabel }: {
  columns: BlockColumn[];
  format: (n: number) => string;
  formatTick?: (n: number) => string;
  height?: number;
  ariaLabel?: string;
}) {
  const last = columns.length - 1;
  const [sel, setSel] = useState(last);
  if (columns.length === 0) return null;

  const sums = columns.map((c) => c.parts.reduce((s, p) => s + Math.max(0, p.value), 0));
  const ticks = niceTicks(Math.max(...sums, 0));
  const top = ticks[ticks.length - 1] || 1;
  const sc = (v: number) => (Math.max(0, v) / top) * height;
  const s = Math.min(sel, last);
  const cx = ((s + 0.5) / columns.length) * 100;
  const topY = height - sc(sums[s]) - GAP;
  const tick = formatTick ?? format;

  return (
    <div>
      <div className="flex gap-2.5 mt-8">
        <div className="relative flex-1 min-w-0" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 h-px bg-[var(--grid-line)]" style={{ top: height - sc(t) }} />
          ))}
          <div className="relative flex items-end gap-2.5 h-full" role="group" aria-label={ariaLabel}>
            {columns.map((c, i) => {
              const on = i === s;
              return (
                <button
                  key={`${c.label}-${i}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${c.label}: ${[c.total, ...c.parts].filter(Boolean).map((p) => `${p!.label} ${format(p!.value)}`).join(', ')}`}
                  onMouseEnter={() => setSel(i)}
                  onFocus={() => setSel(i)}
                  onClick={() => setSel(i)}
                  className="focus-ring flex-1 min-w-0 flex flex-col-reverse gap-1 rounded-[10px]"
                >
                  {c.parts.map((p) => {
                    const h = sc(p.value);
                    if (h <= 0) return null;
                    return (
                      <span
                        key={p.label}
                        className="block w-full rounded-[10px] transition-[background] duration-150"
                        style={{
                          height: Math.max(h - GAP, 3),
                          background: on
                            ? `repeating-linear-gradient(-45deg, rgba(255,255,255,0.28) 0 2px, transparent 2px 7px), ${p.color}`
                            : `color-mix(in srgb, ${p.color} 18%, transparent)`,
                        }}
                      />
                    );
                  })}
                </button>
              );
            })}
          </div>
          <span aria-hidden className="absolute w-2.5 h-2.5 rounded-full bg-ink -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_2.5px_var(--card)] pointer-events-none"
            style={{ left: `${cx}%`, top: topY }} />
          <div aria-hidden className="absolute z-[2] card px-3 py-2 grid gap-0.5 min-w-[150px] text-[12px] pointer-events-none shadow-[var(--shadow-float)]"
            style={{ left: `clamp(80px, ${cx}%, calc(100% - 80px))`, top: topY, transform: 'translate(-50%, calc(-100% - 12px))' }}>
            {[columns[s].total, ...columns[s].parts].filter(Boolean).map((p) => (
              <div key={p!.label} className="flex items-center gap-2">
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: p!.color }} />
                {p!.label}
                <b className="ml-auto pl-3 font-semibold tnum">{format(p!.value)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="relative w-11 shrink-0" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-[11px] text-muted tnum whitespace-nowrap" style={{ top: height - sc(t) }}>
              {tick(t)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-2.5 mt-2 mr-[54px]">
        {columns.map((c, i) => (
          <span key={`${c.label}-${i}`} className={`flex-1 min-w-0 text-center text-[11.5px] truncate ${i === s ? 'text-ink font-semibold' : 'text-muted'}`}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
