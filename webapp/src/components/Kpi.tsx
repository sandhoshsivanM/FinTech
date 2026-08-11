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
import clsx from 'clsx';
import { AnimatedNumber } from './motion';

export type KpiTone = 'accent' | 'success' | 'danger' | 'warning' | 'violet';

const TONE: Record<KpiTone, string> = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  violet: 'bg-violet-soft text-violet',
};

export function Kpi({
  label, value, numeric, format, icon: Icon, tone = 'accent', footer, className,
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
}) {
  const untracked = numeric == null && (value == null || value === '');
  return (
    <div className={clsx('card lift p-4 grid gap-2.5 content-start min-w-0', className)}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={clsx('w-7 h-7 shrink-0 rounded-[var(--radius-btn)] grid place-items-center', TONE[tone])}>
          <Icon size={15} strokeWidth={2} />
        </span>
        <span className="text-[11.5px] font-semibold text-ink-soft truncate">{label}</span>
      </div>

      <div className="text-[23px] font-bold tracking-[-0.035em] leading-[1.05] whitespace-nowrap tnum">
        {untracked ? (
          <span className="text-muted">—</span>
        ) : numeric != null ? (
          <AnimatedNumber value={numeric} format={format} />
        ) : (
          value
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11.5px] text-muted min-w-0 whitespace-nowrap overflow-hidden">
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
