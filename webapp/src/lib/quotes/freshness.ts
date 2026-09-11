/**
 * How old the prices on screen are.
 *
 * This is the gap that made a stale book look like a broken one: Holdings
 * showed "Market value", "+1.64% all time" and "All marked to a price" with
 * nothing saying the prices behind them were a week old, so a portfolio that
 * had not been repriced since the last CSV import read as one whose figures
 * were simply wrong.
 *
 * `types.ts` states the principle this serves: a figure that cannot state its
 * own age cannot be trusted. `domain/dayChange.ts` has `priceAsOfLabel` for the
 * day-change card, which answers a narrower question — what a day move is
 * measured against — and only considers holdings that carry a previous close.
 * This one speaks for the whole book.
 */
import type { Holding } from '@/lib/types';
import { formatDayMonth } from '@/lib/dateFormat';

/** Newest `priceAsOf` across the book, or null when nothing records one. */
export function newestPriceAsOf(holdings: Holding[]): number | null {
  let newest: number | null = null;
  for (const h of holdings) {
    // Only a holding that actually carries a price has a meaningful stamp; a
    // `priceAsOf` left behind on a position whose price was cleared would
    // otherwise date the whole book.
    if (h.lastPrice == null || h.lastPrice === '') continue;
    const t = h.priceAsOf;
    if (t == null) continue;
    if (newest === null || t > newest) newest = t;
  }
  return newest;
}

/**
 * A short statement of price age for a KPI footer.
 *
 * Returns null when nothing can be said — an empty book, or prices that predate
 * the `priceAsOf` field. Saying nothing is correct there; inventing "today"
 * would be the precise failure this function exists to prevent.
 *
 * The thresholds are coarse on purpose. "Priced 3 minutes ago" invites a
 * precision the source does not have, and the only distinction that changes a
 * decision is today / yesterday / a named earlier date.
 */
export function priceAgeLabel(holdings: Holding[], now: number): string | null {
  const newest = newestPriceAsOf(holdings);
  if (newest === null) return null;
  // A clock that has gone backwards, or a restored backup written on a machine
  // whose clock was ahead. Treated as now rather than rendered as a future date.
  if (newest >= now) return 'Priced just now';

  const elapsed = now - newest;
  if (elapsed < 60 * 60_000) return 'Priced just now';
  if (elapsed < 24 * 60 * 60_000) return 'Priced today';
  if (elapsed < 48 * 60 * 60_000) return 'Priced yesterday';
  return `Priced ${formatDayMonth(newest)}`;
}
