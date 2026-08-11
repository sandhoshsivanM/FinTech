'use client';
import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * One "label + big number" card. The web twin of Flutter's `StatTile`, matching
 * it field for field so the two clients can't drift on what a stat tile shows.
 *
 * `StatStrip` remains the row form (one bordered card, N divided cells); this is
 * the grid form (N separate cards). Neither wraps the other — they lay out
 * differently enough that sharing an implementation would mean a flag argument
 * that changes everything.
 */
export function StatTile({
  label,
  value,
  footer,
  icon,
  iconColor,
  valueColor,
  emphasise = false,
  ghost = false,
  semanticValue,
  onClick,
  className,
}: {
  label: string;
  /** Already formatted for display. Ignored when `ghost`. */
  value: string;
  footer?: string;
  icon?: ReactNode;
  iconColor?: string;
  valueColor?: string;
  emphasise?: boolean;
  /** Hides the amount from shoulder-surfers; the label still reads. */
  ghost?: boolean;
  /** Spoken form for assistive tech. Falls back to `value`. */
  semanticValue?: string;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      aria-label={ghost ? `${label} hidden` : `${label} ${semanticValue ?? value}`}
      className={clsx(
        'card px-5 py-4 text-left w-full',
        onClick && 'focus-ring hover:bg-[var(--fill)] transition-colors duration-150',
        className,
      )}
    >
      <div aria-hidden>
        {icon && (
          <div
            className="w-[34px] h-[34px] rounded-[var(--radius-card)] grid place-items-center mb-2"
            style={{ background: `color-mix(in srgb, ${iconColor ?? 'var(--accent)'} 12%, transparent)`, color: iconColor ?? 'var(--accent)' }}
          >
            {icon}
          </div>
        )}
        <div className="eyebrow truncate">{label}</div>
        <div
          className={clsx('mt-1.5 font-bold tracking-tight tnum tabular-nums truncate', emphasise ? 'text-[22px]' : 'text-[19px]')}
          style={valueColor ? { color: valueColor } : undefined}
        >
          {ghost ? '••••••' : value}
        </div>
        {footer && <div className="text-[11.5px] text-muted mt-0.5 truncate">{footer}</div>}
      </div>
    </Tag>
  );
}
