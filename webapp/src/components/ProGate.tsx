'use client';
/**
 * Wraps a Pro screen: the real content when unlocked; when not, the screen's
 * real layout as a faded, non-interactive preview with one clean card under
 * it that says what Pro adds.
 *
 * Not a blank page and not a redirect — a redirect loses context and breaks
 * the back button. And no blur: blurred figures looked like a rendering bug.
 * The preview fades out towards the bottom and the card sits on that faded
 * band, inside the gate's own box, so it never covers the page header.
 */
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useApp } from '@/lib/store';
import { gateFor, type ProFeature } from '@/lib/entitlement/gates';
import { PRO_COPY } from '@/lib/entitlement/proCopy';
import { Button } from '@/components/ui';

/** What each locked screen is called, and two or three things Pro adds there. */
const LOCKED: Partial<Record<ProFeature, { name: string; points: string[] }>> = {
  taxCentre: { name: 'Tax centre', points: ['Short- and long-term gains for the year', 'What selling a position would cost', 'Realised gains, ready for your CA'] },
  portfolioAnalytics: { name: 'Analytics', points: ['XIRR and benchmark comparison', 'Movers and concentration', 'Profit and loss broken down six ways'] },
  dividends: { name: 'Dividends', points: ['Payouts against the positions that paid them', 'Yield on cost, per holding', 'A ledger of every payout'] },
  watchlist: { name: 'Watchlist', points: ['Track instruments before you buy', 'Prices against the last one you entered'] },
  marketsAndNews: { name: 'Markets and news', points: ['Index levels and sessions', 'Headlines for what you hold'] },
  forecast: { name: 'Forecast', points: ['Balances projected from what you record', 'Recurring income and bills carried forward'] },
  reconcile: { name: 'Reconcile', points: ['Match what you recorded against your bank', 'Find what is missing or duplicated'] },
  formattedExports: { name: 'Reports export', points: ['Formatted Excel workbook and PDF', 'Cash flow, balance sheet and holdings'] },
};

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
  const copy = LOCKED[feature];
  const heading = copy ? `${copy.name} is part of Pro` : (title ?? 'Part of Khazana Pro');
  const points = copy?.points ?? (blurb ? [blurb] : []);

  return (
    <div className="relative grid">
      {/* Still rendered, still real — faded and inert, so nothing behind is
          focusable or read out. The bottom fades away so the card below never
          sits over legible text. */}
      <div
        aria-hidden="true"
        // @ts-expect-error — `inert` is valid HTML; React's types lag.
        inert=""
        className="[grid-area:1/1] pointer-events-none select-none opacity-55 grayscale-[0.2] max-h-[620px] overflow-hidden [mask-image:linear-gradient(180deg,#000_45%,transparent_100%)]"
      >
        {children}
      </div>

      <section
        aria-label={heading}
        className="card relative z-10 [grid-area:1/1] self-end mx-auto mb-4 w-full max-w-[420px] px-5 py-6 text-center"
      >
        <span className="mx-auto mb-3 grid h-[46px] w-[46px] place-items-center rounded-[14px] bg-primary text-[var(--primary-fg)]">
          <Lock size={18} />
        </span>
        <h2 className="text-[17px] font-medium tracking-[-0.01em]">{heading}</h2>
        {usedAllowance ? (
          // Materially different from "this is a Pro feature": it WAS
          // available a moment ago, and pretending otherwise reads as a
          // bait-and-switch.
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            You have used the free import that comes with every vault. Khazana Pro removes the limit.
          </p>
        ) : points.length > 0 && (
          <ul className="mt-3 mb-1 list-disc pl-5 text-left text-[13px] leading-[1.7] text-ink-soft">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <Link href="/pro" className="mt-4 block">
          <Button className="w-full h-11">See what Pro includes</Button>
        </Link>
        <p className="mt-2.5 text-[12px] text-muted">{PRO_COPY.tagline.split('. ').slice(0, 2).join('. ')}.</p>
      </section>
    </div>
  );
}

/** A small lock chip for nav rows and list items. */
export function ProBadge() {
  const isPro = useApp((s) => s.pro.isPro);
  if (isPro) return null;
  return (
    <span className="rounded-full bg-[var(--card-2)] px-1.5 py-[1px] text-[10px] font-medium text-ink-soft shadow-[0_1px_4px_-1px_rgba(0,0,0,0.2)]">
      Pro
    </span>
  );
}
