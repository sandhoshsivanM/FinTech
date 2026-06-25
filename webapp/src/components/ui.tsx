'use client';
import { type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type HTMLAttributes } from 'react';
import clsx from 'clsx';

export function GlassCard({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card p-5', className)} {...rest}>{children}</div>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3.5">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

// ---- Buttons ----
type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger';
export function Button({
  children, variant = 'primary', className, type = 'button', ...rest
}: { children: ReactNode; variant?: BtnVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 active:opacity-100',
    soft: 'bg-[var(--fill)] text-ink hover:bg-[var(--fill-strong)]',
    ghost: 'text-ink-soft hover:bg-[var(--fill)] hover:text-ink',
    danger: 'bg-[rgba(192,73,47,0.08)] text-expense hover:bg-[rgba(192,73,47,0.14)]',
  };
  return (
    <button type={type} {...rest}
      className={clsx('focus-ring inline-flex items-center justify-center gap-2 rounded-[11px] px-3.5 py-2 text-[13.5px] font-semibold tracking-tight transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed', styles[variant], className)}>
      {children}
    </button>
  );
}

// ---- Segmented control ----
export function Segmented<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string;
}) {
  return (
    <div className={clsx('inline-flex p-0.5 rounded-[11px] bg-[var(--fill)] border border-[var(--line)] gap-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={clsx('px-3 py-1.5 rounded-[8px] text-[13px] font-semibold tracking-tight transition-colors duration-150',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_var(--fill-strong)]' : 'text-muted hover:text-ink-soft')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Inputs ----
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[11.5px] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'focus-ring w-full rounded-[10px] border border-[var(--line-strong)] bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-muted outline-none transition-shadow';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, 'appearance-none cursor-pointer', props.className)} />;
}

// ---- Progress bar (budget zones) ----
export function ProgressBar({ fraction, color, height = 7 }: { fraction: number; color?: string; height?: number }) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  const c = color ?? (pct > 90 ? 'var(--expense)' : pct >= 70 ? 'var(--warn)' : 'var(--income)');
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'var(--fill-strong)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: c }} />
    </div>
  );
}

// ---- Progress ring (goals / health) ----
export function Ring({ fraction, size = 120, stroke = 11, color = 'var(--accent)', children }: {
  fraction: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-strong)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// ---- Donut (SVG, no chart lib) ----
export interface DonutSeg { label: string; value: number; color: string }

export function Donut({
  segments, size = 150, stroke = 20, centerText, centerSub, legend = true,
}: {
  segments: DonutSeg[]; size?: number; stroke?: number;
  centerText?: string; centerSub?: string; legend?: boolean;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="var(--fill-strong)" strokeWidth={stroke} />
          {total > 0 && segments.map((s, i) => {
            const frac = Math.max(0, s.value) / total;
            const len = frac * c;
            const el = (
              <circle key={i} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - 3)} ${c}`}
                strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        {centerText && (
          <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle"
            className="fill-ink" style={{ fontSize: size > 150 ? 19 : 16, fontWeight: 700, letterSpacing: '-0.02em' }}>{centerText}</text>
        )}
        {centerSub && (
          <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle"
            fill="var(--muted)" style={{ fontSize: 10.5, letterSpacing: '0.04em' }}>{centerSub}</text>
        )}
      </svg>
      {legend && (
        <div className="flex-1 min-w-0 space-y-2.5">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 text-[13.5px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="flex-1 min-w-0 text-ink-soft truncate">{s.label}</span>
              <span className="shrink-0 font-semibold text-ink tnum tabular-nums">{total <= 0 ? '0%' : `${Math.round(s.value / total * 100)}%`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Sparkline (SVG area) ----
export function Sparkline({ values, height = 140, color = 'var(--accent)' }: {
  values: number[]; height?: number; color?: string;
}) {
  if (values.length < 2) return <EmptyChart />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return <EmptyChart />;
  const W = 600;
  const H = height;
  const dx = W / (values.length - 1);
  const y = (v: number) => H - 10 - ((v - min) / (max - min)) * (H - 20);
  const pts = values.map((v, i) => `${i * dx},${y(v)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `${line} L ${W},${H} L 0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EmptyChart() {
  return (
    <div className="h-36 flex flex-col items-center justify-center text-muted text-[13px] gap-1">
      <span className="w-8 h-px bg-[var(--line-strong)]" />
      Not enough data yet
    </div>
  );
}

// ---- Grouped bar chart (reports) ----
export interface BarGroup { label: string; values: { value: number; color: string }[] }
export function Bars({ groups, height = 200, formatY }: { groups: BarGroup[]; height?: number; formatY?: (n: number) => string }) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value)));
  return (
    <div className="flex items-end gap-2.5" style={{ height }}>
      {groups.map((g, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          <div className="flex items-end justify-center gap-1 w-full" style={{ height: height - 22 }}>
            {g.values.map((v, j) => (
              <div key={j} className="rounded-t-[3px] w-2.5 transition-all duration-500"
                title={formatY ? formatY(v.value) : String(v.value)}
                style={{ height: `${(v.value / max) * 100}%`, background: v.color, minHeight: v.value > 0 ? 2 : 0 }} />
            ))}
          </div>
          <span className="text-[10.5px] text-muted truncate w-full text-center">{g.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Summary metric strip (fills space with real numbers, not one lonely stat) ----
export interface StatItem { label: string; value: string; sub?: string; accent?: string }
export function StatStrip({ items }: { items: StatItem[] }) {
  const cols = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' }[items.length] ?? 'md:grid-cols-4';
  return (
    <div className="card p-0 overflow-hidden">
      <div className={clsx('grid grid-cols-2', cols, 'divide-x divide-y md:divide-y-0 divide-[var(--line)]')}>
        {items.map((it, i) => (
          <div key={i} className="px-5 py-4">
            <div className="eyebrow">{it.label}</div>
            <div className="mt-1.5 text-[22px] font-bold tracking-tight tnum truncate" style={it.accent ? { color: it.accent } : undefined}>{it.value}</div>
            {it.sub && <div className="text-[11.5px] text-muted mt-0.5 truncate">{it.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Page header + empty state ----
export function PageIntro({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[27px] leading-none font-bold tracking-[-0.025em] font-display">{title}</h1>
        {subtitle && <p className="text-ink-soft text-[13.5px] mt-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      {icon && <div className="w-11 h-11 rounded-[14px] bg-[var(--fill)] border border-[var(--line)] text-ink-soft grid place-items-center mb-3.5">{icon}</div>}
      <p className="font-semibold text-ink text-[15px]">{title}</p>
      {hint && <p className="text-[13px] text-muted mt-1.5 max-w-sm leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
