'use client';
/**
 * The component library.
 *
 * Every export here keeps the name and signature it had before the redesign, so
 * the pages that import it did not have to change — what changed is the styling
 * and the internals. New tokens (`--card`, `--radius-btn`, `--shadow-*`) are
 * published through `@theme` in globals.css, so components spell them as
 * `bg-card` / `rounded-btn` rather than as arbitrary `[var(--…)]` values.
 */
import { useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type HTMLAttributes } from 'react';
import clsx from 'clsx';
import { Hint } from './Hint';
import { CHART } from './charts/tokens';
import type { TermKey } from '@/lib/glossary';

/**
 * The standard card.
 *
 * `padded` exists because the old version hard-coded `p-5` and callers fought
 * it with `className="p-0"`. Pass `padded={false}` for a card that owns its own
 * internal padding (a table, a divided list).
 */
export function GlassCard({
  children, className, padded = true, lift = false, ...rest
}: { children: ReactNode; className?: string; padded?: boolean; lift?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('card', padded && 'p-5', lift && 'lift', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** Uppercase overline used above a figure. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('eyebrow', className)}>{children}</div>;
}

// ---- Buttons -------------------------------------------------------------
/**
 * Three variants. Not fifteen.
 *
 *   primary   — emerald fill. The one action a screen most wants you to take.
 *   secondary — transparent with a border. Everything else.
 *   ghost     — no chrome. Tertiary and in-table actions.
 *
 * `soft` and `danger` are kept as aliases so the ~40 existing call sites do not
 * all have to change in one commit: `soft` maps to secondary, and `danger`
 * is secondary tinted with the danger token rather than a fourth shape.
 */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';

export function Button({
  children, variant = 'primary', className, type = 'button', ...rest
}: { children: ReactNode; variant?: BtnVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<BtnVariant, string> = {
    // Emerald is the INTERACTION colour. Gold is identity and never lands here.
    primary: 'bg-primary text-[var(--primary-fg)] hover:bg-[var(--accent-deep)]',
    secondary: 'bg-transparent text-ink border border-line-strong hover:border-[var(--accent)] hover:text-accent',
    ghost: 'text-ink-soft hover:bg-fill hover:text-ink',
    soft: 'bg-transparent text-ink border border-line-strong hover:border-[var(--accent)] hover:text-accent',
    danger: 'bg-transparent text-danger border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:bg-danger-soft',
  };
  return (
    <button
      type={type}
      {...rest}
      className={clsx(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-btn h-9 px-3.5',
        'text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard',
        'active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0',
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---- Segmented control ---------------------------------------------------
export function Segmented<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div
      role="group"
      className={clsx('inline-flex p-[3px] gap-px rounded-[var(--radius-card)] bg-fill max-w-full overflow-x-auto no-scrollbar', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'focus-ring shrink-0 px-3 py-1.5 rounded-[var(--radius-btn)] text-[12.5px] font-semibold tracking-[-0.01em]',
            'transition-colors duration-150 ease-standard',
            value === o.value ? 'bg-surface text-ink shadow-[var(--shadow-1)]' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Inputs --------------------------------------------------------------
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-[11.5px] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = clsx(
  'focus-ring w-full rounded-input border border-line-strong bg-surface',
  'px-3 h-[38px] text-sm text-ink placeholder:text-muted outline-none',
  'transition-[border-color,box-shadow] duration-150 ease-standard',
  'hover:border-[color-mix(in_srgb,var(--ink)_22%,transparent)]',
);

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, 'appearance-none cursor-pointer', props.className)} />;
}

// ---- Progress bar (budget zones) ----------------------------------------
export function ProgressBar({ fraction, color, height = 7 }: { fraction: number; color?: string; height?: number }) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  // Zone colour when the caller does not force one: over budget, near it, or fine.
  const c = color ?? (pct > 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)');
  return (
    <div className="w-full rounded-full overflow-hidden bg-fill-strong" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-standard"
        style={{ width: `${pct}%`, background: c }}
      />
    </div>
  );
}

// ---- Progress ring (goals / health) -------------------------------------
export function Ring({ fraction, size = 120, stroke = 11, color = 'var(--accent)', children }: {
  fraction: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <div className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-strong)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// ---- Chips / pills -------------------------------------------------------
type ChipTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'violet';
export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  const tones: Record<ChipTone, string> = {
    neutral: 'bg-fill text-ink-soft border-line',
    accent: 'bg-accent-soft text-accent border-accent-line',
    success: 'bg-success-soft text-success border-[color-mix(in_srgb,var(--success)_26%,transparent)]',
    danger: 'bg-danger-soft text-danger border-[color-mix(in_srgb,var(--danger)_26%,transparent)]',
    warning: 'bg-warning-soft text-warning border-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
    violet: 'bg-violet-soft text-violet border-[color-mix(in_srgb,var(--violet)_30%,transparent)]',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full border text-[11px] font-semibold whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

/**
 * A signed change, coloured and shaped by direction.
 *
 * The arrow matters: colour alone would fail for a colourblind reader, so the
 * glyph carries the same information.
 */
export function Delta({ value, suffix = '%', digits = 2, className }: {
  value: number | null; suffix?: string; digits?: number; className?: string;
}) {
  if (value == null) return <span className={clsx('text-muted text-[11.5px]', className)}>—</span>;
  const up = value > 0, down = value < 0;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[11.5px] font-semibold tnum',
        up && 'bg-success-soft text-success',
        down && 'bg-danger-soft text-danger',
        !up && !down && 'bg-fill text-muted',
        className,
      )}
    >
      <span aria-hidden="true">{up ? '↑' : down ? '↓' : '·'}</span>
      {Math.abs(value).toFixed(digits)}{suffix}
    </span>
  );
}

// ---- Charts --------------------------------------------------------------
// These live in ./charts/. Re-exported here so every existing import site keeps
// working; new code should import from ./charts directly.
export { Donut, type DonutSeg } from './charts/Donut';
export { AreaChart, EmptyChart } from './charts/AreaChart';
export { StatTile } from './charts/StatTile';
export { Gauge, HEALTH_BANDS, type GaugeBand } from './charts/Gauge';
export { Sunburst, type SunburstNode } from './charts/Sunburst';

/** @deprecated Renamed to `AreaChart` — it draws a filled area, not a bare line. */
export { AreaChart as Sparkline } from './charts/AreaChart';

// ---- Grouped bar chart (reports) ----------------------------------------
export interface BarGroup { label: string; values: { value: number; color: string }[] }
export function Bars({ groups, height = 200, formatY }: { groups: BarGroup[]; height?: number; formatY?: (n: number) => string }) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value)));
  const fmt = (n: number) => (formatY ? formatY(n) : String(n));
  // A `title` attribute is an OS tooltip: it waits a second, is styled by the
  // platform, and never appears on a touch screen at all. Hovering a bar has
  // to state its figure in the chart itself.
  const [hover, setHover] = useState<number | null>(null);

  // The same budget ColumnChart reserves: an 11px label on the body's 1.5
  // line-height is a 16.5px line box, plus the 6px gap above it. The old 22 was
  // half a pixel short, so the chart rendered taller than the caller asked for.
  const plotH = height - 26;
  // The readout gets a reserved strip rather than floating over the plot. It
  // used to sit at `-top-1`, which overlaps the top 12px of the chart — and
  // since nothing pads `max`, the tallest bar reaches exactly y=0 and wore it.
  const readoutH = 18;
  const barsH = plotH - readoutH;

  return (
    <div
      role="img"
      aria-label={
        `${groups.length} periods: ` +
        groups.map((g) => `${g.label}, ${g.values.map((v) => fmt(v.value)).join(' and ')}`).join('; ')
      }
      className="relative"
      onMouseLeave={() => setHover(null)}
    >
      {/* The rule the bars are read against. Implied is not good enough: next to
          a ₹6,655 bar, a ₹121 one is a 3px mark, and with nothing beneath it
          that mark reads as floating rather than as a small value sitting on
          zero. */}
      <span aria-hidden className="absolute left-0 right-0 h-px bg-line-strong" style={{ top: plotH }} />
      <div className="flex items-stretch gap-2">
        {groups.map((g, i) => {
          // The readout is centred on its own column, then slid by a fraction of
          // ITS OWN width interpolated from the group's position in the row: the
          // first group's readout starts at its centre, the last one's ends
          // there, everything between is proportional. That keeps it inside the
          // card at both edges and at twelve groups, and it measures nothing.
          const t = groups.length > 1 ? i / (groups.length - 1) : 0.5;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1.5 min-w-0 cursor-default"
              onMouseEnter={() => setHover(i)}
              style={{ opacity: hover == null || hover === i ? 1 : 0.4, transition: 'opacity 120ms ease' }}
            >
              <div className="w-full flex flex-col items-center" style={{ height: plotH }}>
                <div
                  className="w-full flex items-center justify-center pointer-events-none"
                  style={{ height: readoutH }}
                >
                  {hover === i && (
                    <span
                      className="whitespace-nowrap text-[12px] font-semibold tnum"
                      style={{ transform: `translateX(${(0.5 - t) * 100}%)` }}
                    >
                      <span className="text-muted font-normal">{g.label}</span>
                      {g.values.map((v, j) => (
                        <span key={j} className="ml-2.5" style={{ color: v.color }}>{fmt(v.value)}</span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="w-full flex items-end justify-center gap-[2px]" style={{ height: barsH }}>
                  {g.values.map((v, j) => (
                    <div
                      key={j}
                      // 4px data-end radius, anchored to the baseline; the 2px
                      // gap between adjacent fills is the surface showing
                      // through. The 3px floor keeps a small but real value
                      // visible; zero still draws nothing at all.
                      className="w-full min-w-[5px] rounded-t-[4px] transition-[height] duration-500 ease-standard"
                      style={{
                        height: v.value > 0 ? Math.max((v.value / max) * barsH, 3) : 0,
                        maxWidth: CHART.maxBarThickness,
                        background: v.color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <span
                className={clsx(
                  'text-[11px] truncate max-w-full transition-colors',
                  hover === i ? 'font-bold text-ink' : 'font-semibold text-muted',
                )}
              >
                {g.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Summary metric strip -----------------------------------------------
export interface StatItem {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  /** Glossary entry explaining the label, shown behind an (i). */
  term?: TermKey;
}
export function StatStrip({ items }: { items: StatItem[] }) {
  // 6 and 7 are real counts: the design spec's KPI strip carries five to seven
  // cells across the well. Without them the map fell through to `md:grid-cols-4`
  // and a seven-cell strip silently wrapped to two rows.
  const cols = {
    2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4',
    5: 'md:grid-cols-5', 6: 'md:grid-cols-3 xl:grid-cols-6',
    7: 'md:grid-cols-4 xl:grid-cols-7',
  }[items.length] ?? 'md:grid-cols-4';
  return (
    // NOT `overflow-hidden`. The rounded corners are what that was for, and
    // `rounded-[inherit]` on the inner grid clips them just as well — while
    // `overflow-hidden` also clipped every Hint popover opened inside a cell.
    <div className="card">
      <div className={clsx('grid grid-cols-2 rounded-[inherit]', cols, 'divide-x divide-y md:divide-y-0 divide-line')}>
        {items.map((it, i) => (
          <div key={i} className="px-5 py-4 min-w-0">
            <div className="flex items-center gap-1">
              <div className="eyebrow truncate">{it.label}</div>
              {it.term && <Hint term={it.term} className="shrink-0" />}
            </div>
            <div
              className="mt-2 text-[22px] font-bold tracking-[-0.035em] tnum truncate"
              style={it.accent ? { color: it.accent } : undefined}
            >
              {it.value}
            </div>
            {it.sub && <div className="text-[11.5px] text-muted mt-0.5 truncate">{it.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Page header + empty state ------------------------------------------
export function PageIntro({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end gap-4 flex-wrap mb-6">
      <div className="min-w-0">
        <h1 className="text-[var(--fs-h1)] leading-[1.15] font-bold tracking-[-0.03em] font-display">{title}</h1>
        {subtitle && <p className="text-ink-soft text-sm mt-1.5">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto flex items-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      {icon && (
        <div className="w-12 h-12 rounded-[16px] bg-fill border border-line text-ink-soft grid place-items-center mb-4">
          {icon}
        </div>
      )}
      <p className="font-semibold text-ink text-[15px]">{title}</p>
      {hint && <p className="text-[13px] text-muted mt-2 max-w-sm leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
