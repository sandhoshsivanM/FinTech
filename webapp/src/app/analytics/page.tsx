'use client';
/**
 * Analytics — risk, diversification and return quality.
 *
 * Everything here is computed from the user's own holdings and snapshots. The
 * three scores are deliberately rendered as `null` when the inputs are not
 * there, so an empty vault reads "Not yet tracked" rather than "0 out of 100".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LineChart as LineIcon, ShieldAlert, Layers, Trophy } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { PageIntro, Gauge, ProgressBar, GlassCard, EmptyState, Button, Chip } from '@/components/ui';
import { Stagger, StaggerItem } from '@/components/motion';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { LineChart } from '@/components/charts/LineChart';
import { portfolioSummary, rollup, allocationByGroup } from '@/domain/portfolio';
import { loadInstrumentMaster, classifyHolding, EMPTY_MASTER, type InstrumentMaster } from '@/domain/instrumentMaster';
import { concentration, investmentTotals } from '@/domain/investmentTotals';
import { UNCLASSIFIED_KEY } from '@/domain/portfolio';
import { short } from '@/lib/format';
import { formatMonthShort } from '@/lib/dateFormat';

export default function AnalyticsPage() {
  const holdings = useApp((s) => s.holdings);
  const snapshots = useApp((s) => s.snapshots);
  const fmt = useFmt();

  // Sector is not stored on a holding — it is looked up in the bundled
  // instrument master. Without this classifier `rollup` buckets everything as
  // "Unclassified", which would report the largest sector as 100%.
  const [master, setMaster] = useState<InstrumentMaster>(EMPTY_MASTER);
  useEffect(() => { void loadInstrumentMaster().then(setMaster); }, []);
  const classify = useCallback(
    (h: Parameters<typeof classifyHolding>[1]) => classifyHolding(master, h),
    [master],
  );

  const summary = useMemo(() => portfolioSummary(holdings), [holdings]);
  const totals = useMemo(() => investmentTotals(holdings), [holdings]);
  const groups = useMemo(() => allocationByGroup(holdings), [holdings]);
  const sectors = useMemo(() => rollup(holdings, 'sector', classify), [holdings, classify]);

  const conc = concentration(totals);
  const total = summary.current.toNumber();

  /**
   * Scores. Each is null until there is enough to judge — a single holding
   * cannot be called diversified or concentrated, so it gets no score at all.
   */
  const diversification = holdings.length < 2 ? null : Math.round(
    Math.max(0, Math.min(100,
      // Groups present (up to 5 of 7) and the largest group's share, blended.
      (Math.min(groups.length, 5) / 5) * 55 + (1 - (conc ?? 1)) * 45,
    )),
  );
  const risk = holdings.length < 2 ? null : Math.round(
    Math.max(0, Math.min(100, 100 - (conc ?? 1) * 70 - (groups.length <= 2 ? 18 : 0))),
  );
  const performance = summary.invested.lte(0) ? null : Math.round(
    Math.max(0, Math.min(100, 50 + summary.pnlPct * 1.6)),
  );

  const winners = summary.views.filter((v) => v.pnl.gt(0)).length;
  const losers = summary.views.filter((v) => v.pnl.lt(0)).length;

  /** Month-on-month change in recorded net worth, from real snapshots. */
  const monthly = useMemo(() => {
    if (snapshots.length < 2) return [];
    const byMonth = new Map<string, number>();
    for (const s of snapshots) {
      const d = new Date(s.date);
      byMonth.set(`${d.getFullYear()}-${d.getMonth()}`, D(s.netWorth).toNumber());
    }
    const keys = [...byMonth.keys()];
    return keys.slice(1).map((k, i) => {
      const [y, m] = k.split('-').map(Number);
      return { label: formatMonthShort(new Date(y, m, 1)), value: byMonth.get(k)! - byMonth.get(keys[i])! };
    }).slice(-12);
  }, [snapshots]);

  const netWorthSeries = useMemo(() => snapshots.map((s) => D(s.netWorth).toNumber()), [snapshots]);

  if (holdings.length === 0) {
    return (
      <Stagger className="grid gap-6">
        <StaggerItem><PageIntro title="Analytics" subtitle="Risk, diversification and return quality" /></StaggerItem>
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState icon={<LineIcon size={22} />} title="Nothing to analyse yet"
              hint="Add a few holdings and this page will score diversification, concentration and return quality across the book."
              action={<Button><Link href="/investments">Go to Portfolio</Link></Button>} />
          </GlassCard>
        </StaggerItem>
      </Stagger>
    );
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro title="Analytics" subtitle={`${holdings.length} positions across ${groups.length} asset group${groups.length === 1 ? '' : 's'}`} />
      </StaggerItem>

      <StaggerItem>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ['Diversification', diversification, Layers, `${groups.length} groups · largest ${conc != null ? (conc * 100).toFixed(1) : '—'}%`],
            ['Concentration risk', risk, ShieldAlert, conc != null ? `Largest group is ${(conc * 100).toFixed(1)}% of the book` : 'Needs at least two holdings'],
            ['Return quality', performance, Trophy, `${winners} up · ${losers} down`],
          ] as const).map(([label, score, Icon, sub]) => (
            <section key={label} className="card lift p-6 grid justify-items-center text-center gap-4">
              <Gauge value={score} size={176} sublabel={score == null ? undefined : score >= 80 ? 'Excellent' : score >= 60 ? 'Strong' : score >= 40 ? 'Fair' : 'Needs work'} />
              <div>
                <div className="flex items-center justify-center gap-2 text-[15px] font-semibold tracking-[-0.02em]">
                  <Icon size={15} className="text-muted" />{label}
                </div>
                <p className="text-[12.5px] text-muted mt-1.5">{sub}</p>
              </div>
            </section>
          ))}
        </div>
      </StaggerItem>

      <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <StaggerItem>
          <section className="card">
            <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Net worth movement</h2>
                <p className="text-xs text-muted mt-0.5">Month on month, from recorded snapshots</p>
              </div>
              {monthly.length > 0 && (
                <span className="ml-auto flex gap-2">
                  <Chip tone="success">{monthly.filter((m) => m.value >= 0).length} up</Chip>
                  <Chip tone="danger">{monthly.filter((m) => m.value < 0).length} down</Chip>
                </span>
              )}
            </div>
            <div className="p-5">
              {monthly.length > 0
                ? <ColumnChart columns={monthly} height={220} format={(n) => fmt.money(n)} />
                : <p className="py-12 text-center text-[13px] text-muted">Not enough history yet — snapshots are recorded each day you open Khazana.</p>}
            </div>
          </section>
        </StaggerItem>

        <StaggerItem>
          <section className="card">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-[18px] font-semibold tracking-[-0.02em]">Return distribution</h3>
            </div>
            <div className="p-5 grid gap-4">
              {([
                ['Above +20%', summary.views.filter((v) => v.pnlPct > 20).length, 'var(--c6)'],
                ['+5% to +20%', summary.views.filter((v) => v.pnlPct > 5 && v.pnlPct <= 20).length, 'var(--c2)'],
                ['0% to +5%', summary.views.filter((v) => v.pnlPct >= 0 && v.pnlPct <= 5).length, 'var(--c3)'],
                ['Below 0%', losers, 'var(--danger)'],
              ] as const).map(([label, n, colour]) => (
                <div key={label} className="grid gap-1.5">
                  <div className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="text-ink-soft">{label}</span>
                    <b className="ml-auto text-[13px] font-semibold">{n} holding{n === 1 ? '' : 's'}</b>
                  </div>
                  <ProgressBar fraction={n / Math.max(holdings.length, 1)} color={colour} />
                </div>
              ))}
              <div className="border-t border-line pt-4 grid gap-3">
                {([
                  ['Best', summary.views.length ? Math.max(...summary.views.map((v) => v.pnlPct)) : null],
                  ['Worst', summary.views.length ? Math.min(...summary.views.map((v) => v.pnlPct)) : null],
                  ['Win rate', holdings.length ? (winners / holdings.length) * 100 : null],
                ] as const).map(([label, v]) => (
                  <div key={label} className="flex text-[13px]">
                    <span className="text-ink-soft">{label}</span>
                    <b className="ml-auto font-semibold tnum">{v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`}</b>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </StaggerItem>
      </div>

      {netWorthSeries.length > 1 && (
        <StaggerItem>
          <section className="card">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Net worth trend</h2>
              <p className="text-xs text-muted mt-0.5">{netWorthSeries.length} recorded snapshots</p>
            </div>
            <div className="p-5">
              <LineChart values={netWorthSeries} height={220} color="var(--violet)" format={(n) => short(n, fmt.symbol)} />
            </div>
          </section>
        </StaggerItem>
      )}

      <StaggerItem>
        <section className="card">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Concentration</h2>
            <p className="text-xs text-muted mt-0.5">Weight of the largest positions</p>
          </div>
          <div className="p-5 grid gap-4">
            {([
              ['Largest holding', summary.views.length ? (Math.max(...summary.views.map((v) => v.current.toNumber())) / total) * 100 : 0],
              ['Top 5 holdings', ([...summary.views].sort((a, b) => b.current.toNumber() - a.current.toNumber()).slice(0, 5).reduce((s, v) => s + v.current.toNumber(), 0) / total) * 100],
              ['Largest asset group', (conc ?? 0) * 100],
              ['Largest sector', (() => {
                const named = sectors.filter((r) => r.key !== UNCLASSIFIED_KEY);
                return named.length ? (named[0].current.toNumber() / total) * 100 : 0;
              })()],
            ] as const).map(([label, v]) => (
              <div key={label} className="grid gap-1.5">
                <div className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="text-ink-soft">{label}</span>
                  <b className="ml-auto text-[13px] font-semibold tnum">{v.toFixed(1)}%</b>
                </div>
                <ProgressBar fraction={v / 100} color={v > 50 ? 'var(--warning)' : 'var(--accent)'} />
              </div>
            ))}
            <p className="text-xs text-muted leading-relaxed mt-1">
              A single holding above 10% of the book, or one sector above 35%, is where concentration usually starts to matter.
            </p>
          </div>
        </section>
      </StaggerItem>
    </Stagger>
  );
}
