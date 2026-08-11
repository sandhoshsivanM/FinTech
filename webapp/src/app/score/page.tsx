'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@/lib/store';
import { healthScore, type HealthCategory } from '@/domain/health';
import { liquidBalance } from '@/domain/accountLedger';
import { investmentTotals } from '@/domain/investmentTotals';
import { PageIntro, GlassCard, SectionHeader, ProgressBar, Button, Gauge, AreaChart } from '@/components/ui';

/** Where each category's data comes from, so an untracked card can point somewhere. */
const CTA: Record<string, { href: string; label: string }> = {
  wealth: { href: '/investments', label: 'Add a holding' },
  protection: { href: '/insurance', label: 'Add a policy' },
  efficiency: { href: '/budget', label: 'Set a budget' },
  future: { href: '/goals', label: 'Add a goal' },
};

const band = (f: number) =>
  f >= 0.7 ? 'var(--income)' : f >= 0.4 ? 'var(--warn)' : 'var(--expense)';

export default function ScorePage() {
  const txns = useApp((s) => s.txns);
  const holdings = useApp((s) => s.holdings);
  const liabilities = useApp((s) => s.liabilities);
  const goals = useApp((s) => s.goals);
  const insurances = useApp((s) => s.insurances);
  const budgets = useApp((s) => s.budgets);
  const snapshots = useApp((s) => s.snapshots);
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);

  const health = useMemo(
    () => healthScore({
      txns,
      investments: investmentTotals(holdings),
      liabilities,
      goals,
      insurances,
      budgets,
      snapshots,
      cash: liquidBalance(accounts, postings),
    }),
    [txns, holdings, liabilities, goals, insurances, budgets, snapshots, accounts, postings],
  );

  // Days with no score are skipped rather than plotted at zero — the chart shows
  // the scores that existed, not a dip on every day the app had no opinion.
  const history = useMemo(
    () => [...snapshots]
      .sort((a, b) => a.date - b.date)
      .map((s) => s.healthScore)
      .filter((v): v is number => v != null),
    [snapshots],
  );

  return (
    <div className="space-y-6">
      <PageIntro
        title="Financial Health"
        subtitle="Your financial health score and the four areas behind it."
      />

      <GlassCard className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Gauge value={health.score} size={200} sublabel={health.grade ?? undefined} untrackedLabel="Not yet scored" />
          <div className="flex-1 text-center sm:text-left">
            {health.partial && (
              // The denominator, stated. This is what lets the number stay
              // comparable week to week without overclaiming what it covers.
              <div className="eyebrow mb-1.5">
                Based on {health.trackedCategoryCount} of {health.categories.length} areas
              </div>
            )}
            <p className="text-[15px] text-ink-soft leading-relaxed">{health.summary}</p>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-3">
        {health.categories.map((c) => <CategoryCard key={c.key} category={c} />)}
      </div>

      <GlassCard>
        <SectionHeader title="Score history" />
        <AreaChart values={history} height={130} emptyLabel="Your score trend will appear here" format={(n) => String(Math.round(n))} />
      </GlassCard>

      <div className="flex flex-wrap gap-2.5">
        {/* Reports lost its bottom-bar slot to this page, so it keeps a way back
            here as well as on the Overview. */}
        <Link href="/reports"><Button variant="soft">Full reports <ArrowRight size={15} /></Button></Link>
        <Link href="/safety-net"><Button variant="ghost">Safety Net <ArrowRight size={15} /></Button></Link>
      </div>
    </div>
  );
}

/** One category, expanding in place — opening it is disclosure, not navigation. */
function CategoryCard({ category }: { category: HealthCategory }) {
  const [open, setOpen] = useState(false);
  const tracked = category.tracked;
  const fraction = category.fraction ?? 0;
  const cta = CTA[category.key];

  return (
    <GlassCard className="p-0 overflow-hidden">
      <button
        type="button"
        // An untracked category has nothing to disclose; making it expandable
        // would promise detail that is not behind it.
        onClick={tracked ? () => setOpen((o) => !o) : undefined}
        disabled={!tracked}
        aria-expanded={tracked ? open : undefined}
        className={clsx(
          'w-full text-left px-5 py-4',
          tracked && 'focus-ring hover:bg-[var(--fill)] transition-colors',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 font-semibold text-[15px] tracking-tight">{category.label}</span>
          <span className={clsx('text-[13px] tnum', tracked ? 'font-semibold text-ink' : 'text-muted')}>
            {tracked ? `${Math.round(category.score as number)}/${category.weight}` : 'Not yet tracked'}
          </span>
          {tracked && (
            <ChevronDown size={16} className={clsx('text-muted transition-transform', open && 'rotate-180')} />
          )}
        </div>
        <div className="mt-2.5">
          <ProgressBar
            fraction={fraction}
            color={tracked ? band(fraction) : 'transparent'}
            height={6}
          />
        </div>
        <p className="text-[12.5px] text-muted mt-1.5">{category.detail}</p>
      </button>

      {/* The CTA sits outside the header button, not inside it. Nesting one
          interactive element in another is invalid HTML and leaves keyboard and
          screen-reader users unable to reach the inner one. */}
      {!tracked && cta && (
        <div className="px-5 pb-4 -mt-1">
          <Link href={cta.href}>
            <Button variant="soft">{cta.label} <ArrowRight size={14} /></Button>
          </Link>
        </div>
      )}

      {tracked && open && (
        <div className="px-5 pb-4 space-y-3 border-t border-[var(--line)] pt-3.5">
          {category.metrics.map((m) => (
            <div key={m.key} className="flex gap-2.5">
              <span
                className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                style={{ background: m.value === null ? 'var(--muted)' : band(m.value) }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 text-[13.5px] font-medium">{m.label}</span>
                  <span className="text-[12px] text-muted tnum">
                    {/* No percentage for an untracked metric — a number here
                        would be exactly the fabrication this design avoids. */}
                    {m.value === null ? 'Not tracked' : `${Math.round(m.value * 100)}%`}
                  </span>
                </div>
                <p className="text-[12px] text-muted mt-0.5">{m.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
