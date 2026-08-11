'use client';
/**
 * Khazana display primitives.
 *
 * These exist because the same decisions were being made 78 separate times in
 * the app — "is this number green or black", "does this figure need a card
 * around it", "how much space sits under a section heading". Made once, they
 * are a design system. Made 78 times, they are a template.
 *
 * The rule they encode, and the most important one in the whole visual system:
 *
 *   An ordinary financial figure is INK, not green.
 *
 * Colour is reserved for a value whose *sign* is the point — a change, a gain,
 * a loss. Your bank balance is not a success; it is a fact. Colouring every
 * number green is what made green meaningless and made the figures that
 * genuinely need attention impossible to spot.
 */
import type { ReactNode } from 'react';
import type Decimal from 'decimal.js';
import clsx from 'clsx';

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

export type MoneyTone =
  /** A fact. Black. The default, and it should stay the common case. */
  | 'plain'
  /** A change, where up is good. Green when positive, red when negative. */
  | 'delta'
  /** A change, where up is bad — spending, debt. Inverted from `delta`. */
  | 'delta-inverse'
  /** Deliberately de-emphasised: a subtotal, a reference figure. */
  | 'muted';

export interface MoneyValueProps {
  /** Pre-formatted by `useFmt().money` — this component does not format. */
  children: ReactNode;
  tone?: MoneyTone;
  /** The sign that drives `delta` colouring. Ignored for `plain`. */
  sign?: number;
  /** Larger, for a figure that is the point of its section. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Masked mode, so a screen-share shows dots without changing layout. */
  hidden?: boolean;
  className?: string;
}

const SIZES: Record<NonNullable<MoneyValueProps['size']>, string> = {
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'text-[20px] font-semibold tracking-[-0.02em]',
  // The one figure on a screen that is allowed to be large.
  xl: 'text-[32px] font-bold tracking-[-0.03em] leading-[1.1]',
};

function toneColor(tone: MoneyTone, sign: number): string | undefined {
  if (tone === 'muted') return 'var(--muted)';
  if (tone === 'plain') return undefined; // inherits --ink
  if (sign === 0) return 'var(--muted)';
  const good = tone === 'delta' ? sign > 0 : sign < 0;
  return good ? 'var(--income)' : 'var(--expense)';
}

/**
 * A money figure.
 *
 * Always tabular so a column aligns on the decimal — the single detail that
 * carries more perceived professionalism than any amount of styling.
 */
export function MoneyValue({
  children, tone = 'plain', sign = 0, size = 'md', hidden = false, className,
}: MoneyValueProps) {
  return (
    <span
      className={clsx('tnum whitespace-nowrap', SIZES[size], className)}
      style={{ color: hidden ? 'var(--muted)' : toneColor(tone, sign) }}
    >
      {hidden ? '••••••' : children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Sections — the card replacement                                            */
/* -------------------------------------------------------------------------- */

/**
 * A titled region of a page, separated by space and a rule rather than by a box.
 *
 * The app's default composition was a grid of bordered cards, which is the
 * classic generated-dashboard shape and costs a border, a radius and 16px of
 * padding for every group of information. A section costs a line of type.
 * Reach for `GlassCard` only when the thing genuinely is a discrete object.
 */
export function Section({
  title, description, action, children, className, first = false,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drops the leading rule, for the first section on a page. */
  first?: boolean;
}) {
  return (
    <section
      className={clsx(
        !first && 'border-t border-[var(--line)] pt-6 mt-6',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-baseline gap-3 flex-wrap mb-3">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {title}
            </h2>
          )}
          {description && <span className="text-xs text-muted">{description}</span>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Metric — a figure with a label, and no box                                  */
/* -------------------------------------------------------------------------- */

/**
 * One labelled number.
 *
 * The unboxed counterpart to a KPI card. A row of these separated by space
 * reads as a statement; the same row wrapped in bordered cards reads as a
 * dashboard template.
 */
export function Metric({
  label, value, sub, tone = 'plain', sign = 0, size = 'lg', hidden = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: MoneyTone;
  sign?: number;
  size?: MoneyValueProps['size'];
  hidden?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
        {label}
      </div>
      <div className="mt-1">
        <MoneyValue tone={tone} sign={sign} size={size} hidden={hidden}>{value}</MoneyValue>
      </div>
      {sub && <div className="text-[11.5px] text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/** A row of metrics, evenly spaced. Replaces the KPI card grid. */
export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('grid gap-x-8 gap-y-5 grid-cols-2 md:grid-cols-4', className)}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ledger lines — label/value pairs, the shape a statement actually has        */
/* -------------------------------------------------------------------------- */

/**
 * One line of a statement: label on the left, figure on the right, leaders in
 * between. This is what a cash-flow summary should look like — not four cards.
 */
export function LedgerLine({
  label, value, tone = 'plain', sign = 0, emphasis = false, hidden = false,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: MoneyTone;
  sign?: number;
  /** For the total line: heavier, and separated by a rule above. */
  emphasis?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex items-baseline justify-between gap-4 py-1.5',
        emphasis && 'border-t border-[var(--line)] mt-1.5 pt-2.5',
      )}
    >
      <span className={clsx('min-w-0 truncate text-[13.5px]', emphasis ? 'font-semibold' : 'text-ink-soft')}>
        {label}
      </span>
      <MoneyValue
        tone={tone}
        sign={sign}
        size="md"
        hidden={hidden}
        className={emphasis ? 'font-semibold' : undefined}
      >
        {value}
      </MoneyValue>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info';

const STATUS: Record<StatusTone, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--muted)', bg: 'var(--fill)' },
  positive: { fg: 'var(--income)', bg: 'var(--success-soft)' },
  negative: { fg: 'var(--expense)', bg: 'var(--danger-soft)' },
  warning: { fg: 'var(--warn)', bg: 'var(--warning-soft)' },
  info: { fg: 'var(--info)', bg: 'var(--fill)' },
};

/**
 * A state word — Triggered, Paused, Over budget.
 *
 * Small, quiet, and a pill only because a single state word genuinely is a
 * token. It is not a container: nothing that is a sentence goes in here.
 */
export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  const c = STATUS[tone];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] px-2 py-[3px] text-[11px] font-semibold"
      style={{ color: c.fg, background: c.bg }}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The top of every screen: what this is, what period it covers, what you can
 * do here. One component so the answer is in the same place on all of them.
 */
export function PageHeader({
  title, meta, action, children,
}: {
  title: string;
  /** The resolved period or as-of stamp. Never a relative token. */
  meta?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold tracking-[-0.03em] leading-tight">{title}</h1>
        {meta && <p className="text-[13px] text-muted mt-1 tnum">{meta}</p>}
        {children}
      </div>
      {action && <div className="ml-auto flex items-center gap-2 flex-wrap">{action}</div>}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Instrument marks                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The visual anchor on a row that names an instrument.
 *
 * It replaces a 30px coloured square containing the first two letters of the
 * ticker, which appeared on six screens. That pattern is the contact-avatar
 * idiom — Gmail, Slack, every CRM — and it belongs to *people*, whose names
 * have no canonical short form. An instrument already has one: the ticker.
 * Rendering "MA" next to "MANAPPURAM" adds no information, invents a colour
 * per row, and is one of the loudest generic-template signals in the product.
 *
 * What replaces it carries something the ticker does not: asset class, as a
 * quiet 3px rule. Colour means something again, and the row gets its alignment
 * anchor without a decorative box.
 */
export function AssetMark({ colour, title }: { colour?: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title}
      className="block w-[3px] h-[26px] shrink-0 rounded-[2px]"
      style={{ background: colour ?? 'var(--line-strong)' }}
    />
  );
}
