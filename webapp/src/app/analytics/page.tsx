'use client';
/**
 * Analytics — how the portfolio is built, and how it behaves.
 *
 * The structural questions the Dashboard deliberately does not answer: how
 * concentrated the book is, how returns are spread across positions, and where
 * value actually sits once you drill past the asset group.
 *
 * Composition follows the design spec (Part C, /analytics): a six-figure strip,
 * then the three structural reads side by side, then the three time-and-shape
 * figures below. The page previously opened with three 176px dials — a third of
 * the screen spent on three numbers, two of which were derived scores rather
 * than facts, while the sunburst, the per-position concentration list and the
 * risk table the spec calls for were absent entirely.
 *
 * Every figure is computed from the user's own holdings and snapshots. Scores
 * render `null` — a dash — when their inputs are missing, never a zero that
 * would read as a real, terrible score.
 */
import { ProGate } from '@/components/ProGate';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LineChart as LineIcon, AlertTriangle } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { useDarkMode } from '@/lib/useDarkMode';
import { useNow } from '@/lib/useNow';
import { D } from '@/lib/money';
import {
  PageIntro, Gauge, ProgressBar, GlassCard, EmptyState, Button, Segmented, Sunburst,
  type SunburstNode,
} from '@/components/ui';
import { Stagger, StaggerItem } from '@/components/motion';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { LineChart } from '@/components/charts/LineChart';
import { Histogram } from '@/components/charts/Histogram';
import { Section, Metric, MetricRow, LedgerLine } from '@/components/primitives';
import {
  portfolioSummary, rollup, allocationByGroup, sunburst, groupShades,
  ASSET_GROUP_META, UNCLASSIFIED_KEY, type AssetGroup,
} from '@/domain/portfolio';
import {
  loadInstrumentMaster, classifyHolding, EMPTY_MASTER, SECTOR_SUGGESTIONS,
  type InstrumentMaster,
} from '@/domain/instrumentMaster';
import {
  returnBuckets, positionWeights, riskStats, diversificationScore,
  diversificationBand, returnQualityScore, extremes, POSITION_ALERT_WEIGHT,
} from '@/domain/analytics';
import { short } from '@/lib/format';
import { formatMonthShort } from '@/lib/dateFormat';

/** Trailing windows the snapshot history can answer. */
const RANGES = [
  { key: '3M', days: 90 }, { key: '6M', days: 182 },
  { key: '1Y', days: 365 }, { key: 'ALL', days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

/** Positions listed in the concentration ranking before it stops being a ranking. */
const CONCENTRATION_ROWS = 7;

function AnalyticsPageInner() {
  const holdings = useApp((s) => s.holdings);
  const fxRates = useApp((s) => s.fxRates);
  const snapshots = useApp((s) => s.snapshots);
  const fmt = useFmt();
  const dark = useDarkMode();
  const now = useNow();
  const [range, setRange] = useState<RangeKey>('1Y');

  // Sector is not stored on a holding — it is looked up in the bundled
  // instrument master. Without this classifier `rollup` buckets everything as
  // "Unclassified", which would report the largest sector as 100%.
  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  useEffect(() => { void loadInstrumentMaster().then(setMaster); }, []);
  const classify = useCallback(
    (h: Parameters<typeof classifyHolding>[1]) => classifyHolding(master, h),
    [master],
  );

  const summary = useMemo(() => portfolioSummary(holdings, undefined, fxRates), [holdings, fxRates]);
  const groups = useMemo(() => allocationByGroup(holdings), [holdings]);
  const sectors = useMemo(() => rollup(holdings, 'sector', classify), [holdings, classify]);

  /**
   * Largest asset group's share of the book.
   *
   * Derived from `groups` — the same roll-up the Equity-weight stat reads —
   * rather than from `investmentTotals`. Those two paths resolve an unpriced
   * holding's value slightly differently, so on an all-equity book the strip
   * printed "Concentration 100.0%" beside "Equity weight 99.9%": one quantity,
   * two figures, on one screen. The spec's rule is that any roll-up sums
   * exactly to the portfolio total, and one source is how that is kept.
   */
  const conc = useMemo(() => {
    const total = groups.reduce((s, g) => s + g.current.toNumber(), 0);
    if (total <= 0 || groups.length === 0) return null;
    const largest = Math.max(...groups.map((g) => g.current.toNumber()));
    return largest / total;
  }, [groups]);

  // ---- Scores and structure ------------------------------------------------
  const diversification = diversificationScore(holdings.length, groups.length, conc);
  const quality = returnQualityScore(summary.invested, summary.pnlPct);
  const { best, weakest } = useMemo(() => extremes(summary.views), [summary.views]);
  const weights = useMemo(() => positionWeights(summary.views), [summary.views]);
  const buckets = useMemo(() => returnBuckets(summary.views), [summary.views]);
  const stats = useMemo(
    () => riskStats(holdings, summary.views, groups, sectors, UNCLASSIFIED_KEY, SECTOR_SUGGESTIONS.length),
    [holdings, summary.views, groups, sectors],
  );

  const winners = summary.views.filter((v) => v.pnl.gt(0)).length;
  const belowCost = summary.views.filter((v) => v.pnl.lt(0)).length;
  const flagged = weights.filter((w) => w.flagged);

  // ---- Where value sits ----------------------------------------------------
  const sunburstRoot = useMemo<SunburstNode>(() => {
    const nodes = sunburst(holdings, classify);
    return {
      key: 'root',
      label: 'Portfolio',
      // Summed from the rings rather than taken from `portfolioSummary`. Both
      // routes give the same number today, but only this one cannot drift: a
      // centre total sourced separately from the arcs around it is a figure
      // that can disagree with the chart it sits inside.
      value: nodes.reduce((s, n) => s + n.row.current.toNumber(), 0),
      color: 'transparent',
      children: nodes.map(({ row, children }) => {
        const g = row.key as AssetGroup;
        // Outer ring steps the group's own hue toward the surface by rank —
        // never a new hue, which is what would break the palette's
        // colourblind guarantee (spec, annotation 4).
        const shades = groupShades(g, children.length, dark);
        return {
          key: row.key,
          label: row.label,
          value: row.current.toNumber(),
          color: ASSET_GROUP_META[g]?.[dark ? 'dark' : 'light'] ?? 'var(--c1)',
          children: children.map((c, i) => ({
            key: `${row.key}/${c.key}`,
            label: c.label,
            value: c.current.toNumber(),
            color: shades[Math.min(i, shades.length - 1)],
          })),
        };
      }),
    };
  }, [holdings, classify, dark]);

  // ---- Time series ---------------------------------------------------------
  // `useNow`, not `Date.now()`: reading the clock during render makes the
  // window boundary shift on any re-render that happens to cross a tick, so
  // the same range could quietly include a different set of snapshots twice in
  // a row. Zero until the clock is known, which reads as "everything".
  const windowed = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    if (!Number.isFinite(days) || !now) return snapshots;
    const cutoff = now - days * 86_400_000;
    return snapshots.filter((s) => s.date >= cutoff);
  }, [snapshots, range, now]);

  const netWorthSeries = useMemo(
    () => windowed.map((s) => D(s.netWorth).toNumber()),
    [windowed],
  );

  /** Month-on-month change in recorded net worth, from real snapshots. */
  const monthly = useMemo(() => {
    if (windowed.length < 2) return [];
    const byMonth = new Map<string, number>();
    for (const s of windowed) {
      const d = new Date(s.date);
      byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, D(s.netWorth).toNumber());
    }
    const keys = [...byMonth.keys()];
    return keys.slice(1).map((k, i) => {
      const [y, m] = k.split('-').map(Number);
      return {
        label: formatMonthShort(new Date(y, m, 1)),
        value: byMonth.get(k)! - byMonth.get(keys[i])!,
      };
    }).slice(-12);
  }, [windowed]);

  const pct = (v: number | null, digits = 1) =>
    v == null ? '—' : `${(v * 100).toFixed(digits)}%`;

  if (holdings.length === 0) {
    return (
      <Stagger className="grid gap-6">
        <StaggerItem>
          <PageIntro title="Analytics" subtitle="How the portfolio is built, and how it behaves" />
        </StaggerItem>
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState icon={<LineIcon size={22} />} title="Nothing to analyse yet"
              hint="Add a few holdings and this page will score diversification, show how returns are spread, and break down where the value sits."
              action={<Link href="/holdings"><Button>Add a holding</Button></Link>} />
          </GlassCard>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Analytics"
          subtitle="How the portfolio is built, and how it behaves"
          action={
            <Segmented
              options={RANGES.map((r) => ({ value: r.key, label: r.key }))}
              value={range}
              onChange={setRange}
            />
          }
        />
      </StaggerItem>

      {/* ---- The six figures ------------------------------------------------ */}
      {/* A strip, not a row of dials. Three 176px gauges used to open this page,
          which spent a third of the screen on three numbers and pushed every
          structural read below the fold. */}
      <StaggerItem>
        <Section first>
          {/* Named as a group: six figures that are read together, and whose
              labels ("Concentration") legitimately repeat as headings on the
              cards below. Without the label a screen reader meets them as six
              loose numbers between the page title and the first card. */}
          {/* Named breakpoints only — see the note on MetricRow's `cols`. */}
          <MetricRow role="group" aria-label="Key figures"
            cols="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Diversification" size="md" hint="diversification"
              value={diversification ?? '—'}
              untracked={diversification == null} untrackedHint="Needs two holdings"
              sub={diversification == null ? undefined
                : `of 100 — ${diversificationBand(diversification).toLowerCase()}`}
            />
            <Metric
              label="Concentration" size="md" hint="concentration"
              value={pct(conc)}
              untracked={conc == null} untrackedHint="Needs a priced holding"
              sub="largest asset group"
            />
            <Metric label="Positions" size="md" value={holdings.length}
              sub={`${stats.sectorsRepresented} sector${stats.sectorsRepresented === 1 ? '' : 's'}`} />
            <Metric
              label="Return quality" size="md"
              value={quality ?? '—'}
              untracked={quality == null} untrackedHint="Needs a cost basis"
              sub={`${winners} of ${holdings.length} in profit`}
            />
            <Metric
              label="Best position" size="md"
              value={best?.holding.symbol ?? '—'}
              tone={best ? 'delta' : 'plain'} sign={best?.pnlPct ?? 0}
              untracked={best == null} untrackedHint="No positions"
              sub={best ? `${best.pnlPct >= 0 ? '+' : '−'}${Math.abs(best.pnlPct).toFixed(2)}%` : undefined}
            />
            <Metric
              label="Weakest" size="md"
              value={weakest?.holding.symbol ?? '—'}
              tone={weakest ? 'delta' : 'plain'} sign={weakest?.pnlPct ?? 0}
              untracked={weakest == null} untrackedHint="No positions"
              sub={weakest ? `${weakest.pnlPct >= 0 ? '+' : '−'}${Math.abs(weakest.pnlPct).toFixed(2)}%` : undefined}
            />
          </MetricRow>
        </Section>
      </StaggerItem>

      {/* ---- The three structural reads ------------------------------------- */}
      <div className="grid gap-6 min-[1100px]:grid-cols-3">
        <StaggerItem>
          <section className="card h-full p-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Risk &amp; diversification</h2>
            {/* Always stacked. This card is one third of the row, so splitting
                it on a VIEWPORT breakpoint sized the stat column against the
                window rather than against the card — at 1440px that left ~150px
                for labels and truncated four of the six to "Sector…", "Top 5…". */}
            <div className="mt-4 grid items-center gap-5">
              <div className="justify-self-center">
                {/* Same 240° component as the health screen, different domain,
                    so a reader who has learned one dial has learned both. */}
                <Gauge
                  value={diversification} size={168} stroke={15} sweepDegrees={240}
                  sublabel={diversification == null ? undefined : diversificationBand(diversification)}
                  untrackedLabel="Not yet scored"
                />
                <p className="mt-1 text-center text-[11.5px] text-muted">diversification score</p>
              </div>
              <div className="min-w-0">
                <LedgerLine label="Holdings" value={stats.holdings} />
                <LedgerLine label="Sectors represented"
                  value={`${stats.sectorsRepresented} of ${stats.sectorUniverse}`} />
                <LedgerLine label="Largest position"
                  value={stats.largest
                    ? `${stats.largest.symbol} · ${pct(stats.largest.weight)}`
                    : '—'} />
                <LedgerLine label="Top 5 weight" hint="weight" value={pct(stats.top5Weight)} />
                <LedgerLine label="Equity weight" hint="weight" value={pct(stats.equityWeight)} />
                <LedgerLine label="Non-equity sleeves" value={stats.nonEquitySleeves} />
              </div>
            </div>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card h-full p-5">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Return distribution</h2>
              <span className="ml-auto text-[11.5px] text-muted">positions by unrealised return</span>
            </div>
            <div className="mt-5">
              <Histogram bins={buckets.map((b) => ({
                label: b.label, title: b.title, count: b.count,
                color: b.negative ? 'var(--danger)' : 'var(--accent)',
              }))} height={200} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              {belowCost === 0
                ? `No position sits below its cost basis. A count histogram, not a value one — the question is how many positions are working, which a value-weighted chart would hide behind the largest holding.`
                : `${belowCost} of ${holdings.length} position${holdings.length === 1 ? '' : 's'} sit below their cost basis. The negative buckets take the danger token so the split is legible without reading the axis.`}
            </p>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card h-full p-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Concentration</h2>
            {/* Per NAME, not per asset group. "Largest asset group is 100%" is
                true of any all-equity book and tells its owner nothing they can
                act on; which single holding is too large is actionable. */}
            <div className="mt-4 grid gap-3">
              {weights.slice(0, CONCENTRATION_ROWS).map((w) => (
                <div key={w.symbol} className="grid gap-1.5">
                  <div className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="truncate font-medium text-ink-soft">{w.symbol}</span>
                    <b className="ml-auto text-[13px] font-semibold tnum">{pct(w.weight)}</b>
                  </div>
                  <ProgressBar
                    fraction={w.weight / Math.max(weights[0].weight, 0.0001)}
                    color={w.flagged ? 'var(--warning)' : 'var(--accent)'}
                  />
                </div>
              ))}
              {weights.length > CONCENTRATION_ROWS && (
                <p className="text-[11.5px] text-muted">
                  and {weights.length - CONCENTRATION_ROWS} smaller position
                  {weights.length - CONCENTRATION_ROWS === 1 ? '' : 's'}
                </p>
              )}
            </div>

            {flagged.length > 0 && (
              <div className="mt-4 flex gap-2.5 rounded-[var(--radius-btn)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-warning-soft p-3">
                <AlertTriangle size={15} className="mt-px shrink-0 text-warning" aria-hidden="true" />
                <div className="text-[12.5px] leading-relaxed">
                  <b className="font-semibold text-ink">
                    {flagged.length === 1
                      ? 'One position exceeds the alert weight'
                      : `${flagged.length} positions exceed the alert weight`}
                  </b>
                  <p className="text-muted">
                    {flagged.map((f) => f.symbol).join(', ')}
                    {flagged.length === 1 ? ' is ' : ' are '}
                    above the {(POSITION_ALERT_WEIGHT * 100).toFixed(0)}% ceiling.
                  </p>
                </div>
              </div>
            )}
          </section>
        </StaggerItem>
      </div>

      {/* ---- Time, movement and shape ---------------------------------------- */}
      <div className="grid gap-6 min-[1100px]:grid-cols-3">
        <StaggerItem>
          <section className="card h-full p-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Net worth trend</h2>
            <div className="mt-4">
              {netWorthSeries.length > 1
                ? <LineChart values={netWorthSeries} height={190}
                    format={(n) => short(n, fmt.symbol)}
                    ariaLabel={`Net worth over ${range}`} />
                : <p className="py-12 text-center text-[13px] text-muted">
                    Not enough history in this range yet.
                  </p>}
            </div>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card h-full p-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Net worth movement</h2>
            <div className="mt-4">
              {monthly.length > 0
                ? <ColumnChart columns={monthly} height={190} format={(n) => fmt.money(n)}
                    formatLabel={(n) => short(n, fmt.symbol)} />
                : <p className="py-12 text-center text-[13px] text-muted">
                    Not enough history yet — snapshots are recorded each day you open Khazana.
                  </p>}
            </div>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card h-full p-5">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Where value sits</h2>
            {/* Asset group on the inner ring, what it is made of on the outer.
                The component, its colour ramp and the `sunburst` roll-up were
                all built and shipped; nothing in the app had ever rendered
                them. */}
            <div className="mt-4 grid place-items-center">
              <Sunburst
                root={sunburstRoot}
                size={210}
                ringWidth={30}
                formatValue={(n) => short(n, fmt.symbol)}
                centerSub="portfolio"
              />
            </div>
          </section>
        </StaggerItem>
      </div>
    </Stagger>
  );
}

/**
 * The analysis on top of your data — gated.
 *
 * The gate renders the real screen blurred behind the paywall card rather than
 * replacing it: a redirect would lose the user's context and break the back
 * button, and someone who can faintly see their own figures converts where
 * someone shown an empty room does not.
 */
export default function AnalyticsPage() {
  return (
    <ProGate
      feature="portfolioAnalytics"
      title={'The analysis on top of your data'}
      blurb={'XIRR, benchmark comparison and movers. Your holdings and their value stay free — this is what we compute from them.'}
    >
      <AnalyticsPageInner />
    </ProGate>
  );
}
