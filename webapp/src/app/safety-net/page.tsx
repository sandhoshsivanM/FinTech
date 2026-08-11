'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { PiggyBank, Landmark, ArrowRight } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { safetyNet, type SafetyComponent } from '@/domain/safetyNet';
import { investmentTotals } from '@/domain/investmentTotals';
import { ASSET_META } from '@/domain/portfolio';
import { D } from '@/lib/money';
import {
  PageIntro, GlassCard, SectionHeader, StatStrip, Ring, ProgressBar, EmptyState, Button,
} from '@/components/ui';

const RETIREMENT = new Set(['fd', 'ppf_epf', 'nps']);
const coverColor = (pct: number) =>
  pct >= 100 ? 'var(--income)' : pct >= 60 ? 'var(--warn)' : 'var(--expense)';

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
  const ringColor = sn.score >= 70 ? 'var(--income)' : sn.score >= 40 ? 'var(--warn)' : 'var(--expense)';

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
              <div className="text-[28px] font-extrabold leading-none" style={{ color: ringColor }}>{sn.score}</div>
              <div className="text-[11px] font-semibold text-muted mt-0.5">{sn.grade}</div>
            </div>
          </Ring>
          <div className="flex-1">
            <div className="eyebrow">Safety-net readiness</div>
            <p className="mt-1 text-[15px] text-ink-soft leading-relaxed">{sn.summary}</p>
          </div>
        </div>
      </GlassCard>

      <StatStrip items={[
        { label: 'Emergency fund', value: m(emergency.current), sub: `${sn.monthsCovered.toFixed(1)} mo of expenses` },
        { label: 'Life cover', value: `${Math.min(999, life.coveredPct)}%`, sub: m(life.current), accent: coverColor(life.coveredPct) },
        { label: 'Health cover', value: `${Math.min(999, health.coveredPct)}%`, sub: m(health.current), accent: coverColor(health.coveredPct) },
        { label: 'Annual premiums', value: m(sn.premium), sub: `${insurances.length} polic${insurances.length === 1 ? 'y' : 'ies'}` },
      ]} />

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Emergency fund */}
        <GlassCard>
          <SectionHeader title="Emergency fund" action={<CardLink href="/goals" label="Goals" />} />
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-9 h-9 rounded-[var(--radius-card)] grid place-items-center bg-income/12 text-income"><PiggyBank size={18} /></span>
            <div className="text-[22px] font-bold tnum">{m(emergency.current)}</div>
            <div className="text-sm text-muted">of {m(emergency.recommended)} target</div>
          </div>
          <ProgressBar fraction={emergency.coveredPct / 100} color={coverColor(emergency.coveredPct)} height={8} />
          <p className="text-[12.5px] text-ink-soft mt-2">{emergency.detail}</p>
          {emergency.gap.gt(0) && (
            <p className="text-[12.5px] text-muted mt-0.5">{m(emergency.gap)} to reach ~6 months of expenses.</p>
          )}
        </GlassCard>

        {/* Insurance cover */}
        <GlassCard>
          <SectionHeader title="Insurance cover" action={<CardLink href="/insurance" label="Insurance" />} />
          <div className="space-y-3.5">
            {[life, health].map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13.5px] font-medium">{c.label}</span>
                  <span className="text-[13px] font-semibold tnum" style={{ color: coverColor(c.coveredPct) }}>{Math.min(999, c.coveredPct)}%</span>
                </div>
                <ProgressBar fraction={c.coveredPct / 100} color={coverColor(c.coveredPct)} height={6} />
                <div className="text-[11.5px] text-muted mt-1">
                  {m(c.current)} of {m(c.recommended)} recommended{c.gap.gt(0) ? ` · ${m(c.gap)} short` : ' · covered'}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 pt-3 border-t border-[var(--line)]">
            Guideline only, not advice — life ≈ 10× annual income; health ≥ ₹5L. Premiums: {m(sn.premium)}/yr.
          </p>
        </GlassCard>
      </div>

      {/* Safe & retirement assets */}
      <GlassCard>
        <SectionHeader title="Safe & retirement assets" action={<CardLink href="/investments" label="Investments" />} />
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
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: ASSET_META[h.assetType].color + '1a', color: ASSET_META[h.assetType].color }}>
                  {ASSET_META[h.assetType].label}
                </span>
                <span className="flex-1 min-w-0 truncate font-medium">{h.symbol}</span>
                <span className="font-semibold tnum">
                  {m(value)}
                  {atCost && <span className="ml-1 text-[11px] font-normal text-muted">at cost</span>}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2.5 mt-0.5">
              <span className="text-sm text-ink-soft">Total safe & retirement</span>
              <span className="font-bold tnum">{m(retireHoldings.reduce((s, r) => s.plus(r.value), D(0)))}</span>
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
    <Link href={href} className="inline-flex items-center gap-1 text-accent text-[13px] font-semibold hover:gap-1.5 transition-all">
      {label} <ArrowRight size={14} />
    </Link>
  );
}
