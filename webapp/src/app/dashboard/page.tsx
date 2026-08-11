'use client';
/**
 * Dashboard.
 *
 * The order is deliberate: seven headline figures, then the shape of the
 * portfolio over time, then how it is split, then what moved, then what the app
 * has noticed, then the positions themselves. Summary before detail.
 *
 * Every figure is computed from the vault. The one synthesised value is the
 * day's gain, which needs a price feed the app deliberately does not have — it
 * is behind the demo switch and carries the badge.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, TrendingUp, Percent, Coins, Landmark, Layers, HandCoins,
  Sparkles, ArrowUpRight, ArrowDownRight, CreditCard, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { useDarkMode } from '@/lib/useDarkMode';
import { useNow, daysUntil } from '@/lib/useNow';
import { short, pct as fmtPct } from '@/lib/format';
import { healthScore } from '@/domain/health';
import { liquidBalance, moneyAccounts } from '@/domain/accountLedger';
import { investmentTotals } from '@/domain/investmentTotals';
import { spendingAnomalies, safeToSpend } from '@/domain/insights';
import { generateNarratives, NARRATIVE_DISCLAIMER, type NarrativeTone } from '@/domain/narrative';
import {
  portfolioSummary, allocationByGroup, rollup, ASSET_GROUP_META, UNCLASSIFIED_KEY,
} from '@/domain/portfolio';
import { netWorthTotal, netWorthSeries, windowSummary } from '@/domain/finance';
import { currentMonth, custom, trailingDays, type DateRange } from '@/domain/period';
import { MonthNav } from '@/components/MonthNav';
import { loadInstrumentMaster, classifyHolding, EMPTY_MASTER, type InstrumentMaster } from '@/domain/instrumentMaster';
import { dayChange, priceAsOfLabel } from '@/domain/dayChange';
import { GlassCard, SectionHeader, Ring, ProgressBar, Segmented, Chip, Delta, Donut, type DonutSeg } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import {
  PageHeader, Section, Metric, MetricRow, MoneyValue, LedgerLine, AssetMark } from '@/components/primitives';
import { LineChart } from '@/components/charts/LineChart';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem } from '@/components/motion';

/** Ranges the snapshot history can answer. */
const RANGES = [
  { key: '1W', days: 7 }, { key: '1M', days: 30 }, { key: '3M', days: 90 },
  { key: '6M', days: 182 }, { key: '1Y', days: 365 }, { key: 'ALL', days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const SERIES_COLOURS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

const toneColor = (t: NarrativeTone) =>
  t === 'positive' ? 'var(--success)' : t === 'caution' ? 'var(--warning)' : 'var(--accent)';

export default function DashboardPage() {
  const txns = useApp((s) => s.txns);
  const holdings = useApp((s) => s.holdings);
  const liabilities = useApp((s) => s.liabilities);
  const recurring = useApp((s) => s.recurring);
  const categories = useApp((s) => s.categories);
  const goals = useApp((s) => s.goals);
  const insurances = useApp((s) => s.insurances);
  const budgets = useApp((s) => s.budgets);
  const snapshots = useApp((s) => s.snapshots);
  const dividends = useApp((s) => s.dividends);
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const ghost = useApp((s) => s.ghost);
  const toggleGhost = useApp((s) => s.toggleGhost);

  const fmt = useFmt();
  const dark = useDarkMode();
  const [demo] = useDemoData();
  const now = useNow();
  const [range, setRange] = useState<RangeKey>('3M');
  const [allocDim, setAllocDim] = useState<'asset' | 'sector' | 'cap'>('asset');

  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  useEffect(() => { void loadInstrumentMaster().then(setMaster); }, []);
  const classify = useCallback(
    (h: Parameters<typeof classifyHolding>[1]) => classifyHolding(master, h),
    [master],
  );

  const mask = (s: string) => (ghost ? '••••••' : s);

  // ---- Headline figures ---------------------------------------------------
  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);
  const cash = useMemo(() => netWorthTotal(txns), [txns]);
  const liab = useMemo(() => liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO), [liabilities]);
  // The daily financial home is the current calendar month (§4.1). This used to
  // be a trailing 30 days captioned "this month" — on the 9th of August that
  // silently counted three weeks of July into a figure labelled August.
  const [pinnedMonth, setPinnedMonth] = useState<DateRange | null>(null);
  const month = useMemo(
    () => pinnedMonth ?? currentMonth(now || undefined),
    [pinnedMonth, now],
  );
  const period = useMemo(() => windowSummary(txns, month), [txns, month]);

  const portfolioValue = summary.current.toNumber();
  const unpricedCount = useMemo(() => holdings.filter((h) => !h.lastPrice).length, [holdings]);
  const moneyAccountCount = useMemo(() => moneyAccounts(accounts).length, [accounts]);

  /**
   * Net-worth movement this month, from recorded snapshots only.
   *
   * Null when there is no snapshot from before the month began — an absent
   * comparison is stated as absent rather than shown as a change of zero,
   * which would read as "you stood still".
   */
  const monthChange = useMemo(() => {
    if (!now) return null;
    const before = snapshots.filter((s) => s.date < month.start).sort((a, b) => b.date - a.date)[0];
    if (!before) return null;
    const delta = cash.plus(summary.current).minus(liab).minus(D(before.netWorth));
    return { s: delta.toNumber(), abs: delta.abs() };
  }, [snapshots, month, cash, summary, liab, now]);
  const invested = summary.invested.toNumber();
  const totalPnl = summary.pnl.toNumber();

  const views = summary.views;
  // Real where the broker export gave us a previous close; only fabricated —
  // and then badged — when nothing real is available. See domain/dayChange.ts.
  const day = useMemo(() => dayChange(holdings, demo), [holdings, demo]);
  const dayPnl = day.pnl;

  const dividendTotal = useMemo(
    () => dividends.filter((d) => d.received).reduce((s, d) => s + D(d.amount).toNumber(), 0),
    [dividends],
  );

  // ---- Performance series -------------------------------------------------
  // Real snapshots only. A range longer than the recorded history simply shows
  // everything there is rather than inventing the rest.
  const days = RANGES.find((r) => r.key === range)!.days;

  /**
   * Recorded history: one snapshot per day the app was opened.
   *
   * Accurate, but it only starts accruing the day you install — so a vault
   * whose data was just imported has nothing to plot for days, and the card
   * sat empty saying "not enough history yet" while holding years of
   * transactions. Hence the derived fallback below.
   */
  const snapshotSeries = useMemo(() => {
    const cutoff = days === Infinity || !now ? 0 : now - days * 86_400_000;
    const points = snapshots.filter((s) => s.date >= cutoff);
    return (points.length >= 2 ? points : snapshots).map((s) => fmt.toNum(D(s.netWorth)));
  }, [snapshots, days, fmt, now]);

  /**
   * Derived history, used only when there are not yet two real snapshots.
   *
   * Walks recorded transactions to get the cash position on each day, then
   * adds today's investments minus liabilities as a constant. That makes the
   * shape the user's actual cash flow and the final point equal to the headline
   * net worth above.
   *
   * It is explicitly an estimate, and the card says so: there is no price
   * history in the vault, so what a holding was worth last March is genuinely
   * unknown and is not going to be invented here.
   */
  const hasRecordedHistory = snapshotSeries.length >= 2;
  const investedNow = summary.current;
  const derivedSeries = useMemo(() => {
    if (hasRecordedHistory) return [];
    // `ALL` is Infinity days; fall back to the oldest transaction so the range
    // is finite and the series still covers everything recorded. Reduced rather
    // than spread into Math.min — a few thousand transactions would overflow
    // the argument limit and throw.
    const span = Number.isFinite(days)
      ? trailingDays(days, now || undefined)
      : custom(txns.reduce((m, t) => Math.min(m, t.date), now || Date.now()), now || Date.now());
    const pts = netWorthSeries(txns, span);
    if (pts.length < 2) return [];
    const baseline = investedNow.minus(liab);
    return pts.map((p) => fmt.toNum(p.value.plus(baseline)));
  }, [hasRecordedHistory, txns, days, investedNow, liab, fmt, now]);

  const series = hasRecordedHistory ? snapshotSeries : derivedSeries;
  const estimated = !hasRecordedHistory && derivedSeries.length >= 2;
  const rangeChange = series.length >= 2 && series[0] !== 0
    ? ((series[series.length - 1] - series[0]) / Math.abs(series[0])) * 100
    : null;

  // ---- Allocation ---------------------------------------------------------
  const allocation = useMemo<DonutSeg[]>(() => {
    if (allocDim === 'asset') {
      return allocationByGroup(holdings).map((r) => ({
        label: r.label,
        value: r.current.toNumber(),
        color: ASSET_GROUP_META[r.key as keyof typeof ASSET_GROUP_META]?.[dark ? 'dark' : 'light'] ?? 'var(--c1)',
      }));
    }
    const rows = rollup(holdings, allocDim === 'sector' ? 'sector' : 'marketCap', classify);
    return rows.map((r, i) => ({
      label: r.label,
      value: r.current.toNumber(),
      // The Unclassified bucket is a coverage fact, not a category — grey, so it
      // never competes with a real slice for attention.
      color: r.key === UNCLASSIFIED_KEY ? 'var(--muted)' : SERIES_COLOURS[i % SERIES_COLOURS.length],
    }));
  }, [holdings, allocDim, classify, dark]);

  // ---- Movers -------------------------------------------------------------
  const byReturn = useMemo(() => [...views].sort((a, b) => b.pnlPct - a.pnlPct), [views]);
  const gainers = byReturn.filter((v) => v.pnl.gt(0)).slice(0, 3);
  const losers = byReturn.filter((v) => v.pnl.lt(0)).slice(-3).reverse();
  const topHoldings = useMemo(
    () => [...views].sort((a, b) => b.current.toNumber() - a.current.toNumber()).slice(0, 6),
    [views],
  );

  // ---- Health + narratives ------------------------------------------------
  const health = useMemo(
    () => healthScore({
      txns, investments: investmentTotals(holdings), liabilities, goals, insurances, budgets, snapshots,
      cash: liquidBalance(accounts, postings),
    }),
    [txns, holdings, liabilities, goals, insurances, budgets, snapshots, accounts, postings],
  );
  const ringColor =
    health.score === null ? 'var(--muted)'
      : health.score >= 70 ? 'var(--success)'
        : health.score >= 40 ? 'var(--warning)' : 'var(--danger)';

  // Insights come from the narrative engine, which assembles every sentence
  // from a fixed template table and is tested against a banned-phrase list.
  const narratives = useMemo(
    () => generateNarratives({
      health,
      investments: investmentTotals(holdings),
      safeToSpend: safeToSpend(txns, recurring),
      anomalies: spendingAnomalies(txns),
      snapshots,
      categoryNames: Object.fromEntries(categories.map((c) => [c.id, c.name])),
      formatMoney: (v) => (ghost ? '••••' : fmt.money(v)),
    }),
    [health, holdings, txns, recurring, snapshots, categories, ghost, fmt],
  );

  const bills = [...recurring].sort((a, b) => a.nextRun - b.nextRun).slice(0, 5);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Other';

  return (
    <Stagger className="grid gap-6">
      {/* ---- Position ------------------------------------------------------ */}
      {/* A statement, not a card grid. The old shape was seven bordered KPI
          cards in a row — the classic generated-dashboard composition, where
          every figure shouts equally and none of them is the point. Here net
          worth is the point, its parts sit under it, and this month reads like
          the summary of an account. */}
      <StaggerItem>
        <PageHeader
          title="Dashboard"
          meta={`${month.label}${unpricedCount > 0 ? ` · ${unpricedCount} position${unpricedCount === 1 ? '' : 's'} carried at cost` : ''}`}
          action={
            <>
              <MonthNav
                month={month}
                now={now || undefined}
                onChange={(m) => setPinnedMonth(m.start === currentMonth(now || undefined).start ? null : m)}
              />
              <button
                onClick={toggleGhost}
                data-tour="networth"
                className="focus-ring inline-flex items-center gap-2 h-[var(--control-md)] px-3 rounded-[var(--radius-btn)] border border-line bg-card text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line-strong transition-colors"
              >
                {ghost ? <EyeOff size={15} /> : <Eye size={15} />}
                {ghost ? 'Amounts hidden' : 'Hide amounts'}
              </button>
            </>
          }
        />
      </StaggerItem>

      <StaggerItem>
        <Section title="Net worth" first>
          <MoneyValue size="xl" hidden={ghost}>
            {fmt.money(cash.plus(summary.current).minus(liab))}
          </MoneyValue>
          {monthChange != null && (
            <div className="mt-1.5 text-[13px]">
              <MoneyValue tone="delta" sign={monthChange.s} size="sm" hidden={ghost}>
                {`${monthChange.s >= 0 ? '+' : '−'}${fmt.money(monthChange.abs)}`}
              </MoneyValue>
              <span className="text-muted"> this month</span>
            </div>
          )}

          <MetricRow className="mt-6">
            <Metric label="Cash" value={fmt.money(cash)} hidden={ghost}
              sub={`${moneyAccountCount} account${moneyAccountCount === 1 ? '' : 's'}`} />
            <Metric label="Investments" value={fmt.money(summary.current)} hidden={ghost}
              sub={`${holdings.length} position${holdings.length === 1 ? '' : 's'}`} />
            <Metric label="Invested" value={fmt.money(summary.invested)} hidden={ghost}
              sub="Cost basis" />
            <Metric
              label="Unrealised P&L"
              value={`${totalPnl >= 0 ? '+' : '−'}${fmt.money(Math.abs(totalPnl))}`}
              tone="delta" sign={totalPnl} hidden={ghost}
              sub={`${summary.pnlPct >= 0 ? '+' : ''}${summary.pnlPct.toFixed(2)}% all time`}
            />
          </MetricRow>
        </Section>
      </StaggerItem>

      {/* ---- This month ---------------------------------------------------- */}
      {/* The dedicated current-month surface: you should not have to choose a
          reporting window to learn where you are this month. */}
      <StaggerItem>
        <Section title="This month" description={month.label}>
          <div className="grid gap-x-10 md:grid-cols-2">
            <div>
              <LedgerLine label="Income" value={fmt.money(period.income)} hidden={ghost} />
              <LedgerLine label="Expenses" value={fmt.money(period.expense)} hidden={ghost} />
              {period.invested.gt(0) && (
                <LedgerLine label="Invested" value={fmt.money(period.invested)} hidden={ghost} />
              )}
              <LedgerLine
                label="Net cash flow" value={fmt.money(period.net)}
                tone="delta" sign={period.net.toNumber()} emphasis hidden={ghost}
              />
            </div>
            <div className="mt-5 md:mt-0 flex flex-col justify-center gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                Savings rate
              </div>
              <div className="flex items-baseline gap-2">
                <MoneyValue size="lg" hidden={ghost}>
                  {period.income.gt(0)
                    ? `${period.net.div(period.income).times(100).toNumber().toFixed(0)}%`
                    : '—'}
                </MoneyValue>
                {period.income.gt(0) && (
                  <span className="text-[12px] text-muted">of income kept</span>
                )}
              </div>
              {dayPnl != null && day.isReal && (
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
                    Day change
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <MoneyValue tone="delta" sign={dayPnl} size="md" hidden={ghost}>
                      {`${dayPnl >= 0 ? '+' : '−'}${fmt.money(Math.abs(dayPnl))}`}
                    </MoneyValue>
                    <span className="text-[12px] text-muted">
                      {day.covered < day.total
                        ? `${day.covered} of ${day.total} priced`
                        : priceAsOfLabel(holdings, now)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>
      </StaggerItem>

      {/* ---- Performance --------------------------------------------------- */}
      <StaggerItem>
        <section className="card">
          <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Portfolio performance</h2>
              <p className="text-xs text-muted mt-0.5">
                {snapshots.length >= 2 ? `${snapshots.length} recorded snapshots` : 'Recorded once a day when you open Khazana'}
              </p>
            </div>
            <span className="ml-auto">
              <Segmented
                value={range}
                onChange={setRange}
                options={RANGES.map((r) => ({ value: r.key, label: r.key }))}
              />
            </span>
          </div>
          <div className="p-5">
            <div className="flex items-end gap-4 flex-wrap mb-5">
              <div>
                <div className="eyebrow">Net worth</div>
                <div className="text-[34px] font-bold tracking-[-0.04em] leading-[1.05] tnum mt-1">
                  {mask(fmt.money(cash.plus(summary.current).minus(liab)))}
                </div>
              </div>
              {rangeChange != null && (
                <div className="pb-1.5 flex items-center gap-2.5">
                  <Delta value={rangeChange} />
                  <span className="text-[12.5px] text-muted">over {range === 'ALL' ? 'all recorded history' : range}</span>
                </div>
              )}
            </div>
            {series.length >= 2 ? (
              <>
                <LineChart values={series} height={260} format={(n) => short(n, fmt.symbol)}
                  ariaLabel={`Net worth over ${range}`} />
                {estimated && (
                  <p className="mt-3 text-[12px] text-muted leading-relaxed">
                    Estimated from your recorded transactions, with today&apos;s investments and liabilities
                    held constant — the vault keeps no price history, so past holding values are unknown.
                    Daily snapshots replace this automatically once two have been recorded.
                  </p>
                )}
              </>
            ) : (
              <p className="py-16 text-center text-[13px] text-muted">
                Nothing to plot yet. Add or import transactions and the trend appears immediately;
                Khazana also records one snapshot a day as you use it.
              </p>
            )}
          </div>
        </section>
      </StaggerItem>

      {/* ---- Allocation + movers ------------------------------------------- */}
      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <StaggerItem>
          <section className="card h-full">
            <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-b border-line">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Allocation</h2>
              <span className="ml-auto">
                <Segmented
                  value={allocDim}
                  onChange={setAllocDim}
                  options={[
                    { value: 'asset', label: 'Asset' },
                    { value: 'sector', label: 'Sector' },
                    { value: 'cap', label: 'Market cap' },
                  ]}
                />
              </span>
            </div>
            <div className="p-5">
              {allocation.length > 0 ? (
                <Donut
                  segments={allocation}
                  size={168}
                  stroke={22}
                  maxSlices={6}
                  formatValue={(n) => (ghost ? '••••' : short(n, fmt.symbol))}
                  centerText={ghost ? '••••' : short(portfolioValue, fmt.symbol)}
                  centerSub="Total"
                />
              ) : (
                <p className="py-12 text-center text-[13px] text-muted">Add a holding to see how the book is split.</p>
              )}
            </div>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card h-full">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Movers</h2>
              <p className="text-xs text-muted mt-0.5">By return since purchase</p>
            </div>
            <div className="p-5 grid gap-5">
              {[['Best', gainers, true] as const, ['Weakest', losers, false] as const].map(([title, list, up]) => (
                <div key={title}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="eyebrow">{title}</span>
                    <Chip tone={up ? 'success' : 'danger'}>{list.length}</Chip>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-[12.5px] text-muted py-2">Nothing {up ? 'above' : 'below'} cost.</p>
                  ) : (
                    <div className="grid gap-2.5">
                      {list.map((v) => (
                        <div key={v.holding.id} className="flex items-center gap-3">
                          <span className={`w-8 h-8 shrink-0 rounded-[var(--radius-card)] grid place-items-center ${up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                            {up ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold truncate">{v.holding.name ?? v.holding.symbol}</span>
                            <span className="block text-[11.5px] text-muted">{v.holding.symbol}</span>
                          </span>
                          <span className="text-right">
                            <span className={`block text-[13px] font-semibold tnum ${up ? 'text-success' : 'text-danger'}`}>
                              {fmtPct(v.pnlPct)}
                            </span>
                            <span className="block text-[11px] text-muted tnum">{mask(fmt.money(v.pnl.abs()))}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </StaggerItem>
      </div>

      {/* ---- Health + insights --------------------------------------------- */}
      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <StaggerItem>
          <GlassCard className="h-full">
            <SectionHeader title="Financial health" />
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <Ring fraction={(health.score ?? 0) / 100} size={110} stroke={10} color={ringColor}>
                <div className="text-center">
                  <div className="text-2xl font-bold leading-none" style={{ color: ringColor }}>{health.score ?? '—'}</div>
                  <div className="text-[10px] font-semibold text-muted mt-0.5">{health.grade ?? 'Not yet scored'}</div>
                </div>
              </Ring>
              {/* An untracked category shows a grey bar and the words "Not yet
                  tracked" — never "0/25", which would report a score the app
                  never actually measured. */}
              <div className="flex-1 w-full grid gap-3">
                {health.categories.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{c.label}</span>
                      <span className="text-xs text-muted">
                        {c.tracked ? `${Math.round(c.score as number)}/${c.weight}` : 'Not yet tracked'}
                      </span>
                    </div>
                    <ProgressBar
                      fraction={c.fraction ?? 0}
                      color={!c.tracked ? 'transparent'
                        : (c.fraction as number) >= 0.7 ? 'var(--success)'
                          : (c.fraction as number) >= 0.4 ? 'var(--warning)' : 'var(--danger)'}
                      height={5}
                    />
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-ink-soft mt-4 pt-3 border-t border-line italic">{health.summary}</p>
          </GlassCard>
        </StaggerItem>

        <StaggerItem>
          <section className="card h-full flex flex-col">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-line">
              <Sparkles size={17} className="text-accent" />
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Insights</h2>
              <span className="ml-auto"><Chip>{narratives.length} observation{narratives.length === 1 ? '' : 's'}</Chip></span>
            </div>
            {narratives.length === 0 ? (
              <p className="flex-1 grid place-items-center text-[13px] text-muted p-8 text-center">
                Add a transaction, a holding or a policy and insights will appear here.
              </p>
            ) : (
              <div className="flex-1">
                {narratives.slice(0, 5).map((n) => (
                  <div key={n.id} className="flex gap-3 px-5 py-3.5 border-b border-line last:border-0">
                    <span
                      className="w-8 h-8 mt-0.5 shrink-0 rounded-[var(--radius-card)] grid place-items-center"
                      style={{ background: `color-mix(in srgb, ${toneColor(n.tone)} 13%, transparent)`, color: toneColor(n.tone) }}
                    >
                      <Sparkles size={15} />
                    </span>
                    <p className="text-[13px] text-ink-soft leading-relaxed">{n.text}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="px-5 py-3 text-[11px] text-muted border-t border-line bg-fill">{NARRATIVE_DISCLAIMER}</p>
          </section>
        </StaggerItem>
      </div>

      {/* ---- Positions + bills --------------------------------------------- */}
      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <StaggerItem>
          <section className="card overflow-hidden h-full">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Top holdings</h2>
                <p className="text-xs text-muted mt-0.5">By value · {holdings.length} total</p>
              </div>
              <Link href="/holdings" className="ml-auto focus-ring inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
                View all <ChevronRight size={15} />
              </Link>
            </div>
            {topHoldings.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-muted">
                No holdings yet — load sample data from Settings, or add one from Portfolio.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      {['Company', 'Value', 'Weight', 'Return'].map((h, i) => (
                        <th key={h} className={`sticky top-0 bg-card-2 border-b border-line px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topHoldings.map((v, i) => {
                      const weight = portfolioValue ? (v.current.toNumber() / portfolioValue) * 100 : 0;
                      return (
                        <tr key={v.holding.id} className="hover:bg-fill transition-colors">
                          <td className="px-3 py-2.5 border-b border-line">
                            <div className="flex items-center gap-2.5">
                              <AssetMark colour={SERIES_COLOURS[i % SERIES_COLOURS.length]} />
                              <span className="min-w-0">
                                <span className="block font-semibold truncate">{v.holding.name ?? v.holding.symbol}</span>
                                <span className="block text-[11px] text-muted">{v.holding.symbol}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 border-b border-line text-right font-semibold tnum whitespace-nowrap">{mask(fmt.money(v.current))}</td>
                          <td className="px-3 py-2.5 border-b border-line text-right tnum text-ink-soft">{weight.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 border-b border-line text-right">
                            <span className={`font-semibold tnum ${v.pnl.gte(0) ? 'text-success' : 'text-danger'}`}>{fmtPct(v.pnlPct)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card overflow-hidden h-full">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Upcoming bills</h2>
              <Link href="/recurring" className="ml-auto focus-ring inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
                See all <ChevronRight size={15} />
              </Link>
            </div>
            {bills.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-muted">Nothing scheduled.</p>
            ) : (
              bills.map((b) => {
                const due = daysUntil(b.nextRun, now);
                return (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0 hover:bg-fill transition-colors">
                    <span className="w-9 h-9 shrink-0 rounded-[var(--radius-card)] grid place-items-center bg-warning-soft text-warning">
                      <CreditCard size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold truncate">{b.merchant || catName(b.categoryId)}</span>
                      <span className="block text-[11.5px] text-muted">{due == null ? '—' : due <= 0 ? 'Due today' : `Due in ${due} day${due === 1 ? '' : 's'}`}</span>
                    </span>
                    <span className="font-semibold tnum text-[13.5px]">{mask(fmt.money(D(b.amount)))}</span>
                  </div>
                );
              })
            )}
          </section>
        </StaggerItem>
      </div>
    </Stagger>
  );
}
