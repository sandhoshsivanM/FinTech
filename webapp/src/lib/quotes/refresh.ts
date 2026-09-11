/**
 * Turning fetched quotes into holding updates.
 *
 * Kept separate from the transport in `yahoo.ts` so the rule that matters — what
 * a quote is allowed to overwrite — is testable without a network, and reads in
 * one place.
 */
import type { Holding } from '@/lib/types';
import { yahooTicker, type Quote } from './yahoo';

export interface AppliedQuotes {
  /** Holding records to persist, already merged. Empty when nothing changed. */
  updates: Holding[];
  /** How many holdings received a fresh price. */
  priced: number;
}

/**
 * Merges quotes into the holdings they belong to.
 *
 * Three things this deliberately does not do:
 *
 *   - It never touches `avgCost`, `quantity` or anything the user entered. A
 *     quote is an observation about the market, not about the position.
 *   - It never clears an existing price. A ticker that failed today keeps
 *     yesterday's figure and yesterday's `priceAsOf`, so the day-change column
 *     says "prices from the 9th" rather than going blank — a stale real price
 *     is more useful than nothing, provided it states its age.
 *   - It never invents a `previousClose`. Yahoo omits one on some instruments,
 *     and synthesising it here would be the exact fact/fiction blend that
 *     `domain/dayChange.ts` exists to prevent.
 *
 * `priceAsOf` is set even when the figure is unchanged: the price was confirmed
 * at this moment, and that is what the timestamp means. A flat market must not
 * make the book look stale.
 */
export function applyQuotes(holdings: Holding[], quotes: Map<string, Quote>, now: number): AppliedQuotes {
  const updates: Holding[] = [];

  for (const h of holdings) {
    const ticker = yahooTicker(h);
    if (ticker === null) continue;
    const q = quotes.get(ticker);
    if (!q) continue;

    updates.push({
      // Spread first, for the same reason HoldingEditor does it: sector,
      // country, marketCapBand and the rest are not ours to drop.
      ...h,
      lastPrice: q.price,
      // `?? h.previousClose ?? null` — a quote without a previous close leaves
      // whatever was already recorded rather than erasing it.
      previousClose: q.previousClose ?? h.previousClose ?? null,
      priceAsOf: now,
      priceSource: 'yahoo',
    });
  }

  return { updates, priced: updates.length };
}
