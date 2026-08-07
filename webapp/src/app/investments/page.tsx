'use client';
/**
 * Portfolio Overview.
 *
 * The route keeps its old `/investments` path because it is one of the five
 * Flutter bottom-bar tabs and renaming it would break cross-client parity
 * (`Shell.test.tsx` guards this). The position table that used to live here now
 * has its own screen at `/holdings`.
 *
 * ONE filter drives the whole page. `All Holdings` narrows the working set, and
 * every KPI, donut, chart and table below recomputes from that same array —
 * there is no panel that quietly ignores it.
 *
 * Honesty rules that shape the layout:
 *   - Today's P&L needs a price feed the app does not have. It is synthesised,
 *     badged, and disappears entirely when demo data is switched off.
 *   - "As on" can only reach as far back as the recorded snapshot history.
 *     Holdings themselves have no per-day price history, so when a past date is
 *     chosen the table says so rather than pretending to time-travel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, Coins, Percent, TrendingUp, Layers, Hash, Plus, CalendarDays,
  ChevronDown, Filter, ArrowUpRight, ArrowDownRight, Info,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { useDarkMode } from '@/lib/useDarkMode';
import { useNow } from '@/lib/useNow';
import { short, pct as fmtPct } from '@/lib/format';
import {
  portfolioSummary, allocationByGroup, rollup, holdingView,
  ASSET_META, ASSET_GROUP_META, ASSET_GROUP_OF, UNCLASSIFIED_KEY, type AssetGroup,
} from '@/domain/portfolio';
import { investmentTotals, concentration } from '@/domain/investmentTotals';
import { loadInstrumentMaster, lookupClassification, EMPTY_MASTER, type InstrumentMaster } from '@/domain/instrumentMaster';
import { demoDayChangePct } from '@/lib/demo/marketFeed';
import { PageIntro, Button, Chip, Delta, Donut, Gauge, EmptyState, GlassCard, type DonutSeg } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { MiniSparkline, RankBars } from '@/components/charts/MiniSparkline';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem } from '@/components/motion';

const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

interface Row {
  id: string; symbol: string; company: string; exchange: string; sector: string;
  qty: number; avg: number; ltp: number; current: number; invested: number;
  pnl: number; pnlPct: number; dayPnl: number | null; dayPct: number | null; weight: number;
}

export default function PortfolioPage() {
  const holdings = useApp((s) => s.holdings);
  const snapshots = useApp((s) => s.snapshots);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const dark = useDarkMode();
  const now = useNow();
  const [demo] = useDemoData();

  const [group, setGroup] = useState<'all' | AssetGroup>('all');
  const [groupOpen, setGroupOpen] = useState(false);
  // '' means "today". The field DISPLAYS today rather than an empty
  // dd/mm/yyyy, but the empty string is kept as the state so no effect has to
  // write it — deriving it here avoids a setState-in-effect cascade.
  const [asOn, setAsOn] = useState('');
  const [allocMode, setAllocMode] = useState<'current' | 'invested'>('current');

  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  useEffect(() => { void loadInstrumentMaster().then(setMaster); }, []);
  const classify = useCallback(
    (h: { symbol: string }) => lookupClassification(master, { symbol: h.symbol }),
    [master],
  );

  const mask = (s: string) => (ghost ? '••••••' : s);

  // ---- The working set. Everything below derives from this. ---------------
  const filtered = useMemo(
    () => (group === 'all' ? holdings : holdings.filter((h) => ASSET_GROUP_OF[h.assetType] === group)),
    [holdings, group],
  );
  const summary = useMemo(() => portfolioSummary(filtered), [filtered]);
  const views = summary.views;
  const totalValue = summary.current.toNumber();

  const groupsPresent = useMemo(() => {
    const seen = new Set<AssetGroup>();
    for (const h of holdings) seen.add(ASSET_GROUP_OF[h.assetType]);
    return [...seen];
  }, [holdings]);

  // ---- Rows ---------------------------------------------------------------
  const rows = useMemo<Row[]>(() => views.map((v) => {
    const h = v.holding;
    const cls = classify(h);
    const dayPct = demo ? demoDayChangePct(h.symbol) : null;
    const current = v.current.toNumber();
    return {
      id: h.id, symbol: h.symbol, company: h.name ?? h.symbol, exchange: h.exchange,
      sector: h.sector ?? cls?.sector ?? 'Unclassified',
      qty: D(h.quantity).toNumber(), avg: D(h.avgCost).toNumber(), ltp: D(h.lastPrice ?? h.avgCost).toNumber(),
      current, invested: v.invested.toNumber(), pnl: v.pnl.toNumber(), pnlPct: v.pnlPct,
      dayPct, dayPnl: dayPct == null ? null : (current * dayPct) / 100,
      weight: totalValue ? (current / totalValue) * 100 : 0,
    };
  }), [views, classify, demo, totalValue]);

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const dayPnlTotal = demo ? rows.reduce((s, r) => s + (r.dayPnl ?? 0), 0) : null;
  const dayPctTotal = dayPnlTotal == null || totalValue === 0 ? null : (dayPnlTotal / totalValue) * 100;
  const profitable = rows.filter((r) => r.pnl > 0).length;
  const losing = rows.filter((r) => r.pnl < 0).length;

  // ---- Snapshot history, cut at the "as on" date --------------------------
  const todayStr = now ? new Date(now).toISOString().slice(0, 10) : '';
  const asOnValue = asOn || todayStr;
  const asOnMs = asOn ? new Date(asOn).getTime() + 86_399_000 : null;
  const history = useMemo(
    () => (asOnMs ? snapshots.filter((s) => s.date <= asOnMs) : snapshots),
    [snapshots, asOnMs],
  );
  const spark = useMemo(() => history.slice(-40).map((s) => fmt.toNum(D(s.netWorth))), [history, fmt]);
  const isPast = asOnMs != null && now > 0 && asOnMs < now - 86_400_000;

  // ---- Donuts -------------------------------------------------------------
  const byGroupSegs = useMemo<DonutSeg[]>(() => {
    const rowsG = allocationByGroup(filtered);
    return rowsG.map((r) => ({
      label: r.label,
      value: allocMode === 'current' ? r.current.toNumber() : r.invested.toNumber(),
      color: ASSET_GROUP_META[r.key as AssetGroup]?.[dark ? 'dark' : 'light'] ?? 'var(--c1)',
    }));
  }, [filtered, allocMode, dark]);

  /** Top holdings by weight, with the tail folded into "Others". */
  const topSegs = useCallback((mode: 'current' | 'invested'): DonutSeg[] => {
    const sorted = [...rows].sort((a, b) => b[mode] - a[mode]);
    const head = sorted.slice(0, 5);
    const tail = sorted.slice(5);
    const segs: DonutSeg[] = head.map((r, i) => ({ label: r.symbol, value: r[mode], color: SERIES[i] }));
    if (tail.length) {
      segs.push({ label: `Others (${tail.length})`, value: tail.reduce((s, r) => s + r[mode], 0), color: 'var(--muted)' });
    }
    return segs;
  }, [rows]);

  const assetTypeSegs = useMemo<DonutSeg[]>(() => {
    const acc = new Map<string, number>();
    for (const v of views) {
      const label = ASSET_META[v.holding.assetType].label;
      acc.set(label, (acc.get(label) ?? 0) + v.current.toNumber());
    }
    return [...acc.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: SERIES[i % SERIES.length] }));
  }, [views]);

  const sectorSegs = useMemo<DonutSeg[]>(() => {
    const rowsS = rollup(filtered, 'sector', classify);
    return rowsS.slice(0, 6).map((r, i) => ({
      label: r.label,
      value: r.current.toNumber(),
      color: r.key === UNCLASSIFIED_KEY ? 'var(--muted)' : SERIES[i % SERIES.length],
    }));
  }, [filtered, classify]);

  // ---- Diversification score ----------------------------------------------
  // Null below two holdings: a single position cannot be called diversified or
  // concentrated, and a number there would be an opinion, not a measurement.
  const totals = useMemo(() => investmentTotals(filtered), [filtered]);
  const conc = concentration(totals);
  const sectorCount = useMemo(
    () => rollup(filtered, 'sector', classify).filter((r) => r.key !== UNCLASSIFIED_KEY).length,
    [filtered, classify],
  );
  const divScore = filtered.length < 2 ? null : Math.round(Math.max(0, Math.min(100,
    (Math.min(groupsPresent.length, 5) / 5) * 30
    + (Math.min(sectorCount, 8) / 8) * 30
    + (1 - (conc ?? 1)) * 25
    + (1 - Math.min(rows.length ? Math.max(...rows.map((r) => r.weight)) / 100 : 1, 1)) * 15,
  )));
  const divLabel = divScore == null ? undefined
    : divScore >= 80 ? 'Excellent' : divScore >= 60 ? 'Good' : divScore >= 40 ? 'Fair' : 'Concentrated';

  const gainers = [...rows].filter((r) => r.pnlPct > 0).sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 5);
  const losers = [...rows].filter((r) => r.pnlPct < 0).sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 5);

  /** Top 8 by absolute contribution, so the column chart stays readable. */
  const pnlColumns = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8)
      .map((r) => ({ label: r.symbol.slice(0, 6), value: r.pnl })),
    [rows],
  );
  const dayColumns = useMemo(
    () => (demo ? [...rows].sort((a, b) => Math.abs(b.dayPnl ?? 0) - Math.abs(a.dayPnl ?? 0)).slice(0, 8)
      .map((r) => ({ label: r.symbol.slice(0, 6), value: r.dayPnl ?? 0 })) : []),
    [rows, demo],
  );

  const columns: Column<Row>[] = [
    {
      key: 'symbol', header: 'Symbol', locked: true, width: 190, value: (r) => r.symbol,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] shrink-0 rounded-[9px] grid place-items-center text-[11px] font-bold text-white"
            style={{ background: SERIES[r.symbol.charCodeAt(0) % SERIES.length] }}>
            {r.symbol.slice(0, 2)}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold truncate">{r.symbol}</span>
            <span className="block text-[11px] text-muted truncate">{r.company}</span>
          </span>
        </div>
      ),
    },
    { key: 'company', header: 'Company', optional: true, value: (r) => r.company, cell: (r) => <span className="text-ink-soft">{r.company}</span> },
    { key: 'exchange', header: 'Exchange', optional: true, value: (r) => r.exchange, cell: (r) => <Chip>{r.exchange}</Chip> },
    { key: 'sector', header: 'Sector', optional: true, value: (r) => r.sector, cell: (r) => <span className="text-ink-soft">{r.sector}</span> },
    { key: 'qty', header: 'Quantity', align: 'right', value: (r) => r.qty, cell: (r) => r.qty.toLocaleString('en-IN') },
    { key: 'avg', header: 'Avg. price', align: 'right', value: (r) => r.avg, cell: (r) => <span className="text-ink-soft">{fmt.money(r.avg)}</span> },
    { key: 'ltp', header: 'LTP', align: 'right', value: (r) => r.ltp, cell: (r) => fmt.money(r.ltp) },
    { key: 'current', header: 'Current value', align: 'right', value: (r) => r.current, cell: (r) => <span className="font-semibold">{mask(fmt.money(r.current))}</span> },
    { key: 'invested', header: 'Investment', align: 'right', value: (r) => r.invested, cell: (r) => <span className="text-ink-soft">{mask(fmt.money(r.invested))}</span> },
    {
      key: 'pnl', header: 'Overall P&L', align: 'right', value: (r) => r.pnl,
      cell: (r) => <span className={r.pnl >= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
        {r.pnl >= 0 ? '+' : '−'}{mask(fmt.money(Math.abs(r.pnl)))}
      </span>,
    },
    { key: 'pnlPct', header: 'Overall %', align: 'right', value: (r) => r.pnlPct, cell: (r) => <span className={r.pnlPct >= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>{fmtPct(r.pnlPct)}</span> },
    {
      key: 'dayPnl', header: 'Day P&L', align: 'right', value: (r) => r.dayPnl ?? 0,
      cell: (r) => r.dayPnl == null ? <span className="text-muted">—</span>
        : <span className={r.dayPnl >= 0 ? 'text-success' : 'text-danger'}>{r.dayPnl >= 0 ? '+' : '−'}{mask(fmt.money(Math.abs(r.dayPnl)))}</span>,
    },
    { key: 'dayPct', header: 'Day %', align: 'right', value: (r) => r.dayPct ?? 0, cell: (r) => <Delta value={r.dayPct} /> },
    {
      key: 'weight', header: 'Weight', align: 'right', value: (r) => r.weight,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 justify-end">
          <span className="text-[11.5px] text-ink-soft tnum">{r.weight.toFixed(2)}%</span>
          <span className="w-10 h-1.5 rounded-full bg-fill-strong overflow-hidden">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(r.weight * 5, 100)}%` }} />
          </span>
        </span>
      ),
    },
  ];

  if (holdings.length === 0) {
    return (
      <Stagger className="grid gap-6">
        <StaggerItem><PageIntro title="Portfolio Overview" subtitle="All your investments at a glance" /></StaggerItem>
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState
              icon={<TrendingUp size={22} />}
              title="No investments yet"
              hint="Add a holding, or load the sample portfolio from Settings to see the full overview."
              action={<Button><Link href="/settings">Open Settings</Link></Button>}
            />
          </GlassCard>
        </StaggerItem>
      </Stagger>
    );
  }

  const groupLabel = group === 'all' ? 'All Holdings' : ASSET_GROUP_META[group].label;

  return (
    <Stagger className="grid gap-6">
      {/* ---- Header + controls --------------------------------------------- */}
      <StaggerItem>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[var(--fs-h1)] leading-[1.15] font-bold tracking-[-0.03em] font-display">Portfolio Overview</h1>
            <p className="text-ink-soft text-sm mt-1.5">All your investments at a glance</p>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Asset-group filter — drives every panel on this page. */}
            <div className="relative">
              <button
                onClick={() => setGroupOpen((o) => !o)}
                className="focus-ring inline-flex items-center gap-2 h-9 px-3 rounded-btn border border-line bg-card text-[13px] font-semibold hover:border-line-strong transition-colors"
              >
                <Filter size={14} className="text-muted" />
                {groupLabel}
                <ChevronDown size={14} className="text-muted" />
              </button>
              {groupOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setGroupOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 z-50 card p-1.5 shadow-[var(--shadow-2)]">
                    <button
                      onClick={() => { setGroup('all'); setGroupOpen(false); }}
                      className={`w-full text-left px-2.5 py-2 rounded-[9px] text-[13px] transition-colors ${group === 'all' ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-fill'}`}
                    >
                      All Holdings <span className="text-muted font-normal">({holdings.length})</span>
                    </button>
                    {groupsPresent.map((g) => {
                      const n = holdings.filter((h) => ASSET_GROUP_OF[h.assetType] === g).length;
                      return (
                        <button
                          key={g}
                          onClick={() => { setGroup(g); setGroupOpen(false); }}
                          className={`w-full text-left px-2.5 py-2 rounded-[9px] text-[13px] flex items-center gap-2 transition-colors ${group === g ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-fill'}`}
                        >
                          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: ASSET_GROUP_META[g][dark ? 'dark' : 'light'] }} />
                          {ASSET_GROUP_META[g].label} <span className="ml-auto text-muted font-normal">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* As-on date — bounded by the recorded snapshot history. */}
            <label className="focus-ring inline-flex items-center gap-2 h-9 px-3 rounded-btn border border-line bg-card text-[13px] font-semibold hover:border-line-strong transition-colors cursor-pointer">
              <CalendarDays size={14} className="text-muted" />
              <span className="text-muted font-normal">As on</span>
              <input
                type="date"
                value={asOnValue}
                max={todayStr || undefined}
                onChange={(e) => setAsOn(e.target.value)}
                aria-label="Show figures as on"
                className="bg-transparent outline-none text-ink font-semibold w-[110px]"
              />
            </label>

            <Button><Link href="/holdings" className="flex items-center gap-2"><Plus size={16} />Add Investment</Link></Button>
          </div>
        </div>
      </StaggerItem>

      {(isPast || group !== 'all') && (
        <StaggerItem>
          <div className="card p-3.5 flex items-start gap-3 flex-wrap">
            <span className="w-7 h-7 shrink-0 rounded-[9px] grid place-items-center bg-accent-soft text-accent"><Info size={14} /></span>
            <p className="text-[12.5px] text-ink-soft leading-relaxed flex-1 min-w-[240px]">
              {group !== 'all' && <>Showing <b className="text-ink">{groupLabel}</b> only — {filtered.length} of {holdings.length} holdings. </>}
              {isPast && <>Net-worth history is cut at your chosen date. Position values are marked to the last recorded price, because holdings have no per-day price history.</>}
            </p>
            {(isPast || group !== 'all') && (
              <Button variant="ghost" onClick={() => { setGroup('all'); setAsOn(''); }}>Reset</Button>
            )}
          </div>
        </StaggerItem>
      )}

      {/* ---- Six KPI cards -------------------------------------------------- */}
      <StaggerItem>
        <KpiRow cols={6}>
          <Kpi label="Portfolio Value" icon={Wallet} tone="accent"
            value={ghost ? '••••' : undefined} numeric={ghost ? undefined : totalValue}
            format={(n) => short(n, fmt.symbol)}
            footer={<><span>Current value</span>{spark.length > 1 && <span className="ml-auto"><MiniSparkline values={spark} color="var(--accent)" /></span>}</>} />
          <Kpi label="Total Investment" icon={Coins} tone="warning"
            value={ghost ? '••••' : undefined} numeric={ghost ? undefined : summary.invested.toNumber()}
            format={(n) => short(n, fmt.symbol)} footer="Invested amount" />
          <Kpi label="Overall P&L" icon={Percent} tone={summary.pnl.gte(0) ? 'success' : 'danger'}
            value={ghost ? '••••' : undefined} numeric={ghost ? undefined : summary.pnl.toNumber()}
            format={(n) => (n >= 0 ? '+' : '−') + short(Math.abs(n), fmt.symbol)}
            footer={<><Delta value={summary.pnlPct} />{spark.length > 1 && <span className="ml-auto"><MiniSparkline values={spark} color={summary.pnl.gte(0) ? 'var(--success)' : 'var(--danger)'} /></span>}</>} />
          <Kpi label="Today's P&L" icon={TrendingUp} tone={(dayPnlTotal ?? 0) >= 0 ? 'success' : 'danger'}
            value={ghost ? '••••' : dayPnlTotal == null ? null : undefined}
            numeric={ghost || dayPnlTotal == null ? undefined : dayPnlTotal}
            format={(n) => (n >= 0 ? '+' : '−') + short(Math.abs(n), fmt.symbol)}
            footer={dayPctTotal == null ? undefined : <><Delta value={dayPctTotal} />{demo && <span className="ml-auto"><DemoBadge label="Demo" /></span>}</>} />
          <Kpi label="Holdings" icon={Layers} tone="violet" value={String(filtered.length)}
            footer={`${groupsPresent.length} asset group${groupsPresent.length === 1 ? '' : 's'}`} />
          <Kpi label="Total Quantity" icon={Hash} tone="accent" value={totalQty.toLocaleString('en-IN')} footer="Units held" />
        </KpiRow>
      </StaggerItem>

      {/* ---- Four allocation donuts ----------------------------------------- */}
      <div className="grid gap-5 min-w-0 grid-cols-[repeat(auto-fit,minmax(0,1fr))] min-[900px]:grid-cols-2 min-[1400px]:grid-cols-4">
        <StaggerItem>
          <Panel title="Portfolio Allocation" sub="by current value">
            <Donut segments={topSegs('current')} size={148} stroke={20}
              centerText={ghost ? '••••' : short(totalValue, fmt.symbol)} centerSub="Total" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel title="Investment Allocation" sub="by invested amount">
            <Donut segments={topSegs('invested')} size={148} stroke={20}
              centerText={ghost ? '••••' : short(summary.invested.toNumber(), fmt.symbol)} centerSub="Total" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel title="Asset Type Allocation" sub={`${assetTypeSegs.length} type${assetTypeSegs.length === 1 ? '' : 's'}`}>
            <Donut segments={assetTypeSegs} size={148} stroke={20}
              centerText={ghost ? '••••' : short(totalValue, fmt.symbol)} centerSub="Total" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel title="Profit vs Loss" sub="by position count">
            <Donut
              segments={[
                { label: `Profitable (${profitable})`, value: profitable, color: 'var(--success)' },
                { label: `Losing (${losing})`, value: losing, color: 'var(--danger)' },
                ...(rows.length - profitable - losing > 0
                  ? [{ label: `Flat (${rows.length - profitable - losing})`, value: rows.length - profitable - losing, color: 'var(--muted)' }]
                  : []),
              ]}
              size={148} stroke={20}
              centerText={String(rows.length)} centerSub="Positions"
            />
          </Panel>
        </StaggerItem>
      </div>

      {/* ---- Gainers / losers / P&L charts ---------------------------------- */}
      <div className="grid gap-5 min-w-0 grid-cols-[repeat(auto-fit,minmax(0,1fr))] min-[900px]:grid-cols-2 min-[1400px]:grid-cols-4">
        <StaggerItem>
          <Panel title="Top 5 Gainers" sub="overall return %" icon={<ArrowUpRight size={15} className="text-success" />}>
            <RankBars rows={gainers.map((r) => ({ key: r.id, label: r.symbol, sub: r.sector, value: r.pnlPct }))}
              color="var(--success)" formatValue={(n) => fmtPct(n)} emptyLabel="Nothing above cost" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel title="Top 5 Losers" sub="overall return %" icon={<ArrowDownRight size={15} className="text-danger" />}>
            <RankBars rows={losers.map((r) => ({ key: r.id, label: r.symbol, sub: r.sector, value: r.pnlPct }))}
              color="var(--danger)" formatValue={(n) => fmtPct(n)} emptyLabel="Nothing below cost" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel title="Overall P&L by Stock" sub="top 8 by contribution">
            <ColumnChart columns={pnlColumns} height={190} format={(n) => fmt.money(n)}
              ariaLabel="Unrealised profit and loss for the eight largest contributors" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel title="Today's P&L by Stock" sub="top 8 by movement" badge={demo ? <DemoBadge label="Demo" /> : undefined}>
            {demo && dayColumns.length > 0
              ? <ColumnChart columns={dayColumns} height={190} format={(n) => fmt.money(n)} ariaLabel="Today's profit and loss by stock" />
              : <p className="py-14 text-center text-[12.5px] text-muted">Day change needs a price feed. Turn demo market data on in Settings to preview it.</p>}
          </Panel>
        </StaggerItem>
      </div>

      {/* ---- Table + sector + score ----------------------------------------- */}
      <div className="grid gap-5 min-w-0 min-[1280px]:grid-cols-[minmax(0,3fr)_minmax(0,320px)] items-start">
        <StaggerItem>
          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Holdings Summary</h2>
                <p className="text-xs text-muted mt-0.5">{rows.length} of {holdings.length} positions</p>
              </div>
              <Link href="/holdings" className="ml-auto focus-ring text-[13px] font-semibold text-accent hover:underline">Full grid</Link>
            </div>
            <DataGrid
              rows={rows} columns={columns} rowKey={(r) => r.id}
              searchable={(r) => `${r.symbol} ${r.company} ${r.sector} ${r.exchange}`}
              searchPlaceholder={`Search ${rows.length} holdings…`}
              initialSort={{ key: 'current', dir: 'desc' }}
              pageSize={10}
              exportName="khazana-portfolio"
            />
          </section>
        </StaggerItem>

        <div className="grid gap-5 min-w-0">
          <StaggerItem>
            <Panel title="Sector Allocation" sub={sectorCount ? `${sectorCount} classified` : 'Not classified'}>
              <Donut segments={sectorSegs} size={140} stroke={19} legend />
            </Panel>
          </StaggerItem>
          <StaggerItem>
            <section className="card p-5 grid justify-items-center gap-3 text-center min-w-0 overflow-hidden">
              <h3 className="text-[18px] font-semibold tracking-[-0.02em] justify-self-start">Diversification Score</h3>
              <Gauge value={divScore} size={172} sublabel={divLabel} />
              <p className="text-[12.5px] text-muted leading-relaxed">
                {divScore == null
                  ? 'At least two holdings are needed before diversification can be judged.'
                  : `${groupsPresent.length} asset group${groupsPresent.length === 1 ? '' : 's'}, ${sectorCount} sector${sectorCount === 1 ? '' : 's'}, largest position ${rows.length ? Math.max(...rows.map((r) => r.weight)).toFixed(1) : '0'}%.`}
              </p>
            </section>
          </StaggerItem>
        </div>
      </div>
    </Stagger>
  );
}

/** A titled card with an optional right-hand badge. */
function Panel({
  title, sub, children, icon, badge,
}: { title: string; sub?: string; children: React.ReactNode; icon?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <section className="card lift h-full flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-line">
        {icon}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] truncate whitespace-nowrap">{title}</h3>
          {sub && <p className="text-[11.5px] text-muted mt-0.5 truncate">{sub}</p>}
        </div>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      <div className="p-5 flex-1 flex items-center min-w-0">{children}</div>
    </section>
  );
}
