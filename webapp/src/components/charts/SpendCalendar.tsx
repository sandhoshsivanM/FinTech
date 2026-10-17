'use client';
/**
 * A month as a calendar, each day shaded by what was spent on it. Shows rhythm
 * — the rent day, the weekend spikes, the quiet stretch — that a total or a
 * line hides. Days still to come are outlined and empty; today is ringed.
 *
 * Shading is on a square-root scale of the month's busiest day, so one rent
 * payment does not wash every other day out to the palest step. The legend
 * says "Less / More" rather than printing thresholds that change every month.
 */
import clsx from 'clsx';
import { useState } from 'react';

export interface CalendarDay { date: number; value: number | null; note?: string }

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEPS = [16, 30, 48, 72, 100];

export function SpendCalendar({ days, firstWeekday, today, format, monthLabel, color = 'var(--data-rose)' }: {
  days: CalendarDay[];
  /** 0 = Sunday, for the 1st of the month. */
  firstWeekday: number;
  /** Day of the month to ring, or null when the month is not the current one. */
  today: number | null;
  format: (n: number) => string;
  /** e.g. "Oct" — used in the readout. */
  monthLabel: string;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.value ?? 0), 0);
  const step = (v: number) => (max <= 0 || v <= 0 ? 0 : Math.min(STEPS.length - 1, Math.floor(Math.sqrt(v / max) * STEPS.length)));
  const h = hover != null ? days[hover] : null;

  return (
    <div>
      <div
        role="img"
        aria-label={`Spending per day in ${monthLabel}: ` + days.filter((d) => d.value != null).map((d) => `${d.date} ${format(d.value!)}`).join(', ')}
        className="grid grid-cols-7 gap-1.5"
        onMouseLeave={() => setHover(null)}
      >
        {WEEKDAYS.map((w, i) => <span key={i} aria-hidden className="text-center text-[11px] text-muted">{w}</span>)}
        {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} aria-hidden />)}
        {days.map((d, i) => {
          const future = d.value == null;
          const s = future ? -1 : step(d.value!);
          return (
            <span
              key={d.date}
              aria-hidden
              onMouseEnter={() => setHover(i)}
              className={clsx(
                'h-10 rounded-[10px] px-[7px] py-1 text-[11px] tnum cursor-default',
                future && 'border border-dashed border-line-strong text-muted',
                d.date === today && 'shadow-[0_0_0_2px_var(--ink)]',
                s >= 3 && 'text-white',
              )}
              style={future ? undefined : {
                background: d.value ? `color-mix(in srgb, ${color} ${STEPS[s]}%, transparent)` : 'var(--tray)',
              }}
            >
              {d.date}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px] text-muted">
        Less
        {STEPS.map((p) => <span key={p} aria-hidden className="w-3.5 h-3.5 rounded-[4px]" style={{ background: `color-mix(in srgb, ${color} ${p}%, transparent)` }} />)}
        More
        <span className="ml-auto text-[12px] text-ink-soft tnum truncate">
          {h ? (h.value == null ? `${h.date} ${monthLabel} · still to come` : `${h.date} ${monthLabel} · ${format(h.value)}${h.note ? ` (${h.note})` : ''}`) : ''}
        </span>
      </div>
    </div>
  );
}
