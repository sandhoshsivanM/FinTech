'use client';
/**
 * Markets — index levels and the day's movers across what you follow.
 *
 * Levels and day changes are synthesised (see `lib/demo/marketFeed.ts`); the
 * session state beside them is not — it is derived from the clock in
 * `lib/marketClock.ts` and is accurate to the session window.
 */
import { useMemo } from 'react';
import { CandlestickChart, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { PageIntro, GlassCard, EmptyState, Delta } from '@/components/ui';
import { Kpi, KpiRow } from '@/components/Kpi';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem } from '@/components/motion';
import { LineChart } from '@/components/charts/LineChart';
import { AssetMark } from '@/components/primitives';
import { demoIndices, demoDayChangePct, demoSeries, rangeLabels } from '@/lib/demo/marketFeed';
import { marketState } from '@/lib/marketClock';
import { pct } from '@/lib/format';

export default function MarketsPage() {
  const holdings = useApp((s) => s.holdings);
  const watchlist = useApp((s) => s.watchlist);
  const fmt = useFmt();
  const [demo] = useDemoData();
  const session = marketState();

  const universe = useMemo(() => {
    // A held position with no price falls back to its average cost, which is
    // disclosed wherever the total is shown. A watchlist item has no cost to
    // fall back to, so its price stays null and renders as "no price" — it used
    // to render as ₹0, the one place a missing price silently became zero (§7.1).
    const held = holdings.map((h) => ({ symbol: h.symbol, name: h.name ?? h.symbol, price: D(h.lastPrice ?? h.avgCost).toNumber(), unpriced: !h.lastPrice, owned: true }));
    const watched = watchlist.map((w) => ({ symbol: w.symbol, name: w.name ?? w.symbol, price: w.lastPrice ? D(w.lastPrice).toNumber() : null, unpriced: !w.lastPrice, owned: false }));
    return [...held, ...watched].map((x) => ({ ...x, dayPct: demoDayChangePct(x.symbol) }));
  }, [holdings, watchlist]);

  const movers = useMemo(() => [...universe].sort((a, b) => b.dayPct - a.dayPct), [universe]);
  const indices = useMemo(() => (demo ? demoIndices() : []), [demo]);
  const nifty = indices[0];
  const niftySeries = useMemo(() => (nifty ? demoSeries('NIFTY50', '1M', nifty.level) : []), [nifty]);

  if (!demo) {
    return (
      <Stagger className="grid gap-6">
        <StaggerItem><PageIntro title="Markets" subtitle="Index levels and the day's movers" /></StaggerItem>
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState icon={<CandlestickChart size={22} />} title="Demo market data is switched off"
              hint="Khazana never contacts a market data provider. With demo data off there are no quotes to show. Turn it back on in Settings → Privacy." />
          </GlassCard>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro title="Markets" subtitle="Index levels and the day's movers across what you hold and watch"
          action={<DemoBadge label="Demo quotes" />} />
      </StaggerItem>

      <StaggerItem>
        <KpiRow cols={5}>
          <Kpi label="Session" value={session.label} icon={Clock} tone={session.phase === 'open' ? 'success' : 'accent'}
            footer={`${session.clock} IST${session.minutesToChange != null ? ` · ${session.minutesToChange} min left` : ''}`} />
          {indices.slice(0, 4).map((i) => (
            <Kpi key={i.symbol} label={i.name}
              value={i.level.toLocaleString('en-IN', { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits })}
              icon={i.changePct >= 0 ? TrendingUp : TrendingDown}
              tone={i.changePct >= 0 ? 'success' : 'danger'}
              footer={<><Delta value={i.changePct} /> today</>} />
          ))}
        </KpiRow>
      </StaggerItem>

      {nifty && niftySeries.length > 1 && (
        <StaggerItem>
          <section className="card">
            <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">NIFTY 50</h2>
                <p className="text-xs text-muted mt-0.5">One month</p>
              </div>
              <span className="ml-auto"><DemoBadge /></span>
            </div>
            <div className="p-5">
              <LineChart values={niftySeries} labels={rangeLabels('1M')} height={240}
                format={(n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                ariaLabel="NIFTY 50 level over the past month" />
            </div>
          </section>
        </StaggerItem>
      )}

      {universe.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {([['Top gainers', movers.slice(0, 5), 'success'], ['Top losers', [...movers].reverse().slice(0, 5), 'danger']] as const).map(([title, list, tone]) => (
            <StaggerItem key={title}>
              <section className="card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
                  <h3 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
                  <span className="ml-auto"><DemoBadge /></span>
                </div>
                <div>
                  {list.map((m) => (
                    <div key={m.symbol} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0 hover:bg-fill transition-colors">
                      <AssetMark colour={`var(--${tone === 'success' ? 'c6' : 'c8'})`} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold truncate">{m.name}</span>
                        <span className="block text-[11.5px] text-muted">{m.symbol} · {m.owned ? 'Held' : 'Watchlist'}</span>
                      </span>
                      <span className="text-right">
                        {m.price != null && m.price > 0
                          ? (
                            <span className="block text-[13px] font-semibold tnum">
                              {fmt.money(m.price)}
                              {m.unpriced && <span className="text-muted font-normal"> at cost</span>}
                            </span>
                          )
                          : <span className="block text-[13px] text-muted">No price recorded</span>}
                        <span className={`block text-[12px] font-semibold tnum ${m.dayPct >= 0 ? 'text-success' : 'text-danger'}`}>{pct(m.dayPct)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </StaggerItem>
          ))}
        </div>
      )}
    </Stagger>
  );
}
