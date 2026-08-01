'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageIntro, GlassCard, Button } from '@/components/ui';

/**
 * The Score page: the weekly "why" behind the Overview's grade.
 *
 * Placeholder. The real page lands once the four-category health score exists —
 * building it against the current four pillars (savings / buffer / debt /
 * investing) would mean writing the category cards twice.
 *
 * It ships as a stub rather than as a missing route so the navigation
 * restructure is complete and verifiable on its own: every screen reachable,
 * every tab resolving, before any of them changes what it renders.
 */
export default function ScorePage() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Score"
        subtitle="Your financial health score and the four areas behind it."
      />
      <GlassCard className="p-6">
        <p className="text-[15px] text-ink-soft leading-relaxed">
          The full breakdown lands here shortly. For now, the score and its
          categories are on the Overview.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/dashboard"><Button variant="soft">Overview <ArrowRight size={15} /></Button></Link>
          <Link href="/reports"><Button variant="ghost">Full reports <ArrowRight size={15} /></Button></Link>
          <Link href="/safety-net"><Button variant="ghost">Safety Net <ArrowRight size={15} /></Button></Link>
        </div>
      </GlassCard>
    </div>
  );
}
