'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Eye, EyeOff, CreditCard, ArrowUpRight, ArrowDownRight, Sparkles,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO, moneyToWords } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { netWorthTotal, windowSummary, netWorthSeries, type TimeWindow } from '@/domain/finance';
import { healthScore } from '@/domain/health';
import { investmentTotals } from '@/domain/investmentTotals';
import { spendingAnomalies, safeToSpend } from '@/domain/insights';
import { GlassCard, SectionHeader, Sparkline, Ring, ProgressBar } from '@/components/ui';

const WINDOWS: TimeWindow[] = ['7D', '1M', '3M'];

export default function DashboardPage() {
  const { txns, holdings, liabilities, recurring, categories, ghost } = useApp();
  // Goals, insurances and budgets decide whether Protection, Efficiency and
  // Future are tracked at all, so the score needs them, not just the money.
  const goals = useApp((s) => s.goals);
  const insurances = useApp((s) => s.insurances);
  const budgets = useApp((s) => s.budgets);
  const snapshots = useApp((s) => s.snapshots);
  const toggleGhost = useApp((s) => s.toggleGhost);
  const [win, setWin] = useState<TimeWindow>('1M');

  const fmt = useFmt();
  const summary = useMemo(() => windowSummary(txns, win), [txns, win]);

  // True net worth = cash (from transactions) + investments − liabilities.
  const cash = useMemo(() => netWorthTotal(txns), [txns]);
  const invest = useMemo(() => holdings.reduce((s, h) => s.plus(D(h.quantity).times(D(h.lastPrice ?? h.avgCost))), ZERO), [holdings]);
  const liab = useMemo(() => liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO), [liabilities]);
  const netWorth = useMemo(() => cash.plus(invest).minus(liab), [cash, invest, liab]);
  // Trend: use real daily snapshots when available (>=2), otherwise fall back to
  // the derived series driven by the period toggle.
  const useRealSnapshots = snapshots.length >= 2;
  const series = useMemo(() => {
    if (useRealSnapshots) {
      return snapshots.map((s) => fmt.toNum(D(s.netWorth)));
    }
    const offset = invest.minus(liab);
    return netWorthSeries(txns, win).map((p) => fmt.toNum(p.value.plus(offset)));
  }, [snapshots, useRealSnapshots, txns, win, invest, liab, fmt]);

  const savingsRate = summary.income.isZero() ? 0 : summary.net.div(summary.income).times(100).toNumber();
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Other';
  const recent = [...txns].sort((a, b) => b.date - a.date).slice(0, 6);
  const bills = [...recurring].sort((a, b) => a.nextRun - b.nextRun).slice(0, 5);
  const mask = (s: string) => (ghost ? '••••••' : s);

  // Financial Health
  const health = useMemo(
    () => healthScore({
      txns,
      investments: investmentTotals(holdings),
      liabilities,
      goals,
      insurances,
      budgets,
      snapshots,
    }),
    [txns, holdings, liabilities, goals, insurances, budgets, snapshots],
  );
  // A null score means nothing is tracked yet — grey, not a failing colour.
  const ringColor =
    health.score === null ? 'var(--muted)'
      : health.score >= 70 ? 'var(--income)'
        : health.score >= 40 ? 'var(--warn)' : 'var(--expense)';

  // Insights — domain helpers + rule-based tips, capped at 5
  const insights = useMemo(() => {
    const tips: string[] = [];

    // 0a. Safe-to-spend (most actionable — leads the list)
    const sts = safeToSpend(txns, recurring);
    if (sts.remaining.gt(0)) {
      tips.push(
        `Safe to spend: ${ghost ? '••••' : fmt.money(sts.perDay)}/day for the next ${sts.daysLeft} day${sts.daysLeft !== 1 ? 's' : ''} (${ghost ? '••••' : fmt.money(sts.remaining)} left this month).`
      );
    }

    // 0b. Spending anomalies — top 2 categories spiking ≥1.5× their avg
    const anomalies = spendingAnomalies(txns).slice(0, 2);
    for (const a of anomalies) {
      const name = catName(a.categoryId);
      tips.push(
        `${name} is ${a.ratio.toFixed(1)}× your usual — ${ghost ? '••••' : fmt.money(a.current)} vs ${ghost ? '••••' : fmt.money(a.avg)} avg.`
      );
    }

    // 1. Top spending category this month
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const monthExpenses = txns.filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= now);
    if (monthExpenses.length > 0) {
      const catTotals = new Map<string, number>();
      for (const t of monthExpenses) {
        catTotals.set(t.categoryId, (catTotals.get(t.categoryId) ?? 0) + parseFloat(t.amount));
      }
      const [topCatId, topAmt] = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0];
      const topCatName = catName(topCatId);
      tips.push(`Your biggest spend this month is ${topCatName} (${ghost ? '••••' : fmt.money(D(topAmt.toFixed(2)))}).`);
    }

    // 2. Savings rate
    if (!summary.income.isZero()) {
      if (savingsRate >= 20) {
        tips.push(`Great savings discipline — you're saving ${savingsRate.toFixed(0)}% of income this period.`);
      } else if (savingsRate > 0) {
        tips.push(`Your savings rate is ${savingsRate.toFixed(0)}% this period.`);
      } else {
        tips.push(`You're spending more than you earn this period.`);
      }
    } else if (txns.length === 0) {
      tips.push(`No transactions yet. Load sample data from Settings to explore your dashboard.`);
    }

    // 3. Biggest liability
    if (liabilities.length > 0) {
      const biggest = [...liabilities].sort((a, b) => parseFloat(b.principal) - parseFloat(a.principal))[0];
      // Informational framing only — no recommendation. See the SEBI note in
      // domain/narrative.ts: naming a balance is description; telling someone
      // which debt to pay first is advice.
      tips.push(`Biggest liability: "${biggest.name}" at ${ghost ? '••••' : fmt.money(D(biggest.principal))}, at ${biggest.aprPct}% APR.`);
    } else if (txns.length > 0) {
      tips.push(`No liabilities tracked — loans and credit cards feed the Efficiency part of your score.`);
    }

    // 4. Investment nudge
    if (holdings.length === 0 && txns.length > 0) {
      tips.push(`No investments tracked yet — your score's Wealth and Future areas stay unscored until you add one.`);
    } else if (holdings.length > 0) {
      const investedVal = holdings.reduce((s, h) => s + parseFloat(h.quantity) * parseFloat(h.lastPrice ?? h.avgCost), 0);
      const totalVal = netWorth.toNumber();
      if (totalVal > 0 && investedVal / totalVal < 0.1) {
        tips.push(`${((investedVal / totalVal) * 100).toFixed(0)}% of your net worth is in tracked investments.`);
      }
    }

    return tips.slice(0, 5);
  }, [txns, holdings, liabilities, recurring, summary, savingsRate, netWorth, categories, ghost, fmt]);

  return (
    <div className="space-y-6">
      {/* Net worth hero */}
      <GlassCard className="p-6 md:p-7" data-tour="networth">
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow">Net worth</div>
            <div className="mt-2.5 text-[38px] md:text-[44px] leading-none font-bold tracking-[-0.03em] tnum" title={moneyToWords(netWorth)}>
              {mask(fmt.money(netWorth))}
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: summary.net.gte(0) ? 'var(--income)' : 'var(--expense)' }}>
              {summary.net.gte(0) ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
              {mask(fmt.money(summary.net))}<span className="text-muted font-normal">this period</span>
            </div>
          </div>
          <button onClick={toggleGhost} title="Privacy" className="focus-ring w-8 h-8 grid place-items-center rounded-full hover:bg-[var(--fill)] text-ink-soft transition-colors">
            {ghost ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <div className="mt-7 pt-5 border-t border-[var(--line)] grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
          <HeroStat label="Cash" value={mask(fmt.money(cash))} dot="var(--accent)" />
          <HeroStat label="Investments" value={mask(fmt.money(invest))} dot="var(--income)" href="/investments" />
          <HeroStat label="Liabilities" value={mask(fmt.money(liab))} dot="var(--expense)" href="/liabilities" />
          <HeroStat label="Savings rate" value={ghost ? '••••' : `${savingsRate.toFixed(1)}%`} dot="var(--warn)" />
        </div>
      </GlassCard>

      {/* Trend + period */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2">
          <SectionHeader
            title="Net Worth Trend"
            action={
              useRealSnapshots ? (
                <span className="text-[11px] font-medium text-muted px-2 py-0.5 rounded-full bg-accent/10 text-accent">live history</span>
              ) : (
                <div className="flex gap-1">
                  {WINDOWS.map((w) => (
                    <button key={w} onClick={() => setWin(w)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${win === w ? 'bg-accent/15 text-accent' : 'text-muted'}`}>{w}</button>
                  ))}
                </div>
              )
            }
          />
          <Sparkline values={series} height={180} />
        </GlassCard>
        <GlassCard>
          <SectionHeader title="This Period" />
          <PeriodRow label="Income" value={mask(fmt.money(summary.income))} color="var(--income)" up />
          <PeriodRow label="Expense" value={mask(fmt.money(summary.expense))} color="var(--expense)" />
          <div className="mt-3 pt-3 border-t border-[var(--glass-border)] flex items-center justify-between">
            <span className="text-ink-soft">Net</span>
            <span className="font-extrabold" style={{ color: summary.net.gte(0) ? 'var(--income)' : 'var(--expense)' }}>{mask(fmt.money(summary.net))}</span>
          </div>
        </GlassCard>
      </div>

      {/* Health + Insights */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Financial Health — 2/5 */}
        <GlassCard className="lg:col-span-2">
          <SectionHeader title="Financial Health" />
          <div className="flex flex-col sm:flex-row items-center gap-5 mt-1">
            {/* Ring */}
            <div className="shrink-0">
              <Ring fraction={(health.score ?? 0) / 100} size={110} stroke={10} color={ringColor}>
                <div className="text-center">
                  <div className="text-2xl font-extrabold leading-none" style={{ color: ringColor }}>
                    {health.score ?? '—'}
                  </div>
                  <div className="text-[10px] font-semibold text-muted mt-0.5">
                    {health.grade ?? 'Not yet scored'}
                  </div>
                </div>
              </Ring>
            </div>
            {/* Categories. An untracked one shows a grey bar and the words
                "Not yet tracked" — never "0/25", which would tell the user they
                scored nothing when the app simply has nothing to score. */}
            <div className="flex-1 w-full space-y-3">
              {health.categories.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-ink">{c.label}</span>
                    <span className="text-xs text-muted">
                      {c.tracked ? `${Math.round(c.score as number)}/${c.weight}` : 'Not yet tracked'}
                    </span>
                  </div>
                  <ProgressBar
                    fraction={c.fraction ?? 0}
                    color={
                      !c.tracked ? 'transparent'
                        : (c.fraction as number) >= 0.7 ? 'var(--income)'
                          : (c.fraction as number) >= 0.4 ? 'var(--warn)' : 'var(--expense)'
                    }
                    height={5}
                  />
                  <div className="text-[11px] text-muted mt-0.5">{c.detail}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-ink-soft mt-4 pt-3 border-t border-[var(--glass-border)] italic">{health.summary}</p>
        </GlassCard>

        {/* Insights — 3/5 */}
        <GlassCard className="lg:col-span-3">
          <SectionHeader title="Insights" action={<Sparkles size={16} className="text-accent" />} />
          {insights.length === 0 ? (
            <div className="text-sm text-muted py-6 text-center">No insights yet — add transactions to get personalised tips.</div>
          ) : (
            <ul className="space-y-3 mt-1">
              {insights.map((tip, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 w-7 h-7 shrink-0 rounded-[10px] grid place-items-center bg-accent/10 text-accent">
                    <Sparkles size={14} />
                  </span>
                  <p className="text-sm text-ink-soft leading-relaxed">{tip}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Lists */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <SectionHeader title="Recent Transactions" action={<Link href="/transactions" className="text-accent text-sm font-semibold">See all</Link>} />
          {recent.length === 0 ? <Empty /> : (
            <div className="divide-y divide-[var(--glass-border)]">
              {recent.map((t) => {
                const income = t.type === 'income';
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-9 h-9 rounded-full grid place-items-center" style={{ background: (income ? 'var(--income)' : 'var(--expense)') + '22', color: income ? 'var(--income)' : 'var(--expense)' }}>
                      {income ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t.merchant || catName(t.categoryId)}</div>
                      <div className="text-xs text-muted">{catName(t.categoryId)} · {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                    </div>
                    <div className="font-semibold" style={{ color: income ? 'var(--income)' : 'var(--expense)' }}>{ghost ? '••••' : `${income ? '+' : '-'}${fmt.money(D(t.amount))}`}</div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
        <GlassCard>
          <SectionHeader title="Upcoming Bills" action={<Link href="/recurring" className="text-accent text-sm font-semibold">See all</Link>} />
          {bills.length === 0 ? <Empty /> : (
            <div className="divide-y divide-[var(--glass-border)]">
              {bills.map((b) => {
                const days = Math.ceil((b.nextRun - Date.now()) / 86400000);
                return (
                  <div key={b.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-9 h-9 rounded-full grid place-items-center bg-warn/15 text-warn"><CreditCard size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{b.merchant || catName(b.categoryId)}</div>
                      <div className="text-xs text-muted">{days <= 0 ? 'Due today' : `Due in ${days} day${days > 1 ? 's' : ''}`}</div>
                    </div>
                    <div className="font-semibold">{mask(fmt.money(D(b.amount)))}</div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function HeroStat({ label, value, dot, href }: { label: string; value: string; dot: string; href?: string }) {
  const inner = (
    <div className={href ? 'group cursor-pointer' : ''}>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
        <span className="text-[12px] text-ink-soft group-hover:text-ink transition-colors">{label}</span>
      </div>
      <div className="mt-1.5 text-[19px] font-semibold tracking-tight tnum truncate">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function PeriodRow({ label, value, color, up }: { label: string; value: string; color: string; up?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: color + '22', color }}>
        {up ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
      </span>
      <span className="flex-1 text-ink-soft text-sm">{label}</span>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function Empty() { return <p className="text-muted text-sm py-6 text-center">Nothing yet — load sample data from Settings.</p>; }
