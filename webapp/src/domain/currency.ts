// Multi-currency (PRD §12). The ledger stores INR; this converts for display,
// and `domain/portfolio` uses the same rates to value foreign holdings.
//
// The `rateToInr` numbers below are SEED DEFAULTS, not live rates. Khazana has
// no price feed and no network, so a rate is only ever as good as the last time
// someone wrote it down — which is why a recorded `FxRate` always wins, and why
// one carries an `asOf` date. Treating the seeds as truth is what left every
// dollar holding valued at 83.30 forever with nothing on screen to say so.
import Decimal from 'decimal.js';
import { D } from '@/lib/money';
import type { FxRate } from '@/lib/types';

export interface Currency { code: string; symbol: string; name: string; rateToInr: number }

/**
 * When these seeds were last touched. Shown to the user, because a rate without
 * a date is a claim with no evidence behind it.
 */
export const SEED_AS_OF = Date.UTC(2026, 7, 1);

/**
 * Seed rates. Superseded per-currency the moment the user records one.
 *
 * USD sat at 83.30 for a long time — roughly the 2024 level. A real $102
 * purchase that cost ₹9,800 was reported as ₹8,497, a 15% understatement, and
 * nothing on screen said the rate was a guess. That is the whole reason
 * `FxRate` and the Settings editor exist; these numbers remain a *starting
 * point*, never an answer.
 */
export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', rateToInr: 1 },
  { code: 'USD', symbol: '$', name: 'US Dollar', rateToInr: 96 },
  { code: 'EUR', symbol: '€', name: 'Euro', rateToInr: 90.1 },
  { code: 'GBP', symbol: '£', name: 'British Pound', rateToInr: 105.7 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', rateToInr: 22.7 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rateToInr: 61.6 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rateToInr: 0.53 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rateToInr: 54.2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rateToInr: 60.9 },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', rateToInr: 92.0 },
];

export function findCurrency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/**
 * INR per unit of `code`, preferring what the user actually recorded.
 *
 * Falls back to the seed only when nothing has been recorded — and callers that
 * care about honesty should check `rateAsOf` so the UI can say which it got.
 */
export function resolveRate(code: string, rates: FxRate[] = []): Decimal {
  if (code === 'INR') return D(1);
  const stored = rates.find((r) => r.code === code);
  return stored ? D(stored.rateToInr) : D(findCurrency(code).rateToInr);
}

/** When the rate for `code` was recorded, or null when it is still the seed. */
export function rateAsOf(code: string, rates: FxRate[] = []): number | null {
  return rates.find((r) => r.code === code)?.asOf ?? null;
}

/**
 * True when this holding's currency is being converted at a built-in seed
 * because the user has never recorded a rate.
 *
 * The counterpart to `hasApproximateFx`, which is about the *purchase* rate.
 * This one is about the *current* rate, and it is the more damaging of the two:
 * it silently mis-values the position on every screen at once.
 */
export function usesSeedRate(code: string | null | undefined, rates: FxRate[] = []): boolean {
  const c = code ?? 'INR';
  return c !== 'INR' && rateAsOf(c, rates) == null;
}

/** How long a recorded rate may sit before the UI should call it stale. */
export const FX_STALE_DAYS = 90;

export function isRateStale(code: string, rates: FxRate[], now: number): boolean {
  if (code === 'INR') return false;
  const at = rateAsOf(code, rates);
  // Never recorded is not "stale" — it is unrecorded, which is a different and
  // louder problem, reported separately.
  return at != null && now - at > FX_STALE_DAYS * 86_400_000;
}

/** Convert an INR-denominated amount into the target currency. */
export function fromInr(amountInr: Decimal.Value, target: Currency): Decimal {
  if (target.code === 'INR' || target.rateToInr === 0) return D(amountInr);
  return D(amountInr).div(target.rateToInr);
}

export function formatIn(amountInr: Decimal.Value, target: Currency): string {
  const v = fromInr(amountInr, target).toNumber();
  try {
    return new Intl.NumberFormat(target.code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency: target.code, maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${target.symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}
