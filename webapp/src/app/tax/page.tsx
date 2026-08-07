'use client';
/**
 * Tax Center — unrealised capital gains, split short vs long term.
 *
 * Every figure comes from `domain/tax.ts` (India FY25 rules) applied to the
 * user's own holdings. Nothing here is synthesised.
 *
 * Two honesty constraints the UI must keep:
 *   - This is an ESTIMATE of tax if the position were sold today. It is not a
 *     filing, and the page says so.
 *   - A holding with no `firstPurchaseDate` has no holding period, so its gain
 *     type is unknown. Those are counted separately rather than defaulted to
 *     short term, which would overstate the bill.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { Landmark, Clock, TrendingUp, CircleHelp } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D, ZERO } from '@/lib/money';
import { PageIntro, Chip, EmptyState, GlassCard, Button } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { DataGrid, type Column } from '@/components/DataGrid';
import { Stagger, StaggerItem } from '@/components/motion';
import { holdingView, ASSET_META } from '@/domain/portfolio';
import { computeGain, TAX_RULES } from '@/domain/tax';
import { short } from '@/lib/format';

interface TaxRow {
  id: string;
  symbol: string;
  assetLabel: string;
  gain: number;
  gainType: 'short_term' | 'long_term' | null;
  rateLabel: string;
  tax: number;
  heldDays: number | null;
}

export default function TaxPage() {
  const holdings = useApp((s) => s.holdings);
  const fmt = useFmt();
  const now = new Date();

  const rows = useMemo<TaxRow[]>(() => holdings.map((h) => {
    const v = holdingView(h);
    const asset = ASSET_META[h.assetType];
    if (h.firstPurchaseDate == null || h.firstPurchaseDate <= 0) {
      // No purchase date means no holding period — the gain type is genuinely
      // unknown, and guessing would put a number on the wrong side of the
      // long-term threshold.
      return {
        id: h.id, symbol: h.symbol, assetLabel: asset.label,
        gain: v.pnl.toNumber(), gainType: null, rateLabel: 'Purchase date missing', tax: 0, heldDays: null,
      };
    }
    const bought = new Date(h.firstPurchaseDate);
    const g = computeGain(h.assetType, bought, now, v.invested, v.current);
    return {
      id: h.id, symbol: h.symbol, assetLabel: asset.label,
      gain: g.gain.toNumber(),
      gainType: g.gainType,
      rateLabel: g.rateLabel,
      tax: g.estimatedTax.toNumber(),
      heldDays: Math.floor((now.getTime() - h.firstPurchaseDate) / 86400_000),
    };
  }), [holdings, now]);

  const priced = rows.filter((r) => r.gainType != null);
  const unknown = rows.filter((r) => r.gainType == null);
  const ltcg = priced.filter((r) => r.gainType === 'long_term');
  const stcg = priced.filter((r) => r.gainType === 'short_term');
  const sum = (xs: TaxRow[], k: 'gain' | 'tax') => xs.reduce((s, x) => s + x[k], 0);

  const columns: Column<TaxRow>[] = [
    { key: 'symbol', header: 'Holding', locked: true, value: (r) => r.symbol, cell: (r) => <span className="font-semibold">{r.symbol}</span> },
    { key: 'asset', header: 'Asset type', value: (r) => r.assetLabel, cell: (r) => <span className="text-ink-soft">{r.assetLabel}</span> },
    {
      key: 'held', header: 'Held', align: 'right', value: (r) => r.heldDays ?? -1,
      cell: (r) => r.heldDays == null ? <span className="text-muted">—</span> : <span className="text-ink-soft">{Math.floor(r.heldDays / 30)} mo</span>,
    },
    {
      key: 'type', header: 'Gain type', value: (r) => r.gainType ?? 'unknown',
      cell: (r) => r.gainType == null
        ? <Chip tone="warning">Unknown</Chip>
        : <Chip tone={r.gainType === 'long_term' ? 'success' : 'accent'}>{r.gainType === 'long_term' ? 'Long term' : 'Short term'}</Chip>,
    },
    {
      key: 'gain', header: 'Unrealised gain', align: 'right', value: (r) => r.gain,
      cell: (r) => <span className={r.gain >= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>{r.gain >= 0 ? '+' : '−'}{fmt.money(Math.abs(r.gain))}</span>,
    },
    { key: 'rate', header: 'Rate', align: 'right', optional: true, value: (r) => r.rateLabel, cell: (r) => <span className="text-ink-soft text-[12px]">{r.rateLabel}</span> },
    {
      key: 'tax', header: 'Est. tax', align: 'right', value: (r) => r.tax,
      cell: (r) => r.gainType == null ? <span className="text-muted">—</span> : <span className="font-semibold">{fmt.money(r.tax)}</span>,
    },
  ];

  if (holdings.length === 0) {
    return (
      <Stagger className="grid gap-6">
        <StaggerItem><PageIntro title="Tax Center" subtitle="Estimated capital gains if you sold today" /></StaggerItem>
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState icon={<Landmark size={22} />} title="No holdings to assess"
              hint="Add a position with its purchase date and this page will estimate the short- and long-term capital gains on it."
              action={<Button><Link href="/investments">Go to Portfolio</Link></Button>} />
          </GlassCard>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro title="Tax Center" subtitle="Estimated capital gains if every position were sold today · India FY25 rules" />
      </StaggerItem>

      <StaggerItem>
        <KpiRow cols={4}>
          <Kpi label="Est. total tax" numeric={sum(priced, 'tax')} format={short} icon={Landmark} tone="danger" footer={`Across ${priced.length} position${priced.length === 1 ? '' : 's'}`} />
          <Kpi label="Long-term gain" numeric={sum(ltcg, 'gain')} format={short} icon={Clock} tone="success" footer={`${ltcg.length} holding${ltcg.length === 1 ? '' : 's'} · est. ${fmt.money(sum(ltcg, 'tax'))}`} />
          <Kpi label="Short-term gain" numeric={sum(stcg, 'gain')} format={short} icon={TrendingUp} tone="warning" footer={`${stcg.length} holding${stcg.length === 1 ? '' : 's'} · est. ${fmt.money(sum(stcg, 'tax'))}`} />
          <Kpi label="Unclassified" value={unknown.length ? String(unknown.length) : null} icon={CircleHelp} tone="violet" footer={unknown.length ? 'Missing a purchase date' : undefined} />
        </KpiRow>
      </StaggerItem>

      {unknown.length > 0 && (
        <StaggerItem>
          <div className="card p-4 flex items-start gap-3 border-[color-mix(in_srgb,var(--warning)_30%,transparent)]">
            <span className="w-8 h-8 shrink-0 rounded-[10px] grid place-items-center bg-warning-soft text-warning"><CircleHelp size={16} /></span>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              <b className="text-ink font-semibold">{unknown.length} holding{unknown.length === 1 ? ' has' : 's have'} no purchase date.</b>{' '}
              Without one there is no holding period, so the gain cannot be classified as short or long term. Those positions are excluded from the totals above rather than assumed.
            </p>
          </div>
        </StaggerItem>
      )}

      <StaggerItem>
        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Position by position</h2>
            <p className="text-xs text-muted mt-0.5">Unrealised — nothing has been sold</p>
          </div>
          <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id}
            searchable={(r) => `${r.symbol} ${r.assetLabel}`} searchPlaceholder="Search holdings…"
            initialSort={{ key: 'tax', dir: 'desc' }} exportName="khazana-capital-gains" />
          <p className="px-5 py-3 text-[11px] text-muted border-t border-line bg-fill">
            Estimates only, using {Object.keys(TAX_RULES).length} asset-type rules for India FY25. Surcharge, cess, set-offs and carried-forward losses are not modelled. This is not tax advice.
          </p>
        </section>
      </StaggerItem>
    </Stagger>
  );
}
