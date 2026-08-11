'use client';
/**
 * Forecast — the intelligence layer (§9).
 *
 * Everything here is derived from records already in the vault, and every panel
 * shows the inputs behind its number. That is the point of the section: an
 * allowance or a projection that arrives without its workings is a magic
 * number, and a user cannot tell a magic number from a wrong one.
 *
 * Where an input is missing the panel says so instead of producing a figure.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Wallet, CalendarClock, Scale, ArrowRight, Sparkles, CircleHelp,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { useNow } from '@/lib/useNow';
import { liquidBalance } from '@/domain/accountLedger';
import { investmentTotals } from '@/domain/investmentTotals';
import { netWorth } from '@/domain/accountLedger';
import {
  budgetRollover, evaluateBudget, spentForCategory,
} from '@/domain/finance';
import { currentMonth } from '@/domain/period';
import {
  cashFlowForecast, monthlyReview, netWorthProjection, safeToSpend, whatIf,
} from '@/domain/forecast';
import {
  PageIntro, GlassCard, SectionHeader, EmptyState, Button, Chip,
} from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { LineChart } from '@/components/charts/LineChart';
import { NumberInput } from '@/components/NumberInput';
import { Stagger, StaggerItem } from '@/components/motion';
import { short } from '@/lib/format';
import { formatDate } from '@/lib/dateFormat';

export default function ForecastPage() {
  const txns = useApp((s) => s.txns);
  const recurring = useApp((s) => s.recurring);
  const budgets = useApp((s) => s.budgets);
  const categories = useApp((s) => s.categories);
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const holdings = useApp((s) => s.holdings);
  const liabilities = useApp((s) => s.liabilities);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const now = useNow(60_000);

  const mask = (s: string) => (ghost ? '••••••' : s);
  const money = (v: Parameters<typeof fmt.money>[0]) => mask(fmt.money(v));

  const cash = useMemo(() => liquidBalance(accounts, postings), [accounts, postings]);
  const totals = useMemo(() => investmentTotals(holdings), [holdings]);
  const worth = useMemo(() => netWorth(accounts, postings, holdings), [accounts, postings, holdings]);
  const month = useMemo(() => currentMonth(now || undefined), [now]);

  /** Budget headroom left this month, or null when no budget is set. */
  const budgetRemaining = useMemo(() => {
    if (budgets.length === 0) return null;
    return budgets.reduce((s, b) => {
      const spent = spentForCategory(txns, b.categoryId, month);
      return s.plus(evaluateBudget(b, spent, budgetRollover(b, txns, month)).remaining);
    }, ZERO);
  }, [budgets, txns, month]);

  const sts = useMemo(
    () => safeToSpend(txns, recurring, cash, budgetRemaining, now || Date.now()),
    [txns, recurring, cash, budgetRemaining, now],
  );
  const forecast = useMemo(
    () => cashFlowForecast(txns, recurring, cash, now || Date.now()),
    [txns, recurring, cash, now],
  );
  const review = useMemo(() => monthlyReview(txns, now || Date.now()), [txns, now]);
  const projection = useMemo(
    () => netWorthProjection(txns, worth, totals.marketValue, now || Date.now()),
    [txns, worth, totals.marketValue, now],
  );

  const [extra, setExtra] = useState('');
  const scenario = useMemo(() => whatIf(
    liabilities, txns, worth, totals.marketValue,
    extra ? D(extra) : ZERO, now || Date.now(),
  ), [liabilities, txns, worth, totals.marketValue, extra, now]);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Uncategorised';

  if (!now) {
    return <PageIntro title="Forecast" subtitle="Reading your records…" />;
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Forecast"
          subtitle="Projections from your own records. Nothing here is a prediction."
        />
      </StaggerItem>

      {/* ---- Safe to spend ------------------------------------------------ */}
      <StaggerItem>
        <GlassCard>
          <SectionHeader
            title="Safe to spend"
            action={<span className="text-xs text-muted">{month.label}</span>}
          />
          {sts.perDay == null ? (
            <div className="mt-3 flex items-start gap-3">
              <span className="w-8 h-8 shrink-0 rounded-[var(--radius-card)] grid place-items-center bg-warning-soft text-warning">
                <CircleHelp size={16} />
              </span>
              <div>
                <p className="text-[15px] font-semibold">Not enough data</p>
                <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
                  {sts.gap === 'no-income'
                    ? 'No income has been recorded in the last three months, so there is no basis for a spending allowance. Khazana will not invent one — record your income and this fills in.'
                    : 'There is not enough recorded history to work out an allowance yet.'}
                </p>
                <Link href="/add" className="inline-block mt-3">
                  <Button variant="soft"><ArrowRight size={15} /> Record income</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-end gap-3 flex-wrap">
                <div>
                  <div className="text-[34px] font-bold tracking-[-0.04em] leading-none tnum">
                    {money(sts.perDay)}
                  </div>
                  <div className="text-xs text-muted mt-1.5">per day for {sts.inputs.daysRemaining} more days</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[18px] font-semibold tnum">{money(sts.total!)}</div>
                  <div className="text-xs text-muted mt-0.5">left in total</div>
                </div>
              </div>

              {/* The workings. §9: Safe-to-Spend must never be a magic number. */}
              <div className="mt-5 pt-4 border-t border-[var(--line)] grid gap-2 text-[13px]">
                <Working label="Available cash" value={money(sts.inputs.availableCash)} />
                <Working
                  label="Less committed recurring payments"
                  value={`− ${money(sts.inputs.committed)}`}
                />
                <Working
                  label="Budget headroom this month"
                  value={sts.inputs.budgetRemaining == null ? 'No budget set' : money(sts.inputs.budgetRemaining)}
                />
                <Working label="Days remaining" value={String(sts.inputs.daysRemaining)} />
              </div>
              <p className="mt-3 text-[11px] text-muted leading-relaxed">
                The lower of your remaining cash and your remaining budget, after everything already
                scheduled. It never offers money that is committed or that is not there.
              </p>
            </>
          )}
        </GlassCard>
      </StaggerItem>

      {/* ---- Cash-flow forecast ------------------------------------------- */}
      <StaggerItem>
        <GlassCard padded={false}>
          <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-3 flex-wrap">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Cash-flow forecast</h2>
              <p className="text-xs text-muted mt-0.5">
                {forecast.monthlyDiscretionary == null
                  ? 'Recurring rules only — not enough history for typical spending'
                  : `Recurring rules plus ${money(forecast.monthlyDiscretionary)} typical monthly spending, from ${forecast.basedOnMonths} completed months`}
              </p>
            </div>
            {forecast.months.some((m) => m.shortfall) && (
              <Chip tone="danger" className="ml-auto">Shortfall projected</Chip>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="text-left font-semibold px-5 py-2">Month</th>
                  <th className="text-right font-semibold px-3 py-2">Scheduled in</th>
                  <th className="text-right font-semibold px-3 py-2">Scheduled out</th>
                  <th className="text-right font-semibold px-3 py-2">Typical spend</th>
                  <th className="text-right font-semibold px-5 py-2">Projected cash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {forecast.months.map((m) => (
                  <tr key={m.label}>
                    <td className="px-5 py-2.5 font-medium whitespace-nowrap">{m.label}</td>
                    <td className="px-3 py-2.5 text-right tnum" style={{ color: 'var(--income)' }}>
                      {m.scheduledIncome.isZero() ? '—' : money(m.scheduledIncome)}
                    </td>
                    <td className="px-3 py-2.5 text-right tnum" style={{ color: 'var(--expense)' }}>
                      {m.scheduledExpense.isZero() ? '—' : money(m.scheduledExpense)}
                    </td>
                    <td className="px-3 py-2.5 text-right tnum text-muted">
                      {m.typicalDiscretionary.isZero() ? '—' : money(m.typicalDiscretionary)}
                    </td>
                    <td className="px-5 py-2.5 text-right tnum font-semibold"
                      style={{ color: m.shortfall ? 'var(--expense)' : undefined }}>
                      {money(m.closingCash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[11px] text-muted border-t border-[var(--line)] leading-relaxed">
            Built from your recurring rules and the median of your completed months — a median, so one
            unusual month cannot skew it. It assumes those rules keep running and your habits hold.
          </p>
        </GlassCard>
      </StaggerItem>

      {/* ---- Monthly review ----------------------------------------------- */}
      <StaggerItem>
        <GlassCard>
          <SectionHeader
            title="This month so far"
            action={
              <span className="text-xs text-muted">
                vs the same days of {formatDate(review.previous.start)}–{formatDate(review.previous.end)}
              </span>
            }
          />
          <KpiRow cols={4}>
            {review.changes.map((c) => {
              const better = c.higherIsBetter ? c.delta.gte(0) : c.delta.lte(0);
              return (
                <Kpi
                  key={c.key}
                  label={c.label}
                  icon={c.key === 'income' ? Wallet : c.key === 'invested' ? TrendingUp : Scale}
                  tone={c.delta.isZero() ? 'accent' : better ? 'success' : 'danger'}
                  value={ghost ? '••••' : undefined}
                  numeric={ghost ? undefined : fmt.toNum(c.current)}
                  format={(n) => short(n, fmt.symbol)}
                  footer={c.changePct == null
                    ? 'No comparison last month'
                    : `${c.changePct >= 0 ? '+' : ''}${c.changePct.toFixed(0)}% vs last month`}
                />
              );
            })}
          </KpiRow>

          {review.categoryMoves.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[var(--line)]">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2.5">
                What changed most
              </p>
              <div className="grid gap-1.5">
                {review.categoryMoves.slice(0, 5).map((m) => (
                  <div key={m.categoryId} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate">{catName(m.categoryId)}</span>
                    <span className="tnum shrink-0"
                      style={{ color: m.delta.gt(0) ? 'var(--expense)' : 'var(--income)' }}>
                      {m.delta.gt(0) ? '+' : '−'}{money(m.delta.abs())}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </StaggerItem>

      {/* ---- Net-worth projection ------------------------------------------ */}
      <StaggerItem>
        <GlassCard>
          <SectionHeader
            title="Net worth, projected"
            action={<span className="text-xs text-muted">5 years</span>}
          />
          {projection.basedOnMonths < 2 ? (
            <EmptyState
              icon={<CalendarClock size={22} />}
              title="Not enough history to project"
              hint="Once two complete months have been recorded, Khazana can project from your own surplus rather than an assumption."
            />
          ) : (
            <>
              <div className="mt-3">
                <LineChart
                  values={projection.points.map((p) => fmt.toNum(p.value))}
                  height={200}
                  format={(n) => short(n, fmt.symbol)}
                  ariaLabel="Projected net worth over five years"
                />
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">In five years</span>
                <span className="text-[22px] font-bold tnum">
                  {money(projection.points[projection.points.length - 1].value)}
                </span>
              </div>
              {/* The assumptions, stated. A projection without them is a guess
                  wearing a chart. */}
              <p className="mt-3 text-[11px] text-muted leading-relaxed">
                Assumes you keep saving {money(projection.monthlySurplus)} a month — the median of your
                last {projection.basedOnMonths} recorded months — and that invested assets grow{' '}
                {projection.growthPct}% a year. Cash is not assumed to grow. This is a projection under
                those assumptions, not a prediction of what will happen.
              </p>
            </>
          )}
        </GlassCard>
      </StaggerItem>

      {/* ---- What-if -------------------------------------------------------- */}
      <StaggerItem>
        <GlassCard>
          <SectionHeader
            title="What if I paid more toward debt?"
            action={<Sparkles size={16} className="text-muted" />}
          />
          {liabilities.length === 0 ? (
            <EmptyState
              icon={<Scale size={22} />}
              title="No liabilities recorded"
              hint="Add a loan or a credit card and this will show what paying extra each month would do to the payoff date and the interest."
            />
          ) : (
            <>
              <div className="mt-3 max-w-xs">
                <label className="text-xs font-semibold text-muted block mb-1">
                  Extra per month
                </label>
                <NumberInput value={extra} onChange={setExtra} placeholder="5000" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Outcome
                  label="Debt free in"
                  value={scenario.debtFreeMonths == null
                    ? 'Over 5 years'
                    : `${scenario.debtFreeMonths} month${scenario.debtFreeMonths === 1 ? '' : 's'}`}
                />
                <Outcome label="Total interest" value={money(scenario.totalInterest)} />
                <Outcome label="Net worth in 5 years" value={money(scenario.netWorthAtHorizon)} />
              </div>
              <p className="mt-4 text-[11px] text-muted leading-relaxed">
                Extra payments go to the highest-rate debt first, which is what minimises total
                interest. Minimum payments are derived from each liability&rsquo;s principal, rate and
                term — the same figures the Liabilities screen shows.
              </p>
            </>
          )}
        </GlassCard>
      </StaggerItem>
    </Stagger>
  );
}

function Working({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="tnum font-medium">{value}</span>
    </div>
  );
}

function Outcome({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-[17px] font-bold tnum mt-1">{value}</div>
    </div>
  );
}
