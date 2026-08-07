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
import { investmentTotals } from '@/domain/investmentTotals';
import { spendingAnomalies, safeToSpend } from '@/domain/insights';
import { generateNarratives, NARRATIVE_DISCLAIMER, type NarrativeTone } from '@/domain/narrative';
import {
  portfolioSummary, allocationByGroup, rollup, ASSET_GROUP_META, UNCLASSIFIED_KEY,
} from '@/domain/portfolio';
import { netWorthTotal, windowSummary } from '@/domain/finance';
import { loadInstrumentMaster, lookupClassification, EMPTY_MASTER, type InstrumentMaster } from '@/domain/instrumentMaster';
import { demoDayChangePct } from '@/lib/demo/marketFeed';
import { GlassCard, SectionHeader, Ring, ProgressBar, Segmented, Chip, Delta, Donut, type DonutSeg } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
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
    (h: { symbol: string }) => lookupClassification(master, { symbol: h.symbol }),
    [master],
  );

  const mask = (s: string) => (ghost ? '••••••' : s);

  // ---- Headline figures ---------------------------------------------------
  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);
  const cash = useMemo(() => netWorthTotal(txns), [txns]);
  const liab = useMemo(() => liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO), [liabilities]);
  const period = useMemo(() => windowSummary(txns, '1M'), [txns]);

  const portfolioValue = summary.current.toNumber();
  const invested = summary.invested.toNumber();
  const totalPnl = summary.pnl.toNumber();

  const views = summary.views;
  const dayPnl = useMemo(() => {
    if (!demo) return null;
    return views.reduce((s, v) => s + v.current.toNumber() * (demoDayChangePct(v.holding.symbol) / 100), 0);
  }, [views, demo]);
  const dayPct = dayPnl == null || portfolioValue === 0 ? null : (dayPnl / portfolioValue) * 100;

  const dividendTotal = useMemo(
    () => dividends.filter((d) => d.received).reduce((s, d) => s + D(d.amount).toNumber(), 0),
    [dividends],
  );

  // ---- Performance series -------------------------------------------------
  // Real snapshots only. A range longer than the recorded history simply shows
  // everything there is rather than inventing the rest.
  const days = RANGES.find((r) => r.key === range)!.days;
  const series = useMemo(() => {
    // Until the clock is known (first frame) show the whole history rather than
    // filtering against a bogus cutoff.
    const cutoff = days === Infinity || !now ? 0 : now - days * 86_400_000;
    const points = snapshots.filter((s) => s.date >= cutoff);
    return (points.length >= 2 ? points : snapshots).map((s) => fmt.toNum(D(s.netWorth)));
  }, [snapshots, days, fmt, now]);
  const rangeChange = series.length >= 2 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : null;

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
    () => healthScore({ txns, investments: investmentTotals(holdings), liabilities, goals, insurances, budgets, snapshots }),
    [txns, holdings, liabilities, goals, insurances, budgets, snapshots],
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
      {/* ---- Headline ------------------------------------------------------ */}
      <StaggerItem>
        <div className="flex items-end gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[var(--fs-h1)] leading-[1.15] font-bold tracking-[-0.03em] font-display">Dashboard</h1>
            <p className="text-ink-soft text-sm mt-1.5">
              Net worth {mask(fmt.money(cash.plus(summary.current).minus(liab)))} · {holdings.length} positions
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleGhost}
              data-tour="networth"
              className="focus-ring inline-flex items-center gap-2 h-9 px-3 rounded-btn border border-line bg-card text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line-strong transition-colors"
            >
              {ghost ? <EyeOff size={15} /> : <Eye size={15} />}
              {ghost ? 'Amounts hidden' : 'Hide amounts'}
            </button>
          </div>
        </div>
      </StaggerItem>

      {/* ---- Seven KPIs ---------------------------------------------------- */}
      <StaggerItem>
        <KpiRow cols={7}>
          <Kpi
            label="Portfolio value" icon={Wallet} tone="accent"
            value={ghost ? '••••' : undefined}
            numeric={ghost ? undefined : portfolioValue}
            format={(n) => short(n, fmt.symbol)}
            footer={dayPct != null ? <><Delta value={dayPct} /> today</> : `${holdings.length} positions`}
          />
          <Kpi
            label="Today's gain" icon={TrendingUp} tone={(dayPnl ?? 0) >= 0 ? 'success' : 'danger'}
            value={ghost ? '••••' : dayPnl == null ? null : undefined}
            numeric={ghost || dayPnl == null ? undefined : dayPnl}
            format={(n) => (n >= 0 ? '+' : '−') + short(Math.abs(n), fmt.symbol)}
            footer={dayPnl == null ? undefined : <>{demo && <DemoBadge label="Demo" />}</>}
          />
          <Kpi
            label="Overall return" icon={Percent} tone={totalPnl >= 0 ? 'violet' : 'danger'}
            value={ghost ? '••••' : undefined}
            numeric={ghost ? undefined : totalPnl}
            format={(n) => (n >= 0 ? '+' : '−') + short(Math.abs(n), fmt.symbol)}
            footer={<><Delta value={summary.pnlPct} /> all time</>}
          />
          <Kpi
            label="Total invested" icon={Coins} tone="warning"
            value={ghost ? '••••' : undefined}
            numeric={ghost ? undefined : invested}
            format={(n) => short(n, fmt.symbol)}
            footer="Cost basis"
          />
          <Kpi
            label="Available cash" icon={Landmark} tone="accent"
            value={ghost ? '••••' : undefined}
            numeric={ghost ? undefined : cash.toNumber()}
            format={(n) => short(n, fmt.symbol)}
            footer={`${period.income.gt(0) ? ((period.net.div(period.income).times(100).toNumber()).toFixed(0) + '% saved') : 'This month'}`}
          />
          <Kpi label="Holdings" icon={Layers} tone="success" value={String(holdings.length)}
            footer={`${allocationByGroup(holdings).length} asset groups`} />
          <Kpi
            label="Dividends" icon={HandCoins} tone="warning"
            value={ghost ? '••••' : dividendTotal === 0 ? null : undefined}
            numeric={ghost || dividendTotal === 0 ? undefined : dividendTotal}
            format={(n) => short(n, fmt.symbol)}
            footer={dividendTotal > 0 && portfolioValue > 0 ? `${((dividendTotal / portfolioValue) * 100).toFixed(2)}% yield` : undefined}
          />
        </KpiRow>
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
              <LineChart values={series} height={260} format={(n) => short(n, fmt.symbol)}
                ariaLabel={`Net worth over ${range}`} />
            ) : (
              <p className="py-16 text-center text-[13px] text-muted">
                Not enough history yet. Khazana records one snapshot a day, so the trend fills in as you use it.
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
                          <span className={`w-8 h-8 shrink-0 rounded-[10px] grid place-items-center ${up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
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
                      className="w-8 h-8 mt-0.5 shrink-0 rounded-[10px] grid place-items-center"
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
                              <span className="w-[30px] h-[30px] shrink-0 rounded-[9px] grid place-items-center text-[11px] font-bold text-white"
                                style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }}>
                                {v.holding.symbol.slice(0, 2)}
                              </span>
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
                    <span className="w-9 h-9 shrink-0 rounded-[11px] grid place-items-center bg-warning-soft text-warning">
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
