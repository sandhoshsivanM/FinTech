'use client';
/**
 * News.
 *
 * Entirely synthesised — the app has no feed and never will, because fetching
 * headlines for your tickers would tell the provider what you own. Stories are
 * fixed, hand-written and observational, and the page is unmistakably badged.
 */
import { useMemo } from 'react';
import { Newspaper, ExternalLink } from 'lucide-react';
import { useApp } from '@/lib/store';
import { PageIntro, Chip, GlassCard, EmptyState, Segmented } from '@/components/ui';
import { DemoBadge, useDemoData } from '@/components/DemoBadge';
import { Stagger, StaggerItem } from '@/components/motion';
import { demoNews, agoLabel } from '@/lib/demo/news';
import { demoIndices, demoEarnings } from '@/lib/demo/marketFeed';
import { pct } from '@/lib/format';
import { useState } from 'react';

export default function NewsPage() {
  const holdings = useApp((s) => s.holdings);
  const watchlist = useApp((s) => s.watchlist);
  const [demo] = useDemoData();
  const [scope, setScope] = useState<'all' | 'holdings' | 'watchlist'>('all');

  const heldSymbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);
  const watchSymbols = useMemo(() => watchlist.map((w) => w.symbol), [watchlist]);
  const symbols = scope === 'holdings' ? heldSymbols : scope === 'watchlist' ? watchSymbols : [...heldSymbols, ...watchSymbols];

  const stories = useMemo(() => (demo ? demoNews(symbols) : []), [demo, symbols]);
  const indices = useMemo(() => (demo ? demoIndices() : []), [demo]);
  const earnings = useMemo(() => (demo ? demoEarnings(heldSymbols).slice(0, 5) : []), [demo, heldSymbols]);

  if (!demo) {
    return (
      <Stagger className="grid gap-6">
        <StaggerItem><PageIntro title="News" subtitle="Market headlines for the instruments you follow" /></StaggerItem>
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState
              icon={<Newspaper size={22} />}
              title="Demo market data is switched off"
              hint="Khazana never contacts a news provider — doing so would reveal which instruments you own. With demo data off, this page has nothing to show. Turn it back on in Settings → Privacy."
            />
          </GlassCard>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="News"
          subtitle={`Filtered to the ${heldSymbols.length} instruments you hold and the ${watchSymbols.length} you watch`}
          action={<DemoBadge label="Demo feed" title="These headlines are fixed sample copy stored in the app. Khazana never contacts a news provider." />}
        />
      </StaggerItem>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <StaggerItem>
          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-b border-line">
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Latest</h2>
                <p className="text-xs text-muted mt-0.5">{stories.length} stories in the last 72 hours</p>
              </div>
              <span className="ml-auto">
                <Segmented
                  value={scope}
                  onChange={setScope}
                  options={[{ value: 'all', label: 'All' }, { value: 'holdings', label: 'Holdings' }, { value: 'watchlist', label: 'Watchlist' }]}
                />
              </span>
            </div>
            <div>
              {stories.map((s) => (
                <article key={s.id} className="flex gap-3 px-5 py-4 border-b border-line last:border-0 hover:bg-fill transition-colors">
                  <span className="w-8 h-8 mt-0.5 shrink-0 rounded-[10px] grid place-items-center bg-accent-soft text-accent">
                    <Newspaper size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Chip tone="accent">{s.category}</Chip>
                      <span className="text-[11.5px] text-muted">{agoLabel(s.agoHours)} · {s.source}</span>
                    </div>
                    <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] leading-snug text-balance">{s.title}</h3>
                    <p className="text-[11.5px] text-muted mt-1.5">
                      {s.symbols.length ? `Affects ${s.symbols.join(', ')}` : 'Portfolio-wide'}
                    </p>
                  </div>
                  <ExternalLink size={15} className="text-muted shrink-0 mt-1 hidden min-[560px]:block" />
                </article>
              ))}
            </div>
          </section>
        </StaggerItem>

        <div className="grid gap-6 content-start">
          <StaggerItem>
            <section className="card">
              <div className="px-5 py-4 border-b border-line flex items-center gap-3">
                <h3 className="text-[18px] font-semibold tracking-[-0.02em]">Indices</h3>
                <span className="ml-auto"><DemoBadge /></span>
              </div>
              <div className="p-5 grid gap-3.5">
                {indices.map((i) => (
                  <div key={i.symbol} className="flex items-center gap-3">
                    <span className="flex-1 text-[13px] text-ink-soft truncate">{i.name}</span>
                    <b className="text-[13.5px] font-semibold tnum">{i.level.toLocaleString('en-IN', { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits })}</b>
                    <span className={`text-[12px] font-semibold tnum min-w-[58px] text-right ${i.changePct >= 0 ? 'text-success' : 'text-danger'}`}>
                      {pct(i.changePct)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </StaggerItem>

          {earnings.length > 0 && (
            <StaggerItem>
              <section className="card">
                <div className="px-5 py-4 border-b border-line flex items-center gap-3">
                  <h3 className="text-[18px] font-semibold tracking-[-0.02em]">Upcoming earnings</h3>
                  <span className="ml-auto"><DemoBadge /></span>
                </div>
                <div>
                  {earnings.map((e) => (
                    <div key={e.symbol} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0">
                      <span className="w-[30px] h-[30px] shrink-0 rounded-[9px] grid place-items-center text-[11px] font-bold text-white bg-[var(--c5)]">
                        {e.symbol.slice(0, 2)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold truncate">{e.symbol}</span>
                        <span className="block text-[11.5px] text-muted">{e.quarter}</span>
                      </span>
                      <Chip>{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Chip>
                    </div>
                  ))}
                </div>
              </section>
            </StaggerItem>
          )}
        </div>
      </div>
    </Stagger>
  );
}
