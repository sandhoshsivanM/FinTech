'use client';
/**
 * The chart board: one card per question, and no two cards drawing their
 * answer the same way. Where income came from is a split bar; how full the
 * goals are is a dot matrix; the week is a line; months are mirrored bars and
 * stacked blocks; the month is a calendar. The only ring is the category donut.
 *
 * Every figure is computed from the vault for the dashboard's selected month
 * (domain/dashboardCharts). Amounts go to the charts in INR and are converted
 * and masked by `fmt` on the way out, so ghost mode and display currency apply
 * everywhere at once.
 */
import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import type Decimal from 'decimal.js';
import { ChevronRight, PiggyBank, Home, Car, Plane, GraduationCap, Target } from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { short } from '@/lib/format';
import type { GoalType } from '@/lib/types';
import { windowSummary, evaluateBudget, spentForCategory, budgetRollover } from '@/domain/finance';
import { dailyFlow, describeChange } from '@/domain/dailyFlow';
import { shiftMonths, type DateRange } from '@/domain/period';
import {
  incomeBySource, monthlyFlow, dailySpend, monthElapsed, paceStatus, goalProgress, monthEndSeries, SHORT_MONTHS,
} from '@/domain/dashboardCharts';
import { CardTitle } from '../Hint';
import { Donut, type DonutSeg } from '../charts/Donut';
import { SplitBar } from '../charts/SplitBar';
import { DotMatrix } from '../charts/DotMatrix';
import { SplineDots } from '../charts/SplineDots';
import { MirrorBars } from '../charts/MirrorBars';
import { BlockStack } from '../charts/BlockStack';
import { TrendTile } from '../charts/TrendTile';
import { DotProgress } from '../charts/DotProgress';
import { PaceBars } from '../charts/PaceBars';
import { SpendCalendar } from '../charts/SpendCalendar';

const SOURCE_COLOURS = ['var(--data-blue)', 'var(--ink)', 'var(--data-green)', 'var(--data-amber)', 'var(--series-4)'];
const GOAL_COLOURS = ['var(--data-blue)', 'var(--data-rose)', 'var(--data-green)', 'var(--data-amber)'];
const GOAL_ICON: Record<GoalType, ReactNode> = {
  emergency_fund: <PiggyBank size={18} />, house: <Home size={18} />, vehicle: <Car size={18} />,
  vacation: <Plane size={18} />, education: <GraduationCap size={18} />, custom: <Target size={18} />,
};
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The dashboard's card shell: title row over a hairline, body below. */
function BoardCard({ title, sub, href, className, children }: {
  title: string; sub?: string; href?: string; className?: string; children: ReactNode;
}) {
  return (
    <section className={`card flex flex-col min-w-0 ${className ?? ''}`}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
        <div className="min-w-0">
          <CardTitle as="h3" className="text-[16px] font-medium tracking-[-0.01em]">{title}</CardTitle>
          {sub && <p className="text-xs text-muted mt-0.5 truncate">{sub}</p>}
        </div>
        {href && (
          <Link href={href} aria-label={`Open ${title}`}
            className="ml-auto focus-ring grid place-items-center w-8 h-8 rounded-full text-muted hover:bg-fill hover:text-ink transition-colors">
            <ChevronRight size={16} />
          </Link>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col">{children}</div>
    </section>
  );
}

function Headline({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 flex-wrap mb-4">
      <span className="text-[30px] font-light tracking-[-0.035em] leading-[1.05] tnum">{value}</span>
      {children}
    </div>
  );
}

/**
 * A change, coloured by whether it is good news — spending less is green.
 * Worded by `describeChange`, so a jump reads "52×" rather than "5145%".
 */
function Change({ now, before, goodWhenUp, label }: { now: Decimal; before: Decimal; goodWhenUp: boolean; label: string }) {
  const c = trend(now, before, goodWhenUp);
  if (!c) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[12.5px] font-semibold tnum ${c.good ? 'text-success' : 'text-danger'}`}>
      <span aria-hidden className={`w-[18px] h-[18px] rounded-[6px] grid place-items-center text-[11px] ${c.good ? 'bg-success-soft' : 'bg-danger-soft'}`}>
        {c.up ? '↑' : '↓'}
      </span>
      {c.text}
      <span className="font-normal text-muted">{label}</span>
    </span>
  );
}

function trend(now: Decimal, before: Decimal, goodWhenUp: boolean) {
  if (now.eq(before)) return null;
  const c = describeChange(now, before);
  if (!c) return null;
  return { ...c, good: c.up === goodWhenUp };
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="flex-1 grid place-items-center py-8 text-center text-[13px] text-muted">{children}</p>
);

export function ChartBoard({ month, now, netWorth, investments, liabilities }: {
  month: DateRange;
  now: number;
  /** Today's headline figures from the dashboard, so the tiles end on the same numbers. */
  netWorth: Decimal;
  investments: Decimal;
  liabilities: Decimal;
}) {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const goals = useApp((s) => s.goals);
  const budgets = useApp((s) => s.budgets);
  const snapshots = useApp((s) => s.snapshots);
  const holdings = useApp((s) => s.holdings);
  const liabilityRows = useApp((s) => s.liabilities);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();

  const money = (n: Decimal.Value) => (ghost ? '••••' : fmt.money(n));
  const compact = (n: number) => (ghost ? '••••' : short(fmt.toNum(n), fmt.symbol));
  const mLabel = SHORT_MONTHS[new Date(month.start).getMonth()];
  const prevLabel = SHORT_MONTHS[new Date(shiftMonths(month.start, -1).start).getMonth()];
  const isCurrent = now >= month.start && now <= month.end;

  const data = useMemo(() => {
    const prevMonth = shiftMonths(month.start, -1);
    const sources = incomeBySource(txns, categories, month);
    const incomeNow = windowSummary(txns, month).income;
    const incomeBefore = windowSummary(txns, prevMonth).income;

    const week = dailyFlow(txns, now, 14);
    const thisWeek = week.slice(7);
    const weekTotal = thisWeek.reduce((s, d) => s.plus(d.expense), ZERO);
    const lastWeekTotal = week.slice(0, 7).reduce((s, d) => s.plus(d.expense), ZERO);

    const flow12 = monthlyFlow(txns, month.start, 12);
    const flow6 = flow12.slice(6);

    const catSpend = new Map<string, Decimal>();
    for (const t of txns) {
      if (t.type !== 'expense' || t.date < month.start || t.date > month.end) continue;
      catSpend.set(t.categoryId, (catSpend.get(t.categoryId) ?? ZERO).plus(D(t.amount)));
    }

    const goalRows = goals.map((g) => goalProgress(g, now));
    const elapsed = monthElapsed(month, now);
    const budgetRows = budgets
      .map((b) => evaluateBudget(b, spentForCategory(txns, b.categoryId, month), budgetRollover(b, txns, month)))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 4);

    const days = dailySpend(txns, month, now);
    const spentSoFar = days.reduce((s, d) => s.plus(d.spent ?? ZERO), ZERO);
    const daysGone = days.filter((d) => d.spent != null).length;
    const busiest = days.reduce<(typeof days)[number] | null>((m, d) => (d.spent && (!m || d.spent.gt(m.spent!)) ? d : m), null);

    return {
      sources, incomeNow, incomeBefore, thisWeek, weekTotal, lastWeekTotal, flow12, flow6, catSpend,
      goalRows, elapsed, budgetRows, days, spentSoFar, daysGone, busiest,
      trend: {
        netWorth: monthEndSeries(snapshots, 'netWorth', now, 6, netWorth),
        investments: monthEndSeries(snapshots, 'investments', now, 6, investments),
        liabilities: monthEndSeries(snapshots, 'liabilities', now, 6, liabilities),
      },
    };
  }, [txns, categories, goals, budgets, snapshots, month, now, netWorth, investments, liabilities]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Other';
  const spendSegs: DonutSeg[] = [...data.catSpend]
    .sort((a, b) => b[1].comparedTo(a[1]))
    .map(([id, v]) => ({ label: catName(id), value: v.toNumber(), color: '' }));
  const spendTotal = [...data.catSpend.values()].reduce((s, v) => s.plus(v), ZERO);

  // Liabilities falling is the good direction.
  const tile = (vals: Decimal[], goodWhenUp = true) => ({
    nums: vals.map((v) => v.toNumber()),
    change: vals.length >= 2 ? trend(vals[vals.length - 1], vals[vals.length - 2], goodWhenUp) : null,
  });
  const nw = tile(data.trend.netWorth), inv = tile(data.trend.investments), li = tile(data.trend.liabilities, false);
  const todayLabel = `${new Date(now).getDate()} ${SHORT_MONTHS[new Date(now).getMonth()]}`;
  const pnlCount = `${holdings.length} position${holdings.length === 1 ? '' : 's'}`;

  return (
    <div className="grid gap-4 grid-cols-1 min-[768px]:grid-cols-2 min-[1200px]:grid-cols-12">
      {/* ---- Row 1: income, goals, the week ---- */}
      <BoardCard title="Income" sub={`By source · ${month.label}`} href="/transactions" className="min-[1200px]:col-span-4">
        {data.sources.length === 0 ? <Empty>No income recorded in {month.label}.</Empty> : (
          <>
            <Headline value={money(data.incomeNow)}>
              <Change now={data.incomeNow} before={data.incomeBefore} goodWhenUp label={`vs ${prevLabel}`} />
            </Headline>
            <SplitBar
              segments={data.sources.slice(0, 5).map((s, i) => ({ label: s.label, value: s.amount.toNumber(), color: SOURCE_COLOURS[i] }))}
              format={money}
            />
          </>
        )}
      </BoardCard>

      <BoardCard title="Saved toward goals" sub={`${goals.length} goal${goals.length === 1 ? '' : 's'}`} href="/goals" className="min-[1200px]:col-span-4">
        {data.goalRows.length === 0 ? <Empty>Add a goal to watch it fill up.</Empty> : (
          <>
            <Headline value={money(data.goalRows.reduce((s, g) => s.plus(g.saved), ZERO))}>
              <span className="text-[12.5px] text-muted tnum">of {money(data.goalRows.reduce((s, g) => s.plus(g.target), ZERO))}</span>
            </Headline>
            <DotMatrix groups={data.goalRows.slice(0, 4).map((g, i) => ({
              label: g.goal.name, fraction: g.fraction, color: GOAL_COLOURS[i % GOAL_COLOURS.length],
              detail: `${money(g.saved)} of ${money(g.target)}`,
            }))} />
          </>
        )}
      </BoardCard>

      <BoardCard title="Spent this week" sub="Last 7 days" href="/transactions" className="min-[768px]:col-span-2 min-[1200px]:col-span-4">
        <Headline value={money(data.weekTotal)}>
          <Change now={data.weekTotal} before={data.lastWeekTotal} goodWhenUp={false} label="vs last week" />
        </Headline>
        <SplineDots
          points={data.thisWeek.map((d, i) => {
            const dt = new Date(d.day);
            return { label: WEEKDAY[dt.getDay()], value: d.expense.toNumber(), title: i === 6 ? 'Today' : `${WEEKDAY[dt.getDay()]} ${dt.getDate()}` };
          })}
          format={money}
        />
      </BoardCard>

      {/* ---- Row 2: twelve months in and out, six months of income split ---- */}
      <BoardCard title="Money in and out" sub="12 months · out is spending plus investing" className="min-[1200px]:col-span-4">
        <MirrorBars
          height={230}
          rows={data.flow12.map((m) => ({ label: m.label, up: m.income.toNumber(), down: m.expense.plus(m.invested).toNumber() }))}
          format={compact}
        />
        {(() => {
          const tin = data.flow12.reduce((s, m) => s.plus(m.income), ZERO);
          const tout = data.flow12.reduce((s, m) => s.plus(m.expense).plus(m.invested), ZERO);
          return (
            <dl className="mt-auto pt-4 grid grid-cols-3 gap-3 border-t border-line m-0">
              <div><dt className="text-[11.5px] text-muted">In, 12 months</dt><dd className="m-0 text-[15px] tnum text-success">{compact(tin.toNumber())}</dd></div>
              <div><dt className="text-[11.5px] text-muted">Out</dt><dd className="m-0 text-[15px] tnum">{compact(tout.toNumber())}</dd></div>
              <div><dt className="text-[11.5px] text-muted">Kept</dt><dd className={`m-0 text-[15px] tnum ${tin.gte(tout) ? 'text-success' : 'text-danger'}`}>{tin.gte(tout) ? '' : '−'}{compact(tin.minus(tout).abs().toNumber())}</dd></div>
            </dl>
          );
        })()}
      </BoardCard>

      <BoardCard title="Cash flow" sub="Each month's income, split into spent and saved" href="/reports" className="min-[1200px]:col-span-8">
        <Headline value={money(data.flow6.reduce((s, m) => s.plus(m.income.minus(m.expense)), ZERO))}>
          <span className="text-[12.5px] text-muted">saved over six months</span>
        </Headline>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full bg-data-rose" />Spent</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full bg-data-green" />Saved</span>
        </div>
        <BlockStack
          ariaLabel="Income split into spent and saved, last six months"
          columns={data.flow6.map((m) => ({
            label: m.label,
            total: { label: 'Income', value: m.income.toNumber(), color: 'var(--data-blue)' },
            parts: [
              { label: 'Spent', value: m.expense.toNumber(), color: 'var(--data-rose)' },
              { label: 'Saved', value: Math.max(0, m.income.minus(m.expense).toNumber()), color: 'var(--data-green)' },
            ],
          }))}
          format={money}
          formatTick={(n) => (n === 0 ? `${fmt.symbol}0` : compact(n))}
        />
      </BoardCard>

      {/* ---- Row 3: the three balances, each with its trend ---- */}
      <TrendTile
        className="min-[1200px]:col-span-4" title="Net worth" value={short(fmt.toNum(netWorth), fmt.symbol)}
        values={nw.nums} color="var(--data-blue)" tint="color-mix(in srgb, var(--data-blue) 9%, transparent)"
        change={nw.change} sub="What you own minus what you owe"
        marker={short(fmt.toNum(netWorth), fmt.symbol)} markerSub={todayLabel} ghost={ghost}
      />
      <TrendTile
        className="min-[1200px]:col-span-4" title="Investments" value={short(fmt.toNum(investments), fmt.symbol)}
        values={inv.nums} color="var(--data-green)" tint="var(--success-soft)"
        change={inv.change} sub={pnlCount}
        marker={short(fmt.toNum(investments), fmt.symbol)} markerSub={todayLabel} ghost={ghost}
      />
      <TrendTile
        className="min-[768px]:col-span-2 min-[1200px]:col-span-4" title="Liabilities" value={short(fmt.toNum(liabilities), fmt.symbol)}
        values={li.nums} color="var(--data-rose)" tint="var(--danger-soft)"
        change={li.change}
        sub={`${liabilityRows.length} account${liabilityRows.length === 1 ? '' : 's'}`}
        marker={short(fmt.toNum(liabilities), fmt.symbol)} markerSub={todayLabel} ghost={ghost}
      />

      {/* ---- Row 4: where it went, the goals, the budgets ---- */}
      <BoardCard title="Spending by category" sub={month.label} href="/reports" className="min-[1200px]:col-span-4">
        {spendSegs.length === 0 ? <Empty>No spending recorded in {month.label}.</Empty> : (
          <Donut
            segments={spendSegs}
            size={168}
            stroke={22}
            maxSlices={6}
            formatValue={compact}
            centerText={compact(spendTotal.toNumber())}
            centerSub="Spent"
          />
        )}
      </BoardCard>

      <BoardCard title="Goals" sub="Progress and what each needs a month" href="/goals" className="min-[1200px]:col-span-4">
        {data.goalRows.length === 0 ? <Empty><Link href="/goals" className="font-semibold text-ink">Add your first goal</Link></Empty> : (
          <ul className="grid gap-3.5">
            {data.goalRows.slice(0, 4).map((g, i) => {
              const pct = Math.round(g.fraction * 100);
              const by = g.goal.targetDate ? new Date(g.goal.targetDate) : null;
              return (
                <li key={g.goal.id} className="grid grid-cols-[40px_1fr] gap-x-3 gap-y-0.5">
                  <span className="row-span-3 w-10 h-10 rounded-[12px] bg-card-2 shadow-[var(--shadow-1)] grid place-items-center text-ink-soft">
                    {GOAL_ICON[g.goal.goalType]}
                  </span>
                  <span className="flex justify-between gap-2 text-[14px] font-medium">
                    <span className="truncate">{g.goal.name}</span><span className="tnum">{pct}%</span>
                  </span>
                  <DotProgress fraction={g.fraction} color={GOAL_COLOURS[i % GOAL_COLOURS.length]} label={`${g.goal.name}: ${pct}% saved`} />
                  <span className="flex justify-between gap-2 flex-wrap text-[11.5px] text-muted tnum">
                    <span>
                      {by ? `By ${SHORT_MONTHS[by.getMonth()]} ${by.getFullYear()}` : 'No target date'}
                      {g.perMonth ? ` · ${money(g.perMonth)}/month` : g.fraction >= 1 ? ' · reached' : ''}
                    </span>
                    <span><span className="text-ink font-medium">{money(g.saved)}</span> / {money(g.target)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </BoardCard>

      <BoardCard title="Budgets" sub={`${month.label} · against the calendar`} href="/budget" className="min-[768px]:col-span-2 min-[1200px]:col-span-4">
        {data.budgetRows.length === 0 ? <Empty><Link href="/budget" className="font-semibold text-ink">Set a monthly budget</Link></Empty> : (
          <PaceBars
            elapsed={data.elapsed}
            elapsedLabel={isCurrent
              ? `Where spending should be on ${todayLabel} (${Math.round(data.elapsed * 100)}% of the month)`
              : 'The whole month has passed'}
            rows={data.budgetRows.map((r) => ({
              label: catName(r.budget.categoryId),
              ratio: r.ratio,
              status: paceStatus(r, data.elapsed),
              amounts: `${money(r.spent)} of ${money(r.limit)}`,
              over: r.ratio > 1 ? money(r.spent.minus(r.limit)) : undefined,
            }))}
          />
        )}
      </BoardCard>

      {/* ---- Row 5: the month, day by day ---- */}
      <BoardCard title="Daily spending" sub={month.label} href="/calendar" className="min-[768px]:col-span-2 min-[1200px]:col-span-12">
        <div className="grid gap-6 min-[720px]:grid-cols-[minmax(0,1fr)_220px] items-start">
          <SpendCalendar
            days={data.days.map((d) => ({ date: d.date, value: d.spent ? d.spent.toNumber() : null }))}
            firstWeekday={new Date(month.start).getDay()}
            today={isCurrent ? new Date(now).getDate() : null}
            format={money}
            monthLabel={mLabel}
          />
          <dl className="grid gap-3.5 m-0">
            <div><dt className="text-[12px] text-muted">Spent so far</dt><dd className="m-0 text-[20px] tracking-[-0.02em] tnum">{money(data.spentSoFar)}</dd></div>
            <div><dt className="text-[12px] text-muted">Daily average</dt><dd className="m-0 text-[20px] tracking-[-0.02em] tnum">{data.daysGone ? money(data.spentSoFar.div(data.daysGone)) : '—'}</dd></div>
            <div><dt className="text-[12px] text-muted">Busiest day</dt><dd className="m-0 text-[20px] tracking-[-0.02em] tnum">{data.busiest ? `${data.busiest.date} ${mLabel} · ${money(data.busiest.spent!)}` : '—'}</dd></div>
            {isCurrent && (
              <div><dt className="text-[12px] text-muted">Days left</dt><dd className="m-0 text-[20px] tracking-[-0.02em] tnum">{data.days.length - data.daysGone}</dd></div>
            )}
          </dl>
        </div>
      </BoardCard>
    </div>
  );
}
