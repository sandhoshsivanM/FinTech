'use client';
/**
 * The skyline charts as ready-to-place panels: figures on top, chart below.
 *
 * - `SpendSkylinePanel`: spending per day over a range (Dashboard: the last
 *   26 weeks; Reports: the report period).
 * - `PortfolioSkylinePanel`: change in portfolio value per day, from the
 *   daily snapshots (Analytics).
 *
 * Each computes its own figures in memos keyed on the data and the day, so a
 * change elsewhere on the page never recomputes them, and hands the chart a
 * stable `describe` so the memoised chart skips re-rendering.
 */
import { useCallback, useMemo } from 'react';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { Skyline } from '@khazana/ui/charts/Skyline';
import { custom, startOfDay, type DateRange } from '@khazana/domain/period';
import { changeStats, lastWeeks, portfolioSkyline, spendSkyline, spendStats } from '@khazana/domain/skyline';

/**
 * The range by value: pages rebuild their range object every minute, and
 * comparing by identity would recompute the whole grid each time. A range
 * longer than `maxWeeks` keeps its most recent weeks, so a five-year custom
 * period never draws two thousand bars.
 */
function useStableRange(range: DateRange, maxWeeks?: number): { range: DateRange; clipped: boolean } {
  const { start, end, label } = range;
  return useMemo(() => {
    const r = { ...range };
    if (maxWeeks && end - start > maxWeeks * 7 * 86_400_000) {
      const last = lastWeeks(end, maxWeeks);
      return { range: custom(Math.max(start, last.start), end), clipped: true };
    }
    return { range: r, clipped: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compared by value on purpose
  }, [start, end, label, maxWeeks]);
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (ms: number) => { const d = new Date(ms); return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`; };
const shortDay = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MO[d.getMonth()]}`; };

function Figures({ items }: { items: { label: string; value: string; sub?: string; tone?: 'rose' | 'green' }[] }) {
  return (
    <dl className="grid gap-2.5 grid-cols-2 @[620px]:grid-cols-4 m-0">
      {items.map((it) => (
        <div key={it.label} className="rounded-[14px] bg-tray px-3 py-2.5 min-w-0">
          <dt className="fs-12 text-muted truncate">{it.label}</dt>
          <dd className={`m-0 mt-0.5 fs-20 font-semibold tracking-[-0.02em] tnum truncate ${it.tone === 'rose' ? 'text-[var(--data-rose)]' : it.tone === 'green' ? 'text-[var(--data-green-ink)]' : ''}`}>
            {it.value}{it.sub && <span className="ml-1 fs-12 font-medium text-muted">{it.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SpendSkylinePanel({ range: given, now, narrowWeeks, maxWeeks }: {
  range: DateRange;
  now: number;
  /** On a narrow card, show only this many most recent weeks. */
  narrowWeeks?: number;
  /** Longest period drawn; a longer range shows its most recent weeks. */
  maxWeeks?: number;
}) {
  const { range, clipped } = useStableRange(given, maxWeeks);
  const txns = useApp((s) => s.txns);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const today = startOfDay(now);
  const sky = useMemo(() => spendSkyline(txns, range, today), [txns, range, today]);
  const stats = useMemo(() => spendStats(sky), [sky]);
  const cells = useMemo(() => sky.cells.map((c) => ({ day: c.day, week: c.week, weekday: c.weekday, value: c.value })), [sky]);
  const money = useCallback((v: Parameters<typeof fmt.money>[0]) => (ghost ? '••••' : fmt.money(v)), [ghost, fmt]);
  const describe = useCallback((i: number) => {
    const c = sky.cells[i];
    if (c.amount == null) return dayLabel(c.day);
    if (c.amount.isZero()) return `${dayLabel(c.day)} · Nothing spent`;
    return `${dayLabel(c.day)} · ${money(c.amount)} · ${c.count} ${c.count === 1 ? 'entry' : 'entries'}`;
  }, [sky, money]);

  return (
    <div className="grid gap-4 min-w-0">
      <Figures items={[
        { label: 'Spent', value: money(stats.total), tone: 'rose' },
        { label: 'Busiest day', value: stats.busiest ? money(stats.busiest.amount!) : '—', sub: stats.busiest ? shortDay(stats.busiest.day) : undefined },
        { label: 'Longest no-spend run', value: String(stats.longestQuiet), sub: stats.longestQuiet === 1 ? 'day' : 'days' },
        { label: 'No-spend days', value: String(stats.quietDays), sub: `of ${stats.pastDays}` },
      ]} />
      {clipped && <p className="m-0 fs-12 text-muted">Showing the most recent {maxWeeks} weeks of this period · {range.label}</p>}
      <Skyline
        cells={cells}
        describe={describe}
        narrowWeeks={narrowWeeks}
        label={`Spending per day, ${range.label}. ${ghost ? '' : `Total ${money(stats.total)}.`} ${stats.quietDays} days with nothing spent.`}
      />
    </div>
  );
}

export function PortfolioSkylinePanel({ range: given, now, narrowWeeks }: {
  range: DateRange;
  now: number;
  narrowWeeks?: number;
}) {
  const { range } = useStableRange(given);
  const snapshots = useApp((s) => s.snapshots);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const today = startOfDay(now);
  const sky = useMemo(() => portfolioSkyline(snapshots, range, today), [snapshots, range, today]);
  const stats = useMemo(() => changeStats(sky), [sky]);
  const cells = useMemo(() => sky.cells.map((c) => ({ day: c.day, week: c.week, weekday: c.weekday, value: c.value })), [sky]);
  const signed = useCallback((v: NonNullable<(typeof sky.cells)[number]['amount']>) => (ghost ? '••••' : fmt.signed(v, v.gte(0))), [ghost, fmt]);
  const describe = useCallback((i: number) => {
    const c = sky.cells[i];
    if (c.amount == null) return `${dayLabel(c.day)} · No reading`;
    const gap = c.since != null && c.since < c.day - 86_400_000 * 1.5 ? ` since ${shortDay(c.since)}` : '';
    return `${dayLabel(c.day)} · ${signed(c.amount)}${gap}`;
  }, [sky, signed]);
  const readings = sky.cells.filter((c) => c.amount != null).length;

  if (readings === 0) {
    return (
      <p className="py-8 text-center fs-13 text-muted">
        Daily changes appear once Khazana has recorded your portfolio on two different days.
      </p>
    );
  }
  return (
    <div className="grid gap-4 min-w-0">
      <Figures items={[
        { label: 'Net change', value: signed(stats.net), tone: stats.net.gte(0) ? 'green' : 'rose' },
        { label: 'Best day', value: stats.best ? signed(stats.best.amount!) : '—', sub: stats.best ? shortDay(stats.best.day) : undefined },
        { label: 'Worst day', value: stats.worst ? signed(stats.worst.amount!) : '—', sub: stats.worst ? shortDay(stats.worst.day) : undefined },
        { label: 'Up / down days', value: `${stats.upDays} / ${stats.downDays}` },
      ]} />
      <Skyline
        cells={cells}
        describe={describe}
        mode="change"
        narrowWeeks={narrowWeeks}
        label={`Change in portfolio value per day, ${range.label}. ${stats.upDays} days up, ${stats.downDays} down.`}
      />
      <p className="m-0 fs-12 text-muted">From the daily snapshot. Includes money you added, not only market moves. Days the app was not opened have no reading.</p>
    </div>
  );
}
