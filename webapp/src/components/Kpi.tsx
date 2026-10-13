'use client';
/**
 * The KPI tile.
 *
 * A tile shows a SHORT figure (₹4.83 Cr) and puts the exact one in the footer,
 * because seven of these sit in a row and a full rupee figure at 23px does not
 * fit 220px without wrapping. Nothing is truncated away entirely — the precise
 * number is always somewhere on the tile.
 *
 * `value === null` renders an em-dash, never a zero. That is the same
 * null-honesty rule the Gauge enforces: "we have not tracked this" and "this is
 * zero" are different claims and must not look alike.
 */
import type { LucideIcon } from 'lucide-react';
import { Hint } from './Hint';
import type { TermKey } from '@/lib/glossary';
import clsx from 'clsx';
import { AnimatedNumber } from './motion';
import { GlossTile, type Hue } from './home/depth';

export type KpiTone = 'accent' | 'success' | 'danger' | 'warning' | 'violet';

const TONE: Record<KpiTone, Hue> = {
  accent: 'blue',
  success: 'green',
  danger: 'pink',
  warning: 'amber',
  violet: 'blue',
};

export function Kpi({
  label, value, numeric, format, icon: Icon, tone = 'accent', footer, className, term,
}: {
  label: string;
  /** Pre-formatted display value. Ignored when `numeric` is given. */
  value?: string | null;
  /** Raw figure — counts up on mount, formatted with `format`. */
  numeric?: number | null;
  format?: (n: number) => string;
  icon: LucideIcon;
  tone?: KpiTone;
  footer?: React.ReactNode;
  className?: string;
  /**
   * Glossary entry explaining the label, shown behind an (i).
   *
   * Named `term`, not `hint`: `Field` and `EmptyState` already use `hint` for
   * plain helper text, and two props with the same name and different meanings
   * is how a call site ends up passing prose where a key belongs.
   */
  term?: TermKey;
}) {
  const untracked = numeric == null && (value == null || value === '');
  return (
    <div className={clsx('card lift !rounded-[18px] p-3.5 grid gap-1.5 content-start min-w-0', className)}>
      <div className="flex items-center gap-1.5 min-w-0">
        {/* The Hint sits OUTSIDE the label span: that span is `truncate`, and a
            popover trigger inside a truncating box gets clipped away exactly
            when the label is long enough to need explaining. */}
        <span className="text-[12.5px] text-muted truncate">{label}</span>
        {term && <Hint term={term} className="shrink-0" />}
        {/* A plain tinted circle — no gloss. */}
        <GlossTile hue={TONE[tone]} size={26} className="ml-auto">
          <Icon size={13} strokeWidth={2.2} />
        </GlossTile>
      </div>

      <div className="mt-1 text-[22px] font-light tracking-[-0.02em] leading-[1.1] whitespace-nowrap tnum">
        {untracked ? (
          <span className="text-muted">—</span>
        ) : numeric != null ? (
          <AnimatedNumber value={numeric} format={format} />
        ) : (
          value
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[12px] text-muted min-w-0 whitespace-nowrap overflow-hidden">
        {untracked ? <span>Not yet tracked</span> : footer}
      </div>
    </div>
  );
}

/** Responsive KPI row: 7-up on wide desktops, 4-up, then 2-up on phones. */
export function KpiRow({ children, cols = 7 }: { children: React.ReactNode; cols?: 4 | 5 | 6 | 7 }) {
  const wide = { 4: 'min-[1280px]:grid-cols-4', 5: 'min-[1280px]:grid-cols-5', 6: 'min-[1280px]:grid-cols-6', 7: 'min-[1440px]:grid-cols-7' }[cols];
  return (
    <div className={clsx('grid gap-3 min-w-0 grid-cols-2 min-[760px]:grid-cols-3 min-[1024px]:grid-cols-4', wide)}>
      {children}
    </div>
  );
}
