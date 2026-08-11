'use client';
/**
 * Watchlist — instruments tracked but not owned.
 *
 * These are real, user-owned records (`STORE.watchItem`), stored in the vault
 * like everything else. Prices are entered by hand; the day change beside them
 * is synthesised and badged.
 */
import { useMemo, useState } from 'react';
import { Star, TrendingUp, TrendingDown, Target, Plus, Trash2 } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { STORE, type WatchItem } from '@/lib/types';
import { PageIntro, Button, Chip, Delta, Field, Input, EmptyState, GlassCard } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem } from '@/components/motion';
import { useConfirm } from '@/components/Confirm';
import { demoDayChangePct } from '@/lib/demo/marketFeed';
import { NumberInput } from '@/components/NumberInput';
import { AssetMark } from '@/components/primitives';

export default function WatchlistPage() {
  const watchlist = useApp((s) => s.watchlist);
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const fmt = useFmt();
  const confirm = useConfirm();
  const [demo] = useDemoData();
  const [form, setForm] = useState(false);
  const [draft, setDraft] = useState({ symbol: '', name: '', exchange: 'NSE', lastPrice: '', targetPrice: '' });

  const rows = useMemo(() => watchlist.map((w) => {
    const price = w.lastPrice ? D(w.lastPrice).toNumber() : null;
    const target = w.targetPrice ? D(w.targetPrice).toNumber() : null;
    return {
      ...w,
      price,
      target,
      dayPct: demo ? demoDayChangePct(w.symbol) : null,
      gapPct: price && target ? ((target - price) / price) * 100 : null,
    };
  }), [watchlist, demo]);

  const up = rows.filter((r) => (r.dayPct ?? 0) > 0).length;
  const down = rows.filter((r) => (r.dayPct ?? 0) < 0).length;
  const near = rows.filter((r) => r.gapPct != null && Math.abs(r.gapPct) < 6).length;

  const save = async () => {
    if (!draft.symbol.trim()) return;
    await put(STORE.watchItem, {
      id: uid(),
      symbol: draft.symbol.trim().toUpperCase(),
      name: draft.name.trim() || null,
      exchange: draft.exchange,
      lastPrice: draft.lastPrice || null,
      targetPrice: draft.targetPrice || null,
      addedAt: Date.now(),
    } as unknown as WatchItem & { id: string } & Record<string, unknown>);
    setDraft({ symbol: '', name: '', exchange: 'NSE', lastPrice: '', targetPrice: '' });
    setForm(false);
  };

  const remove = async (w: { id: string; symbol: string }) => {
    if (await confirm({ title: `Remove ${w.symbol}?`, message: 'It comes off your watchlist. Nothing else changes.', confirmLabel: 'Remove', danger: true })) {
      await del(STORE.watchItem, w.id);
    }
  };

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: 'instrument', header: 'Instrument', locked: true, width: 200, value: (r) => r.name ?? r.symbol,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <AssetMark colour="var(--c1)" />
          <span className="min-w-0">
            <span className="block font-semibold truncate">{r.name ?? r.symbol}</span>
            <span className="block text-[11px] text-muted">{r.symbol} · {r.exchange}</span>
          </span>
        </div>
      ),
    },
    { key: 'price', header: 'Price', align: 'right', value: (r) => r.price ?? 0, cell: (r) => r.price != null ? <span className="font-semibold">{fmt.money(r.price)}</span> : <span className="text-muted">—</span> },
    { key: 'day', header: 'Day', align: 'right', value: (r) => r.dayPct ?? 0, cell: (r) => <Delta value={r.dayPct} /> },
    { key: 'target', header: 'Target', align: 'right', value: (r) => r.target ?? 0, cell: (r) => r.target != null ? <span className="text-ink-soft">{fmt.money(r.target)}</span> : <span className="text-muted">—</span> },
    {
      key: 'gap', header: 'To target', align: 'right', value: (r) => r.gapPct ?? 0,
      cell: (r) => r.gapPct == null ? <span className="text-muted">—</span>
        : <Chip tone={Math.abs(r.gapPct) < 6 ? 'warning' : 'neutral'}>{r.gapPct >= 0 ? '+' : '−'}{Math.abs(r.gapPct).toFixed(1)}%</Chip>,
    },
    {
      key: 'actions', header: '', align: 'right',
      cell: (r) => (
        <button onClick={() => void remove(r)} aria-label={`Remove ${r.symbol}`} className="focus-ring p-1.5 rounded-[var(--radius-btn)] text-muted hover:text-danger hover:bg-danger-soft transition-colors">
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Watchlist"
          subtitle={watchlist.length ? `${watchlist.length} instrument${watchlist.length === 1 ? '' : 's'} you are tracking but do not own` : 'Track instruments before you buy them'}
          action={<>{demo && <DemoBadge label="Day change" />}<Button onClick={() => setForm((f) => !f)}><Plus size={16} />Add symbol</Button></>}
        />
      </StaggerItem>

      {form && (
        <StaggerItem>
          <GlassCard>
            <div className="grid gap-4 md:grid-cols-5">
              <Field label="Symbol"><Input value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} placeholder="DMART" /></Field>
              <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Avenue Supermarts" /></Field>
              <Field label="Exchange"><Input value={draft.exchange} onChange={(e) => setDraft({ ...draft, exchange: e.target.value })} /></Field>
              <Field label="Price"><NumberInput value={draft.lastPrice} onChange={(v) => setDraft({ ...draft, lastPrice: v })} placeholder="4218.60" /></Field>
              <Field label="Target price"><NumberInput value={draft.targetPrice} onChange={(v) => setDraft({ ...draft, targetPrice: v })} placeholder="4600" /></Field>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void save()}>Add to watchlist</Button>
              <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
            </div>
          </GlassCard>
        </StaggerItem>
      )}

      {watchlist.length === 0 ? (
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState
              icon={<Star size={22} />}
              title="Nothing on the watchlist yet"
              hint="Add a symbol with a target price, and you will see how far it has to move to reach it."
              action={<Button onClick={() => setForm(true)}><Plus size={16} />Add symbol</Button>}
            />
          </GlassCard>
        </StaggerItem>
      ) : (
        <>
          <StaggerItem>
            <KpiRow cols={4}>
              <Kpi label="Tracked" value={String(watchlist.length)} icon={Star} tone="accent" footer="Not owned" />
              <Kpi label="Up today" value={demo ? String(up) : null} icon={TrendingUp} tone="success" footer={demo ? 'Since previous close' : undefined} />
              <Kpi label="Down today" value={demo ? String(down) : null} icon={TrendingDown} tone="danger" footer={demo ? 'Since previous close' : undefined} />
              <Kpi label="Near target" value={String(near)} icon={Target} tone="warning" footer="Within 6% of your price" />
            </KpiRow>
          </StaggerItem>
          <StaggerItem>
            <section className="card overflow-hidden">
              <DataGrid
                rows={rows} columns={columns} rowKey={(r) => r.id}
                searchable={(r) => `${r.symbol} ${r.name ?? ''} ${r.exchange}`}
                searchPlaceholder="Search watchlist…"
                initialSort={{ key: 'instrument', dir: 'asc' }}
                exportName="khazana-watchlist"
              />
            </section>
          </StaggerItem>
        </>
      )}
    </Stagger>
  );
}
