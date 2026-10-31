'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { PiggyBank, Landmark, ArrowRight } from 'lucide-react';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { safetyNet, type SafetyComponent } from '@khazana/domain/safetyNet';
import { investmentTotals } from '@khazana/domain/investmentTotals';
import { ASSET_META } from '@khazana/domain/portfolio';
import { D } from '@khazana/domain/money';
import {
  PageIntro, GlassCard, SectionHeader, StatStrip, Ring, ProgressBar, EmptyState, Button,
} from '@khazana/ui/ui';
import { SectionInfo } from '@khazana/ui/Hint';

const RETIREMENT = new Set(['fd', 'ppf_epf', 'nps']);
// Zentra gauge colours: blue when covered, amber when partly, pink when short.
const coverColor = (pct: number) =>
  pct >= 100 ? 'var(--data-blue)' : pct >= 60 ? 'var(--data-amber)' : 'var(--data-rose)';
const coverText = (pct: number) =>
  pct >= 100 ? 'var(--ink)' : pct >= 60 ? 'var(--warn)' : 'var(--expense)';

export default function SafetyNetPage() {
  const txns = useApp((s) => s.txns);
  const goals = useApp((s) => s.goals);
  const insurances = useApp((s) => s.insurances);
  const holdings = useApp((s) => s.holdings);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();

  const sn = useMemo(
    () => safetyNet(txns, goals, insurances, investmentTotals(holdings)),
    [txns, goals, insurances, holdings],
  );
  const m = (v: Parameters<typeof fmt.money>[0]) => (ghost ? '••••••' : fmt.money(v));

  const get = (k: SafetyComponent['key']) => sn.components.find((c) => c.key === k)!;
  const emergency = get('emergency');
  const life = get('life');
  const health = get('health');
  const ringColor = 'var(--data-blue)';

  // `lastPrice ?? avgCost` again: a position with no quote is carried at what
  // it cost. Marked, because a retirement figure that quietly assumes zero
  // growth is the kind of number people plan around (§7.1).
  const retireHoldings = holdings
    .filter((h) => RETIREMENT.has(h.assetType))
    .map((h) => ({ h, value: D(h.quantity).times(D(h.lastPrice ?? h.avgCost)), atCost: !h.lastPrice }))
    .sort((a, b) => b.value.minus(a.value).toNumber());
  const retireAtCost = retireHoldings.filter((r) => r.atCost).length;

  return (
    <div className="space-y-6">
      <PageIntro title="Safety Net" subtitle="Your protection at a glance — emergency fund, insurance and safe assets." />

      {/* Readiness hero */}
      <GlassCard className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Ring fraction={sn.score / 100} size={120} stroke={11} color={ringColor}>
            <div className="text-center">
              <div className="fs-28 font-light leading-none" >{sn.score}</div>
              <div className="fs-11 font-semibold text-muted mt-0.5">{sn.grade}</div>
            </div>
          </Ring>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <div className="eyebrow">Safety-net readiness</div>
              <SectionInfo k="safety-net.readiness" />
            </div>
            <p className="mt-1 fs-15 text-ink-soft leading-relaxed">{sn.summary}</p>
          </div>
        </div>
      </GlassCard>

      <StatStrip items={[
        { label: 'Emergency fund', term: 'emergencyFund', value: m(emergency.current), sub: `${sn.monthsCovered.toFixed(1)} mo of expenses` },
        { label: 'Life cover', term: 'sumAssured', value: `${Math.min(999, life.coveredPct)}%`, sub: m(life.current), accent: coverText(life.coveredPct) },
        { label: 'Health cover', term: 'sumAssured', value: `${Math.min(999, health.coveredPct)}%`, sub: m(health.current), accent: coverText(health.coveredPct) },
        { label: 'Annual premiums', value: m(sn.premium), sub: `${insurances.length} polic${insurances.length === 1 ? 'y' : 'ies'}` },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Emergency fund */}
        <GlassCard>
          <SectionHeader title="Emergency fund" info="safety-net.emergencyFund" action={<CardLink href="/goals" label="Goals" />} />
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-3">
            <span className="w-9 h-9 rounded-[var(--radius-card)] grid place-items-center bg-income/12 text-income"><PiggyBank size={18} /></span>
            <div className="fs-22 font-light tnum">{m(emergency.current)}</div>
            <div className="text-sm text-muted">of {m(emergency.recommended)} target</div>
          </div>
          <ProgressBar fraction={emergency.coveredPct / 100} color={coverColor(emergency.coveredPct)} height={8} />
          <p className="fs-12.5 text-ink-soft mt-2">{emergency.detail}</p>
          {emergency.gap.gt(0) && (
            <p className="fs-12.5 text-muted mt-0.5">{m(emergency.gap)} to reach ~6 months of expenses.</p>
          )}
        </GlassCard>

        {/* Insurance cover */}
        <GlassCard>
          <SectionHeader title="Insurance cover" info="safety-net.insuranceCover" action={<CardLink href="/insurance" label="Insurance" />} />
          <div className="space-y-3.5">
            {[life, health].map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="fs-13.5 font-medium">{c.label}</span>
                  <span className="fs-13 font-semibold tnum" style={{ color: coverText(c.coveredPct) }}>{Math.min(999, c.coveredPct)}%</span>
                </div>
                <ProgressBar fraction={c.coveredPct / 100} color={coverColor(c.coveredPct)} height={6} />
                <div className="fs-11.5 text-muted mt-1">
                  {m(c.current)} of {m(c.recommended)} recommended{c.gap.gt(0) ? ` · ${m(c.gap)} short` : ' · covered'}
                </div>
              </div>
            ))}
          </div>
          <p className="fs-11 text-muted mt-3 pt-3 border-t border-[var(--line)]">
            Guideline only, not advice — life ≈ 10× annual income; health ≥ ₹5L. Premiums: {m(sn.premium)}/yr.
          </p>
        </GlassCard>
      </div>

      {/* Safe & retirement assets */}
      <GlassCard>
        <SectionHeader title="Safe & retirement assets" info="safety-net.safeAssets" action={<CardLink href="/investments" label="Investments" />} />
        {retireHoldings.length === 0 ? (
          <EmptyState
            icon={<Landmark size={22} />}
            title="No FD / PPF / NPS tracked"
            hint="Add a holding in Investments and pick Fixed Deposit, PPF / EPF or NPS to see your safe & retirement money here."
            action={<Link href="/investments"><Button variant="soft"><ArrowRight size={15} /> Go to Investments</Button></Link>}
          />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {retireHoldings.map(({ h, value, atCost }) => (
              <div key={h.id} className="flex items-center gap-3 py-2.5">
                <span className="fs-11 font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: `color-mix(in srgb, ${ASSET_META[h.assetType].color} 12%, transparent)`, color: ASSET_META[h.assetType].color }}>
                  {ASSET_META[h.assetType].label}
                </span>
                <span className="flex-1 min-w-0 truncate font-medium">{h.symbol}</span>
                <span className="font-semibold tnum">
                  {m(value)}
                  {atCost && <span className="ml-1 fs-11 font-normal text-muted">at cost</span>}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2.5 mt-0.5">
              <span className="text-sm text-ink-soft">Total safe & retirement</span>
              <span className="font-semibold tnum">{m(retireHoldings.reduce((s, r) => s.plus(r.value), D(0)))}</span>
            </div>
            {retireAtCost > 0 && (
              <p className="pt-2 text-xs text-muted leading-relaxed">
                {retireAtCost} of these {retireAtCost === 1 ? 'has' : 'have'} no recorded price and
                {retireAtCost === 1 ? ' is' : ' are'} counted at what {retireAtCost === 1 ? 'it' : 'they'} cost,
                so this total assumes no growth on {retireAtCost === 1 ? 'it' : 'them'}.
              </p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-accent fs-13 font-semibold hover:gap-1.5 transition-all">
      {label} <ArrowRight size={14} />
    </Link>
  );
}
