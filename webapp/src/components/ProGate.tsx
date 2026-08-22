'use client';
/**
 * Wraps a Pro screen: the real content when unlocked, and the real content
 * *blurred behind a card* when not.
 *
 * Not a blank page and not a redirect. A redirect loses the user's context and
 * breaks the back button — they clicked "Tax Centre" and landed somewhere else,
 * which reads as a bug. And someone who can faintly see their own figures
 * through the glass converts; someone shown an empty room with a price on it
 * does not. The data is already on their device; blurring is honest about that,
 * where hiding it entirely pretends there is nothing there.
 */
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useApp } from '@/lib/store';
import { gateFor, type ProFeature } from '@/lib/entitlement/gates';
import { GlassCard, Button } from '@/components/ui';

export function ProGate({
  feature,
  title,
  blurb,
  children,
}: {
  feature: ProFeature;
  title?: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  const pro = useApp((s) => s.pro);
  const decision = gateFor(feature, pro);
  if (decision.allowed) return <>{children}</>;

  const usedAllowance = decision.reason === 'allowanceUsed';

  return (
    <div className="relative">
      {/* Still rendered, still real. aria-hidden and inert so a screen reader
          is not read a wall of figures the user cannot act on, and nothing
          behind the glass is focusable. */}
      <div
        aria-hidden="true"
        // @ts-expect-error — `inert` is valid HTML; React's types lag.
        inert=""
        className="pointer-events-none select-none blur-[7px] opacity-45"
      >
        {children}
      </div>

      <div className="absolute inset-0 grid place-items-center p-6">
        <GlassCard className="max-w-[420px] text-center">
          <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent">
            <Lock size={18} />
          </span>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
            {title ?? 'Part of Khazana Pro'}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            {usedAllowance
              ? // Materially different from "this is a Pro feature", and the
                // difference matters: it WAS available a moment ago, and
                // pretending otherwise reads as a bait-and-switch.
                'You have used the free import that comes with every vault. Khazana Pro removes the limit.'
              : blurb ??
                'A one-time purchase unlocks this, and everything else in Pro, forever.'}
          </p>
          <div className="mt-4">
            <Link href="/pro">
              <Button variant="soft">See what Pro includes</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/** A small lock chip for nav rows and list items. */
export function ProBadge() {
  const isPro = useApp((s) => s.pro.isPro);
  if (isPro) return null;
  return (
    <span className="rounded-full bg-accent-soft px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
      Pro
    </span>
  );
}
