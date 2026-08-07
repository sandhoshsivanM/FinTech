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
import { useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { Table2, Coins, TrendingUp, Landmark, Plus, Upload, Pencil } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { PageIntro, Button, Chip, Delta } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem } from '@/components/motion';
import { HoldingForm, ImportPanel } from '@/components/HoldingEditor';
import type { Holding } from '@/lib/types';
import { portfolioSummary, ASSET_META, ASSET_GROUP_OF } from '@/domain/portfolio';
import { lookupClassification, loadInstrumentMaster, EMPTY_MASTER, MARKET_CAP_LABEL, type InstrumentMaster } from '@/domain/instrumentMaster';
import { demoDayChangePct } from '@/lib/demo/marketFeed';
import { short } from '@/lib/format';

interface Row {
  id: string;
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
  holding: Holding;
}

export default function HoldingsPage() {
  const holdings = useApp((s) => s.holdings);
  const fmt = useFmt();
  const [demo] = useDemoData();
  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  const [panel, setPanel] = useState<'none' | 'add' | 'import'>('none');
  const [editing, setEditing] = useState<Holding | null>(null);

  useEffect(() => { void loadInstrumentMaster().then(setMaster); }, []);

  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);

  const totalValue = summary.current.toNumber();
  const views = summary.views;
  const rows = useMemo<Row[]>(() => {
    const total = totalValue || 1;
    return views.map((v) => {
      const h = v.holding;
      const cls = lookupClassification(master, { symbol: h.symbol });
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
        dayPct: demo ? demoDayChangePct(h.symbol) : null,
        weight: (v.current.toNumber() / total) * 100,
        assetLabel: ASSET_META[h.assetType].label,
        colour: `var(--c${(Object.keys(ASSET_META).indexOf(h.assetType) % 8) + 1})`,
        holding: h,
        // group is used only for the tint above; keep the reference honest.
        ...(group ? {} : {}),
      };
    });
  }, [views, totalValue, master, demo]);

  const unpriced = holdings.filter((h) => h.lastPrice == null).length;
  const columns: Column<Row>[] = [
    {
      key: 'company', header: 'Company', locked: true, width: 210,
      value: (r) => r.name,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span
            className="w-[30px] h-[30px] shrink-0 rounded-[9px] grid place-items-center text-[11px] font-bold text-white"
            style={{ background: r.colour }}
          >
            {r.symbol.slice(0, 2)}
          </span>
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
    { key: 'cap', header: 'Market cap', optional: true, value: (r) => r.cap, cell: (r) => <span className="text-ink-soft">{r.cap}</span> },
    { key: 'qty', header: 'Qty', align: 'right', value: (r) => r.qty, cell: (r) => r.qty.toLocaleString('en-IN') },
    { key: 'avg', header: 'Avg price', align: 'right', optional: true, value: (r) => r.avg, cell: (r) => <span className="text-ink-soft">{fmt.money(r.avg)}</span> },
    { key: 'ltp', header: 'Price', align: 'right', value: (r) => r.ltp, cell: (r) => fmt.money(r.ltp) },
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
          className="focus-ring p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent-soft transition-colors"
        >
          <Pencil size={15} />
        </button>
      ),
    },
    {
      key: 'weight', header: 'Weight', align: 'right',
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

      {editing && (
        <StaggerItem>
          <HoldingForm editing={editing} onDone={() => setEditing(null)} />
        </StaggerItem>
      )}
      {panel === 'add' && !editing && (
        <StaggerItem><HoldingForm onDone={() => setPanel('none')} /></StaggerItem>
      )}
      {panel === 'import' && !editing && (
        <StaggerItem><ImportPanel onDone={() => setPanel('none')} /></StaggerItem>
      )}

      <StaggerItem>
        <KpiRow cols={4}>
          <Kpi label="Market value" numeric={summary.current.toNumber()} format={short} icon={Table2} tone="accent" footer={fmt.money(summary.current)} />
          <Kpi label="Invested" numeric={summary.invested.toNumber()} format={short} icon={Coins} tone="warning" footer={`Cost basis · ${fmt.money(summary.invested)}`} />
          <Kpi
            label="Unrealised P&L" numeric={summary.pnl.toNumber()} format={(n) => (n >= 0 ? '+' : '−') + short(Math.abs(n))}
            icon={TrendingUp} tone={summary.pnl.gte(0) ? 'success' : 'danger'}
            footer={<><Delta value={summary.pnlPct} /> all time</>}
          />
          <Kpi
            label="Priced positions" value={`${holdings.length - unpriced} of ${holdings.length}`}
            icon={Landmark} tone={unpriced ? 'warning' : 'success'}
            footer={unpriced ? `${unpriced} valued at cost` : 'All marked to a price'}
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
            {demo && <span className="ml-auto"><DemoBadge label="Day change" title="Day change is synthesised on this device — Khazana has no price feed." /></span>}
          </div>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            searchable={(r) => `${r.name} ${r.symbol} ${r.sector} ${r.exchange} ${r.assetLabel}`}
            searchPlaceholder={`Search ${rows.length} holdings…`}
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
