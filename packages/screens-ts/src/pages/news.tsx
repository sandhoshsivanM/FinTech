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
import { useApp } from '@khazana/screens/store';
import { PageIntro, Chip, GlassCard, EmptyState, Segmented } from '@khazana/ui/ui';
import { DemoBadge, useDemoData } from '@khazana/screens/components/DemoBadge';
import { Stagger, StaggerItem } from '@khazana/ui/motion';
import { AssetMark } from '@khazana/ui/primitives';
import { CardTitle } from '@khazana/ui/Hint';
import { demoNews, agoLabel } from '@khazana/screens/lib/demo/news';
import { demoIndices, demoEarnings } from '@khazana/screens/lib/demo/marketFeed';
import { pct } from '@khazana/screens/lib/format';
import { useState } from 'react';
import { formatDayMonth } from '@khazana/screens/lib/dateFormat';

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
                <CardTitle info="news.latest" className="fs-16 font-medium tracking-[-0.01em]">Latest</CardTitle>
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
                <article key={s.id} className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-fill transition-colors">
                  <span className="w-10 h-10 shrink-0 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--data-blue)_14%,transparent)] text-[var(--data-blue)]">
                    <Newspaper size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="fs-14 font-medium tracking-[-0.01em] leading-snug text-balance">{s.title}</h3>
                    <p className="fs-11.5 text-muted mt-1">
                      {s.source} · {agoLabel(s.agoHours)} · {s.symbols.length ? s.symbols.join(', ') : 'Portfolio-wide'}
                    </p>
                    <div className="mt-1.5"><Chip>{s.category}</Chip></div>
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
                <CardTitle as="h3" info="news.indices" className="fs-16 font-medium tracking-[-0.01em]">Indices</CardTitle>
                <span className="ml-auto"><DemoBadge /></span>
              </div>
              <div className="p-5 grid gap-3.5">
                {indices.map((i) => (
                  <div key={i.symbol} className="flex items-center gap-3">
                    <span className="flex-1 fs-13 text-ink-soft truncate">{i.name}</span>
                    <b className="fs-14 font-normal tnum">{i.level.toLocaleString('en-IN', { minimumFractionDigits: i.digits, maximumFractionDigits: i.digits })}</b>
                    <span className={`fs-12 font-semibold tnum min-w-[58px] text-right ${i.changePct >= 0 ? 'text-[var(--data-green-ink)]' : 'text-[var(--data-rose)]'}`}>
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
                  <CardTitle as="h3" info="news.upcomingEarnings" className="fs-16 font-medium tracking-[-0.01em]">Upcoming earnings</CardTitle>
                  <span className="ml-auto"><DemoBadge /></span>
                </div>
                <div>
                  {earnings.map((e) => (
                    <div key={e.symbol} className="flex items-center gap-3 px-5 py-3 border-b border-line last:border-0">
                      <AssetMark colour="var(--c5)" />
                      <span className="flex-1 min-w-0">
                        <span className="block fs-14 font-medium truncate">{e.symbol}</span>
                        <span className="block fs-11.5 text-muted">{e.quarter}</span>
                      </span>
                      <Chip>{formatDayMonth(e.date)}</Chip>
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
