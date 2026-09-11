'use client';
/**
 * Holdings — the data grid.
 *
 * Split out of `/investments`, which was a 1000-line screen doing both the
 * portfolio overview and the position table. This page owns the table; the
 * overview stayed at `/investments` (its route is one of the Flutter bottom-bar
 * tabs, so it could not be renamed).
 *
 * Day change is synthesised — the vault has no price feed — so it is behind the
 * demo switch and carries the badge. Everything else is computed from the
 * user's own records.
 */
import { useMemo, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Table2, Coins, TrendingUp, Landmark, Plus, Upload, Pencil } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { PageIntro, Button, Chip, Delta } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem, useReducedMotion } from '@/components/motion';
import { HoldingForm, ImportPanel } from '@/components/HoldingEditor';
import { AssetMark } from '@/components/primitives';
import type { Holding } from '@/lib/types';
import { portfolioSummary, ASSET_META, ASSET_GROUP_OF } from '@/domain/portfolio';
import type { AssetType } from '@/lib/types';
import { accrue } from '@/domain/fixedIncome';
import { classifyHolding, loadInstrumentMaster, EMPTY_MASTER, MARKET_CAP_LABEL, type InstrumentMaster } from '@/domain/instrumentMaster';
import { hasRealClose, rowDayPct } from '@/domain/dayChange';
import { priceAgeLabel } from '@/lib/quotes/freshness';
import { useNow } from '@/lib/useNow';
import { short } from '@/lib/format';

interface Row {
  id: string;
  /** Kept on the row so the toolbar can filter without re-reading the vault. */
  assetType: AssetType;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  cap: string;
  qty: number;
  avg: number;
  ltp: number;
  invested: number;
  current: number;
  pnl: number;
  pnlPct: number;
  dayPct: number | null;
  weight: number;
  assetLabel: string;
  colour: string;
  /** Set for interest-bearing holdings; null for everything priced by market. */
  income: { ratePct: string; accrued: number; maturesInDays: number | null; matured: boolean; nextPayout: number | null } | null;
  holding: Holding;
}

export default function HoldingsPage() {
  const holdings = useApp((s) => s.holdings);
  const fxRates = useApp((s) => s.fxRates);
  const fmt = useFmt();
  const [demo] = useDemoData();
  const now = useNow();
  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  const [panel, setPanel] = useState<'none' | 'add' | 'import'>('none');
  const [editing, setEditing] = useState<Holding | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => { void loadInstrumentMaster().then(setMaster); }, []);

  // The editor opens above the table, and the pencil that opens it is in a row
  // that may be a thousand pixels down. Without this the click reads as dead:
  // the form is there, just off the top of the screen.
  useEffect(() => {
    if (!editing && panel === 'none') return;
    editorRef.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [editing, panel, reduced]);

  const summary = useMemo(() => portfolioSummary(holdings, undefined, fxRates), [holdings, fxRates]);

  const totalValue = summary.current.toNumber();
  const views = summary.views;
  // One verdict for the whole grid, shared with /investments and the dashboard
  // KPI so the three screens can never disagree about the same column.
  const anyRealClose = useMemo(() => hasRealClose(holdings), [holdings]);
  const rows = useMemo<Row[]>(() => {
    const total = totalValue || 1;
    return views.map((v) => {
      const h = v.holding;
      const cls = classifyHolding(master, h);
      const group = ASSET_GROUP_OF[h.assetType];
      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name ?? cls?.sector ? (h.name ?? h.symbol) : h.symbol,
        exchange: h.exchange,
        sector: h.sector ?? cls?.sector ?? 'Unclassified',
        cap: h.marketCapBand ? MARKET_CAP_LABEL[h.marketCapBand] : cls?.cap ? MARKET_CAP_LABEL[cls.cap] : '—',
        qty: D(h.quantity).toNumber(),
        avg: D(h.avgCost).toNumber(),
        ltp: D(h.lastPrice ?? h.avgCost).toNumber(),
        invested: v.invested.toNumber(),
        current: v.current.toNumber(),
        pnl: v.pnl.toNumber(),
        pnlPct: v.pnlPct,
        dayPct: rowDayPct(h, anyRealClose, demo),
        weight: (v.current.toNumber() / total) * 100,
        assetType: h.assetType,
        assetLabel: ASSET_META[h.assetType].label,
        income: (() => {
          const a = accrue(h);
          return a
            ? {
                ratePct: h.couponRatePct ?? '',
                accrued: a.accrued.toNumber(),
                maturesInDays: a.daysToMaturity,
                matured: a.matured,
                nextPayout: a.nextPayout,
              }
            : null;
        })(),
        colour: `var(--c${(Object.keys(ASSET_META).indexOf(h.assetType) % 8) + 1})`,
        holding: h,
        // group is used only for the tint above; keep the reference honest.
        ...(group ? {} : {}),
      };
    });
  }, [views, totalValue, master, demo, anyRealClose]);

  const unpriced = holdings.filter((h) => h.lastPrice == null).length;

  /**
   * Asset-type filter for the full book.
   *
   * Only types actually held are offered — a fixed list of all thirteen would
   * mostly be dead options, and picking one that matches nothing looks like a
   * broken grid rather than an empty category.
   */
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all');
  const typesPresent = useMemo(() => {
    const counts = new Map<AssetType, number>();
    for (const h of holdings) counts.set(h.assetType, (counts.get(h.assetType) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [holdings]);
  const visibleRows = useMemo(
    () => (typeFilter === 'all' ? rows : rows.filter((r) => r.assetType === typeFilter)),
    [rows, typeFilter],
  );
  const columns: Column<Row>[] = [
    {
      key: 'company', header: 'Company', locked: true, width: 210,
      value: (r) => r.name,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <AssetMark colour={r.colour} title={r.assetLabel} />
          <span className="min-w-0">
            <span className="block font-semibold tracking-[-0.01em] truncate">{r.name}</span>
            <span className="block text-[11px] text-muted">{r.symbol}</span>
          </span>
        </div>
      ),
    },
    { key: 'exchange', header: 'Exchange', optional: true, value: (r) => r.exchange, cell: (r) => <Chip>{r.exchange}</Chip> },
    { key: 'sector', header: 'Sector', value: (r) => r.sector, cell: (r) => <span className="text-ink-soft">{r.sector}</span> },
    { key: 'asset', header: 'Asset type', optional: true, value: (r) => r.assetLabel, cell: (r) => <span className="text-ink-soft">{r.assetLabel}</span> },
    { key: 'cap', header: 'Market cap', term: 'marketCap', optional: true, value: (r) => r.cap, cell: (r) => <span className="text-ink-soft">{r.cap}</span> },
    { key: 'qty', header: 'Qty', align: 'right', value: (r) => r.qty, cell: (r) => r.qty.toLocaleString('en-IN') },
    { key: 'avg', header: 'Avg price', align: 'right', optional: true, value: (r) => r.avg, cell: (r) => <span className="text-ink-soft">{fmt.money(r.avg)}</span> },
    {
      key: 'ltp', header: 'Price / Rate', align: 'right', value: (r) => r.ltp,
      // An FD has no quote; printing its cost as a "price" implies a market
      // value it does not have. Its rate is the number that matters.
      cell: (r) => (r.income
        ? <span className="text-ink-soft tnum">{r.income.ratePct}% p.a.</span>
        : fmt.money(r.ltp)),
    },
    {
      key: 'accrued', header: 'Interest earned', align: 'right', optional: true,
      value: (r) => r.income?.accrued ?? 0,
      cell: (r) => (r.income
        ? <span className="tnum text-success">{fmt.money(r.income.accrued)}</span>
        : <span className="text-muted">—</span>),
    },
    {
      key: 'matures', header: 'Matures', align: 'right', optional: true,
      value: (r) => r.income?.maturesInDays ?? Number.MAX_SAFE_INTEGER,
      cell: (r) => {
        if (!r.income) return <span className="text-muted">—</span>;
        if (r.income.matured) return <Chip tone="warning">Matured</Chip>;
        if (r.income.maturesInDays == null) return <span className="text-muted">—</span>;
        const y = Math.floor(r.income.maturesInDays / 365);
        const m = Math.floor((r.income.maturesInDays % 365) / 30);
        return <span className="text-ink-soft tnum">{y > 0 ? `${y}y ` : ''}{m}m</span>;
      },
    },
    { key: 'current', header: 'Value', align: 'right', value: (r) => r.current, cell: (r) => <span className="font-semibold">{fmt.money(r.current)}</span> },
    { key: 'invested', header: 'Invested', align: 'right', optional: true, value: (r) => r.invested, cell: (r) => <span className="text-ink-soft">{fmt.money(r.invested)}</span> },
    {
      key: 'day', header: 'Day', align: 'right',
      value: (r) => r.dayPct ?? 0,
      cell: (r) => <Delta value={r.dayPct} />,
    },
    {
      key: 'ret', header: 'Return', align: 'right',
      value: (r) => r.pnlPct,
      cell: (r) => (
        <span>
          <span className={r.pnl >= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
            {r.pnlPct >= 0 ? '+' : '−'}{Math.abs(r.pnlPct).toFixed(2)}%
          </span>
          <span className="block text-[11px] text-muted">{r.pnl >= 0 ? '+' : '−'}{fmt.money(Math.abs(r.pnl))}</span>
        </span>
      ),
    },
    {
      key: 'actions', header: '', align: 'right',
      cell: (r) => (
        <button
          onClick={() => { setEditing(r.holding); setPanel('none'); }}
          aria-label={`Edit ${r.symbol}`}
          className="focus-ring p-1.5 rounded-[var(--radius-btn)] text-muted hover:text-accent hover:bg-accent-soft transition-colors"
        >
          <Pencil size={15} />
        </button>
      ),
    },
    {
      key: 'weight', header: 'Weight', term: 'weight', align: 'right',
      value: (r) => r.weight,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 justify-end">
          <span className="text-[11.5px] text-ink-soft">{r.weight.toFixed(1)}%</span>
          <span className="w-11 h-1.5 rounded-full bg-fill-strong overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(r.weight * 5.5, 100)}%`, background: r.colour }} />
          </span>
        </span>
      ),
    },
  ];

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Holdings"
          subtitle={`${holdings.length} position${holdings.length === 1 ? '' : 's'} · ${fmt.money(summary.current)} market value`}
          action={<>
            <Button variant="soft" onClick={() => { setEditing(null); setPanel(panel === 'import' ? 'none' : 'import'); }}>
              <Upload size={16} />Import CSV
            </Button>
            <Button onClick={() => { setEditing(null); setPanel(panel === 'add' ? 'none' : 'add'); }}>
              <Plus size={16} />Add holding
            </Button>
          </>}
        />
      </StaggerItem>

      {(editing || panel !== 'none') && (
        <div ref={editorRef} className="grid gap-6 min-w-0 scroll-mt-24">
          {editing && (
            <StaggerItem>
              {/* Keyed on the position: the form seeds its fields once, on
                  mount, so without this switching rows would reuse the mounted
                  instance and keep showing the holding clicked first. */}
              <HoldingForm key={editing.id} editing={editing} onDone={() => setEditing(null)} />
            </StaggerItem>
          )}
          {panel === 'add' && !editing && (
            <StaggerItem><HoldingForm onDone={() => setPanel('none')} /></StaggerItem>
          )}
          {panel === 'import' && !editing && (
            <StaggerItem><ImportPanel onDone={() => setPanel('none')} /></StaggerItem>
          )}
        </div>
      )}

      <StaggerItem>
        <KpiRow cols={4}>
          <Kpi label="Market value" term="investments" numeric={summary.current.toNumber()} format={short} icon={Table2} tone="accent" footer={fmt.money(summary.current)} />
          <Kpi label="Invested" term="invested" numeric={summary.invested.toNumber()} format={short} icon={Coins} tone="warning" footer={`Cost basis · ${fmt.money(summary.invested)}`} />
          <Kpi
            label="Unrealised P&L" term="unrealisedPnl" numeric={summary.pnl.toNumber()} format={(n) => (n >= 0 ? '+' : '−') + short(Math.abs(n))}
            icon={TrendingUp} tone={summary.pnl.gte(0) ? 'success' : 'danger'}
            footer={<><Delta value={summary.pnlPct} /> all time</>}
          />
          <Kpi
            label="Priced positions" value={`${holdings.length - unpriced} of ${holdings.length}`}
            icon={Landmark} tone={unpriced ? 'warning' : 'success'}
            // The age, not just the count. "All marked to a price" said nothing
            // about *when*, so a book last repriced by a CSV import a week ago
            // read as one whose figures were simply wrong.
            footer={unpriced
              ? `${unpriced} valued at cost`
              // `useNow` is 0 until after mount, and a 0 "now" would date every
              // price to the future and read as "just now".
              : (now ? priceAgeLabel(holdings, now) : null) ?? 'All marked to a price'}
          />
        </KpiRow>
      </StaggerItem>

      <StaggerItem>
        <section className="card overflow-hidden">
          <div className="flex items-center gap-3 px-4 min-[900px]:px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">All positions</h2>
              <p className="text-xs text-muted mt-0.5">Sort, filter and export the full book</p>
            </div>
            {demo && !anyRealClose && <span className="ml-auto"><DemoBadge label="Day change" title="Day change is synthesised on this device. Turn on live prices in Settings to measure it against a real previous close." /></span>}
          </div>
          <DataGrid
            rows={visibleRows}
            columns={columns}
            rowKey={(r) => r.id}
            searchable={(r) => `${r.name} ${r.symbol} ${r.sector} ${r.exchange} ${r.assetLabel}`}
            searchPlaceholder={`Search ${visibleRows.length} holdings…`}
            toolbarExtra={
              typesPresent.length > 1 ? (
                <label className="flex items-center gap-2 shrink-0">
                  <span className="sr-only">Filter by asset type</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as AssetType | 'all')}
                    // Matches the toolbar's search box exactly (h-9, same
                    // radius and surface) so the two controls sit on one line.
                    className="h-9 rounded-input border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink outline-none cursor-pointer focus:border-[var(--accent)]"
                  >
                    <option value="all">All types ({rows.length})</option>
                    {typesPresent.map(([t, n]) => (
                      <option key={t} value={t}>{ASSET_META[t].label} ({n})</option>
                    ))}
                  </select>
                </label>
              ) : undefined
            }
            initialSort={{ key: 'current', dir: 'desc' }}
            exportName="khazana-holdings"
            empty={
              <div className="text-center px-6">
                <p className="font-semibold text-[15px]">No holdings yet</p>
                <p className="text-[13px] text-muted mt-2">Add a position by hand, or import a CSV exported from your broker.</p>
                <div className="mt-5 flex gap-2 justify-center">
                  <Button onClick={() => setPanel('add')}><Plus size={16} />Add holding</Button>
                  <Button variant="soft" onClick={() => setPanel('import')}><Upload size={16} />Import CSV</Button>
                </div>
              </div>
            }
          />
        </section>
      </StaggerItem>
    </Stagger>
  );
}
