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
import { useEffect, useId, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type HTMLAttributes } from 'react';
import clsx from 'clsx';
import { Hint, SectionInfo } from './Hint';
import { CHART } from './charts/tokens';
import { motion, SPRING } from './motion';
import type { SectionKey, TermKey } from './glossary';

/**
 * The standard card.
 *
 * `padded` exists because the old version hard-coded `p-5` and callers fought
 * it with `className="p-0"`. Pass `padded={false}` for a card that owns its own
 * internal padding (a table, a divided list).
 */
export function GlassCard({
  children, className, padded = true, lift = false, interactive = false, ...rest
}: {
  children: ReactNode; className?: string; padded?: boolean; lift?: boolean;
  /** Tappable card: hover lift plus press-down feedback. */
  interactive?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('card', padded && 'p-4 sm:p-5', (lift || interactive) && 'lift', interactive && 'pressable cursor-pointer', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action, info, infoAlign }: {
  title: string; action?: ReactNode;
  /** SECTION_HELP key: renders the ⓘ explaining this card right after the title. */
  info?: SectionKey;
  infoAlign?: 'left' | 'right';
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-1.5 min-w-0">
        <h2 className="text-[17px] font-medium tracking-[-0.015em] text-ink">{title}</h2>
        {info && <SectionInfo k={info} align={infoAlign} />}
      </div>
      {action}
    </div>
  );
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
    // Glossy and raised: a lighter top and a soft drop, so a button reads as
    // something to press rather than a coloured rectangle.
    // The near-black pill (white in dark mode): the one action a screen wants.
    primary: 'btn-raised bg-primary text-[var(--primary-fg)] hover:brightness-110',
    // A raised light pill for everything else.
    secondary: 'btn-soft text-ink hover:border-line-strong',
    ghost: 'text-ink-soft hover:bg-fill hover:text-ink',
    soft: 'btn-soft text-ink hover:border-line-strong',
    danger: 'bg-transparent text-danger border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:bg-danger-soft',
  };
  return (
    <button
      type={type}
      {...rest}
      className={clsx(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-full h-9 px-4',
        'text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard',
        'active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
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
  // One shared layoutId per control, so the selected pill slides between
  // options instead of jumping — and two controls on a page never trade pills.
  const pillId = useId();
  return (
    <div
      role="group"
      className={clsx('inline-flex p-[3px] gap-px rounded-full bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] max-w-full overflow-x-auto no-scrollbar', className)}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={clsx(
              'focus-ring relative shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] tracking-[-0.01em]',
              'transition-colors duration-150 ease-standard',
              on ? 'text-ink font-semibold' : 'text-muted font-medium hover:text-ink',
            )}
          >
            {on && (
              <motion.span
                layoutId={pillId}
                transition={SPRING}
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--card-2)] shadow-[0_3px_8px_-3px_rgba(0,0,0,0.25)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Toggle --------------------------------------------------------------
/** The Zentra switch: green when on, a white knob with a soft drop. */
export function Toggle({ on, onChange, label, disabled }: {
  on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx(
        'focus-ring relative w-[46px] h-7 rounded-full shrink-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] transition-colors duration-[250ms]',
        on ? 'bg-[var(--data-green)]' : 'bg-[color-mix(in_srgb,var(--ink)_14%,transparent)]',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <span
        className={clsx(
          'absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] transition-transform duration-[250ms]',
          on && 'translate-x-[18px]',
        )}
      />
    </button>
  );
}

// ---- Inputs --------------------------------------------------------------
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1.5 block text-[11.5px] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = clsx(
  'focus-ring w-full rounded-[14px] border border-line bg-[var(--card-2)]',
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

/**
 * False on the first paint, true one frame later — so a fill rendered at its
 * final value still animates in from empty. Reduced motion is handled by the
 * global CSS rule that zeroes transition durations.
 */
function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

// ---- Progress bar (budget / coverage / goal) ----------------------------
/**
 * The Zentra gauge: a thick pill in a white recessed track with the value on
 * a % chip at its tip. Blue while fine, amber from 80%, pink when over —
 * unless the caller forces a colour (coverage pages invert the meaning).
 * `height` is accepted for older call sites and ignored: one bar style.
 */
export function ProgressBar({ fraction, color, label }: { fraction: number; color?: string; height?: number; label?: string }) {
  const mounted = useMounted();
  const safe = Number.isFinite(fraction) ? fraction : 0;
  const pct = Math.min(100, Math.max(0, safe * 100));
  const c = color ?? (safe > 1 ? 'var(--data-rose)' : safe >= 0.8 ? 'var(--data-amber)' : 'var(--data-blue)');
  return (
    <div className="gauge-track w-full">
      <div
        className="gauge-fill transition-[width] duration-700 ease-standard"
        style={{ width: mounted ? `max(46px, ${pct}%)` : '46px', ['--g-b' as string]: c }}
      >
        <span className="gauge-chip tnum">{label ?? `${Math.round(safe * 100)}%`}</span>
      </div>
    </div>
  );
}

/**
 * Colour for a "higher is better" part score (health areas, coverage): blue
 * while healthy, amber when it needs work, pink when it is weak. Colour only
 * appears when a part is weak.
 */
export function scoreColor(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return 'var(--muted)';
  return fraction >= 0.7 ? 'var(--data-blue)' : fraction >= 0.4 ? 'var(--data-amber)' : 'var(--data-rose)';
}

// ---- Progress ring (goals / health) -------------------------------------
/**
 * The Zentra score ring: a 270° arc open at the bottom, round caps, a blue
 * gradient (#4691FE → #1C6FFB) with a soft blue glow. The figure sits in the
 * middle, large and light. `color` overrides the gradient's deep end.
 */
export function Ring({ fraction, size = 120, stroke = 11, color = 'var(--data-blue)', children }: {
  fraction: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const mounted = useMounted();
  const ringId = useId().replace(/:/g, '');
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const sweep = c * 0.75;
  const f = mounted ? Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) : 0;
  return (
    <div className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[135deg] overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color === 'var(--data-blue)' ? 'var(--data-blue-a)' : `color-mix(in srgb, ${color} 60%, #fff)`} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="color-mix(in srgb, var(--ink) 8%, transparent)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${sweep} ${c}`}
        />
        {f > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${ringId})`} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${sweep * f} ${c}`}
            style={{
              filter: `drop-shadow(0 5px 6px color-mix(in srgb, ${color} 35%, transparent))`,
              transition: 'stroke-dasharray .9s cubic-bezier(.22,1,.36,1)',
            }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// ---- Chips / pills -------------------------------------------------------
type ChipTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'violet';
export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  const tones: Record<ChipTone, string> = {
    neutral: 'bg-[var(--card-2)] text-ink border-transparent shadow-[0_2px_6px_-2px_rgba(0,0,0,0.18)]',
    accent: 'bg-[color-mix(in_srgb,var(--data-blue)_12%,transparent)] text-[var(--data-blue)] border-transparent',
    success: 'bg-success-soft text-success border-[color-mix(in_srgb,var(--success)_26%,transparent)]',
    danger: 'bg-danger-soft text-danger border-[color-mix(in_srgb,var(--danger)_26%,transparent)]',
    warning: 'bg-warning-soft text-warning border-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
    violet: 'bg-violet-soft text-violet border-[color-mix(in_srgb,var(--violet)_30%,transparent)]',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full border text-[11.5px] font-medium whitespace-nowrap', tones[tone], className)}>
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
export { AreaChart } from './charts/AreaChart';
export { StatTile } from './charts/StatTile';
export { Gauge } from './charts/Gauge';
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
                        // Striped at rest, solid when hovered: the Zentra rule.
                        background: hover === i
                          ? v.color
                          : `repeating-linear-gradient(-45deg, ${v.color} 0 2px, transparent 2px 5px), color-mix(in srgb, ${v.color} 22%, transparent)`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <span
                className={clsx(
                  'text-[11px] truncate max-w-full transition-colors',
                  hover === i ? 'font-semibold text-ink' : 'text-muted',
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
    <div className="card p-2">
      <div className={clsx('grid grid-cols-2 gap-2', cols)}>
        {items.map((it, i) => (
          <div key={i} className="inset px-4 py-3 min-w-0">
            <div className="flex items-center gap-1">
              <div className="text-[12.5px] text-muted truncate">{it.label}</div>
              {it.term && <Hint term={it.term} className="shrink-0" />}
            </div>
            <div
              className="mt-1.5 text-[clamp(16px,4.4vw,22px)] font-light tracking-[-0.02em] tnum truncate"
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
export function PageIntro({ title, subtitle, action, info }: {
  title: string; subtitle?: string; action?: ReactNode;
  /**
   * SECTION_HELP key for a screen that is one list with no card titles of its
   * own (transactions, the add form): the ⓘ then explains the screen itself.
   */
  info?: SectionKey;
}) {
  return (
    <div className="flex items-end gap-4 flex-wrap mb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-[32px] leading-[1.1] font-normal tracking-[-0.03em] font-display">{title}</h1>
          {info && <SectionInfo k={info} />}
        </div>
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
        <div className="w-12 h-12 rounded-full bg-[var(--card-2)] shadow-[0_3px_10px_-4px_rgba(0,0,0,0.2)] text-ink-soft grid place-items-center mb-4">
          {icon}
        </div>
      )}
      <p className="font-medium text-ink text-[16px]">{title}</p>
      {hint && <p className="text-[13px] text-muted mt-2 max-w-sm leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
