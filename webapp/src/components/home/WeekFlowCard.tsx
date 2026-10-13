'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { useNow } from '@/lib/useNow';
import { ZERO } from '@/lib/money';
import { dailyFlow, describeChange, type DayFlow } from '@/domain/dailyFlow';
import { GlassCard } from '../ui';
import { CardTitle } from '../Hint';

/* Chart geometry, in px. The midline sits 58% down: money in rises above it,
   money out hangs below. */
const H = 130;
const MID = 0.58;
const BAR = 18;

const weekday = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short' });
const longDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

const sum = (days: DayFlow[], k: 'income' | 'expense') => days.reduce((s, d) => s.plus(d[k]), ZERO);

/** One extruded bar: striped at rest, a solid gradient when its day is picked. */
function Bar3D({ h, kind, on, grown, delay }: { h: number; kind: 'in' | 'out'; on: boolean; grown: boolean; delay: number }) {
  if (h <= 0) return null;
  const c = kind === 'in' ? 'var(--data-green)' : 'var(--data-rose)';
  const fill = on
    ? kind === 'in'
      ? 'linear-gradient(180deg, var(--data-green-2), var(--data-green))'
      : 'linear-gradient(180deg, var(--data-rose), var(--data-rose-2))'
    : `repeating-linear-gradient(-45deg, ${c} 0 2px, transparent 2px 5px), color-mix(in srgb, ${c} 18%, transparent)`;
  return (
    <span
      aria-hidden
      className="absolute left-1/2 transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
      style={{
        width: BAR,
        marginLeft: -BAR / 2 - 3,
        height: h,
        ...(kind === 'in' ? { bottom: `${(1 - MID) * 100}%`, transformOrigin: 'bottom' } : { top: `${MID * 100}%`, transformOrigin: 'top' }),
        transform: grown ? 'scaleY(1)' : 'scaleY(0)',
        transitionDelay: `${delay}ms`,
        color: c,
      }}
    >
      <span
        className="absolute inset-0"
        style={{
          background: fill,
          borderRadius: kind === 'in' ? '3px 3px 0 0' : '0 0 3px 3px',
          boxShadow: on ? `0 6px 12px -6px ${c}` : undefined,
        }}
      />
      {/* The side face: a skewed sliver in the bar's own colour — the 3D cue. */}
      <span
        className="absolute bg-current opacity-25"
        style={{ top: 4, bottom: 0, right: -6, width: 6, transform: 'skewY(45deg)', transformOrigin: 'left top' }}
      />
    </span>
  );
}

/**
 * Last 7 days: money in rises above a midline (green), money out hangs below
 * it (pink), on one shared scale. Bars at rest are striped; the picked day is
 * a solid gradient in a soft blue column. Tapping a day shows its exact
 * figures on the readout pill.
 *
 * Shared on purpose — a salary day dwarfs a week of coffees, and separate
 * scales would hide exactly that.
 */
export function WeekFlowCard() {
  const txns = useApp((s) => s.txns);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const now = useNow(60_000);

  // Fourteen days: this week, and last week to compare against.
  const fortnight = useMemo(() => (now ? dailyFlow(txns, now, 14) : []), [txns, now]);
  const days = fortnight.slice(7);
  const [picked, setPicked] = useState<number | null>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (days.length === 0) return null;

  // One shared scale (px per rupee), chosen so the tallest bar on either side
  // of the midline still fits.
  const maxIn = Math.max(0, ...days.map((d) => d.income.toNumber()));
  const maxOut = Math.max(0, ...days.map((d) => d.expense.toNumber()));
  const fit = Math.min(
    maxIn > 0 ? (H * MID - 8) / maxIn : Infinity,
    maxOut > 0 ? (H * (1 - MID) - 6) / maxOut : Infinity,
  );
  const unit = Number.isFinite(fit) ? fit : 0;
  const selIndex = picked ?? days.length - 1;
  const sel = days[selIndex];
  const isToday = selIndex === days.length - 1;
  const weekOut = sum(days, 'expense');
  const lastOut = sum(fortnight.slice(0, 7), 'expense');
  const change = describeChange(weekOut, lastOut);
  const peak = days.reduce((a, d) => (d.expense.gt(a.expense) ? d : a), days[0]);
  const money = (v: Parameters<typeof fmt.money>[0]) => (ghost ? '••••' : fmt.money(v));
  const net = sel.income.minus(sel.expense);

  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle info="dashboard.lastSevenDays" className="text-[16px] font-medium tracking-[-0.01em]">Last 7 days</CardTitle>
          <div className="mt-2 text-[28px] font-light tracking-[-0.03em] leading-none tnum">
            {money(weekOut)}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[12px] text-muted">
            <span>spent this week</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[var(--data-green)]" />In</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[var(--data-rose)]" />Out</span>
          </div>
        </div>
        <div className="grid justify-items-end gap-2">
          {!peak.expense.isZero() && (
            <span className="chip text-muted">
              Peak: <b className="font-semibold text-ink">{weekday(peak.day)}</b>
            </span>
          )}
          {change != null && (
            <span className="text-right text-[12px] leading-tight text-muted">
              vs last week
              <b className={clsx('block text-[15px] font-semibold tnum', change.up ? 'text-[var(--data-rose)]' : 'text-[var(--data-green-ink)]')}>
                {change.up ? '↑' : '↓'} {change.text}
              </b>
            </span>
          )}
        </div>
      </div>

      {/* Recessed tray holding the chart. */}
      <div className="tray mt-4 px-2 pt-3 pb-2">
        <div className="relative" style={{ height: H }}>
          <span aria-hidden className="absolute inset-x-0 border-t border-[color-mix(in_srgb,var(--ink)_12%,transparent)]" style={{ top: `${MID * 100}%` }} />
          <div role="group" aria-label="Income and spending per day" className="absolute inset-0 grid grid-cols-7 gap-1.5">
            {days.map((d, i) => {
              const on = i === selIndex;
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${longDay(d.day)}: in ${money(d.income)}, out ${money(d.expense)}`}
                  onClick={() => setPicked(i)}
                  className={clsx(
                    'focus-ring relative h-full rounded-[12px] transition-colors',
                    on && 'bg-[color-mix(in_srgb,var(--data-blue)_8%,transparent)]',
                  )}
                >
                  <Bar3D h={d.income.toNumber() * unit} kind="in" on={on} grown={grown} delay={i * 60} />
                  <Bar3D h={d.expense.toNumber() * unit} kind="out" on={on} grown={grown} delay={i * 60} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-7 gap-1.5 text-center text-[10.5px]" aria-hidden>
          {days.map((d, i) => (
            <span key={d.day} className={i === selIndex ? 'font-semibold text-ink' : 'text-muted'}>
              {i === days.length - 1 ? 'Today' : weekday(d.day)}
            </span>
          ))}
        </div>
      </div>

      {/* The picked day, as a glass readout. */}
      <div
        aria-live="polite"
        className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-[var(--card-2)] px-4 py-2 text-[12px] text-muted shadow-[0_3px_8px_-4px_rgba(0,0,0,0.2)]"
      >
        <b className="font-semibold text-ink">{isToday ? 'Today' : longDay(sel.day)}</b>
        <span aria-hidden>|</span>
        <span>In <b className="font-semibold text-[var(--data-green-ink)] tnum">{money(sel.income)}</b></span>
        <span aria-hidden>|</span>
        <span>Out <b className="font-semibold text-[var(--data-rose)] tnum">{money(sel.expense)}</b></span>
        <span aria-hidden>|</span>
        <span>Net <b className="font-semibold text-ink tnum">{ghost ? '••••' : `${net.isNegative() ? '−' : '+'}${fmt.money(net.abs())}`}</b></span>
      </div>
    </GlassCard>
  );
}
