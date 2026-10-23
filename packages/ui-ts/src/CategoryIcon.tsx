'use client';
/**
 * Category icons.
 *
 * `Category.icon` stores a lucide icon NAME (see DEFAULT_CATEGORIES in
 * lib/store.ts); this is the one place that name becomes a component. It used
 * to be copied into the transactions, add and recurring pages.
 */
import type { ElementType } from 'react';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse,
  Clapperboard, Landmark, Wallet, TrendingUp, Shapes,
} from 'lucide-react';
import clsx from 'clsx';

export const CATEGORY_ICONS: Record<string, ElementType> = {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse,
  Clapperboard, Landmark, Wallet, TrendingUp, Shapes,
};

const ORDER = Object.keys(CATEGORY_ICONS);

/** The bare glyph. Unknown or missing names fall back to `Shapes`. */
export function CatIcon({ name, size = 16 }: { name?: string | null; size?: number }) {
  const Icon = (name && CATEGORY_ICONS[name]) || Shapes;
  return <Icon size={size} />;
}

/**
 * A stable series colour for a category, so Food is the same hue on the home
 * screen, the transaction list and the budget page. Known icons map in order;
 * anything else hashes its key onto the eight-step palette.
 */
export function categoryColor(key?: string | null): string {
  if (!key) return 'var(--c8)';
  let i = ORDER.indexOf(key);
  if (i < 0) {
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    i = h;
  }
  return `var(--c${(i % 8) + 1})`;
}

/** The glyph in a softly tinted circle — the leading avatar on a money row. */
export function CategoryIcon({
  name, size = 40, className,
}: { name?: string | null; size?: number; className?: string }) {
  const c = categoryColor(name);
  return (
    <span
      aria-hidden
      className={clsx('grid place-items-center shrink-0 rounded-full', className)}
      style={{
        width: size,
        height: size,
        color: c,
        background: `color-mix(in srgb, ${c} 16%, transparent)`,
      }}
    >
      <CatIcon name={name} size={Math.round(size * 0.45)} />
    </span>
  );
}
