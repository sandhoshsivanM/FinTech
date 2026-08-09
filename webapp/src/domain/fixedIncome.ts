/**
 * Valuation for instruments that pay interest rather than trade at a price.
 *
 * A bond, FD, PPF or SSY has no market quote — its worth today is the
 * principal plus the interest earned to date. The portfolio model values
 * everything as `quantity × price`, which for these holdings meant
 * `principal × 1`: a ₹1,00,000 FD at 7.1% reported ₹1,00,000 for five years
 * and exactly ₹0 return, right up until it matured.
 *
 * Two behaviours, because the money genuinely moves differently:
 *
 *  - **Cumulative** (a standard FD, PPF, SSY): nothing is paid out, interest
 *    compounds and is collected at maturity. Value grows every day.
 *  - **Periodic payout** (most bonds): the coupon leaves the instrument and
 *    lands in a bank account, so the principal does not grow. Only the
 *    interest accrued since the last coupon is unrealised — and it resets to
 *    zero each time a coupon is paid.
 *
 * Nothing is invented: a holding with no rate recorded accrues nothing and
 * falls back to the ordinary cost-based valuation.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { AssetType, Holding } from '@/lib/types';

/** Instruments valued by accrual rather than by price. */
const FIXED_INCOME: ReadonlySet<AssetType> = new Set<AssetType>([
  'bond', 'fd', 'ppf_epf', 'ssy',
]);

/**
 * NPS and ULIP are deliberately absent: both are market-linked, so they hold
 * units at a NAV and the price model is already right for them. SGB is absent
 * too — its capital value follows the gold price, and only its 2.5% coupon is
 * fixed, which makes it a different problem from this one.
 */
export const isFixedIncome = (t: AssetType): boolean => FIXED_INCOME.has(t);

/** True when the holding has enough recorded to accrue anything at all. */
export function canAccrue(h: Holding): boolean {
  if (!isFixedIncome(h.assetType)) return false;
  const rate = h.couponRatePct ? D(h.couponRatePct) : ZERO;
  return rate.gt(0) && h.firstPurchaseDate != null;
}

const DAY = 86_400_000;
const YEAR_DAYS = 365;

/** Payouts per year. `cumulative` compounds quarterly, the Indian FD convention. */
const PER_YEAR: Record<NonNullable<Holding['payoutFrequency']>, number> = {
  cumulative: 4,
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  annual: 1,
};

export interface Accrual {
  /** Principal — `quantity × avgCost`, the same figure every asset type uses. */
  principal: Decimal;
  /** Interest earned but not yet received. */
  accrued: Decimal;
  /** What the holding is worth today: principal + accrued. */
  value: Decimal;
  /** Total value if held to maturity. Null when no maturity is recorded. */
  maturityValue: Decimal | null;
  /** Whole days until maturity; 0 once matured, null when not recorded. */
  daysToMaturity: number | null;
  matured: boolean;
  /** Next coupon date for a paying instrument; null for cumulative. */
  nextPayout: number | null;
}

/**
 * Interest to date.
 *
 * Accrual stops at maturity — a matured FD does not keep earning, and letting
 * it would quietly inflate net worth for as long as the record sits there.
 */
export function accrue(h: Holding, now: number = Date.now()): Accrual | null {
  if (!canAccrue(h)) return null;

  const principal = D(h.quantity).times(D(h.avgCost));
  const rate = D(h.couponRatePct!).div(100);
  const start = h.firstPurchaseDate!;
  const freq = h.payoutFrequency ?? 'cumulative';

  const end = h.maturityDate != null ? Math.min(now, h.maturityDate) : now;
  const heldDays = Math.max(0, (end - start) / DAY);
  const matured = h.maturityDate != null && now >= h.maturityDate;

  const years = heldDays / YEAR_DAYS;
  let accrued: Decimal;
  let nextPayout: number | null = null;

  if (freq === 'cumulative') {
    // Compound at n periods a year: P((1 + r/n)^(n·t) − 1).
    const n = PER_YEAR.cumulative;
    const growth = Math.pow(1 + rate.div(n).toNumber(), n * years);
    accrued = principal.times(growth - 1);
  } else {
    // The coupon leaves the instrument, so only the current period is
    // unrealised. Anything already paid belongs to the bank account, not here.
    const n = PER_YEAR[freq];
    const periodDays = YEAR_DAYS / n;
    const daysIntoPeriod = heldDays % periodDays;
    accrued = principal.times(rate).times(daysIntoPeriod / YEAR_DAYS);
    if (!matured) {
      const periodsDone = Math.floor(heldDays / periodDays);
      nextPayout = start + Math.round((periodsDone + 1) * periodDays * DAY);
      if (h.maturityDate != null && nextPayout > h.maturityDate) nextPayout = h.maturityDate;
    }
  }

  let maturityValue: Decimal | null = null;
  let daysToMaturity: number | null = null;
  if (h.maturityDate != null) {
    const totalYears = Math.max(0, (h.maturityDate - start) / DAY) / YEAR_DAYS;
    maturityValue = freq === 'cumulative'
      ? principal.times(Math.pow(1 + rate.div(PER_YEAR.cumulative).toNumber(), PER_YEAR.cumulative * totalYears))
      // A paying instrument returns its principal; the coupons were already
      // received along the way, so adding them here would double count.
      : principal;
    daysToMaturity = Math.max(0, Math.ceil((h.maturityDate - now) / DAY));
  }

  return {
    principal,
    accrued,
    value: principal.plus(accrued),
    maturityValue,
    daysToMaturity,
    matured,
    nextPayout,
  };
}

/** Annual coupon in money terms, for the income view. Null when not applicable. */
export function annualIncome(h: Holding): Decimal | null {
  if (!canAccrue(h)) return null;
  return D(h.quantity).times(D(h.avgCost)).times(D(h.couponRatePct!)).div(100);
}

export const PAYOUT_LABEL: Record<NonNullable<Holding['payoutFrequency']>, string> = {
  cumulative: 'Cumulative (at maturity)',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annual: 'Annual',
};
