// The single seam between the portfolio and everything that consumes its value.
//
// Mirrors `lib/domain/entities/investment_totals.dart`. Keep the two in step:
// the health score, the safety net and the net-worth snapshot all take this
// type on both platforms, and the shared fixture in health.test.ts asserts they
// produce identical numbers from it.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Holding } from '@/lib/types';
import { ASSET_GROUP_OF, holdingView, type AssetGroup } from './portfolio';

/**
 * Everything outside the Investments screen needs to know about the portfolio.
 *
 * Deliberately not a holdings list: consumers should not each re-derive "what
 * is this worth", because when they did, they disagreed. Deliberately not the
 * position/lot type either — the health score must not depend on how a lot is
 * matched, and this type has to be expressible on both clients.
 *
 * Model note, and it is a real difference rather than an oversight: Flutter
 * builds this from the lot ledger (instruments + trades + dated prices), while
 * the web app builds it from aggregated holdings (one row per symbol with an
 * average cost). Both produce the same market value and cost basis for the same
 * portfolio. What web cannot produce is realised P&L or a price date, because
 * an aggregate row has neither. Anything that needs those must read the lot
 * model directly and is Flutter-only for now.
 */
export interface InvestmentTotals {
  /**
   * What the portfolio is worth. Unpriced holdings contribute their cost, so
   * this never silently drops one — see `unpricedCount` and `indicativeValue`.
   */
  marketValue: Decimal;
  /** What was paid. */
  costBasis: Decimal;
  /** Market value per chart group. Absent groups are missing, not zero. */
  valueByGroup: Partial<Record<AssetGroup, Decimal>>;
  /** Distinct holdings. Zero means the vault holds nothing. */
  positionCount: number;
  /** Holdings with no recorded price. */
  unpricedCount: number;
  /** How much of `marketValue` is carried at cost rather than a real quote. */
  indicativeValue: Decimal;
  /**
   * The newest price observation across the priced holdings, or null when
   * nothing carries a date.
   *
   * Was declared and hard-coded null at every construction site, so any screen
   * that trusted it showed nothing. It is real now that holdings record
   * `priceAsOf`, and it is what lets a total say how old it is.
   */
  lastPricedAt: number | null;
}

export const EMPTY_INVESTMENTS: InvestmentTotals = {
  marketValue: ZERO,
  costBasis: ZERO,
  valueByGroup: {},
  positionCount: 0,
  unpricedCount: 0,
  indicativeValue: ZERO,
  lastPricedAt: null,
};

/** True when the vault holds nothing. Distinct from "not loaded yet". */
export function isEmptyPortfolio(t: InvestmentTotals): boolean {
  return t.positionCount === 0;
}

/** Value of the retirement bucket (FD / PPF-EPF / NPS). */
export function retirementValue(t: InvestmentTotals): Decimal {
  return t.valueByGroup.retirement ?? ZERO;
}

/** Equity + gold — "invested for growth", a different question from "invested". */
export function growthValue(t: InvestmentTotals): Decimal {
  return (t.valueByGroup.equity ?? ZERO).plus(t.valueByGroup.gold ?? ZERO);
}

/**
 * The largest group's share, 0..1. Null when nothing is held — an undefined
 * concentration must not read as zero, which would score as perfect diversity.
 */
export function concentration(t: InvestmentTotals): number | null {
  if (t.marketValue.lte(0)) return null;
  const values = Object.values(t.valueByGroup) as Decimal[];
  if (values.length === 0) return null;
  const largest = values.reduce((a, b) => (b.gt(a) ? b : a), ZERO);
  return largest.div(t.marketValue).toNumber();
}

/** Builds the totals from the web app's aggregated holdings. */
export function investmentTotals(holdings: Holding[]): InvestmentTotals {
  const byGroup: Partial<Record<AssetGroup, Decimal>> = {};
  let market = ZERO;
  let cost = ZERO;
  let indicative = ZERO;
  let unpriced = 0;
  let newest: number | null = null;

  for (const h of holdings) {
    const v = holdingView(h);
    const g = ASSET_GROUP_OF[h.assetType];
    byGroup[g] = (byGroup[g] ?? ZERO).plus(v.current);
    market = market.plus(v.current);
    cost = cost.plus(v.invested);
    if (h.lastPrice == null || h.lastPrice === '') {
      unpriced += 1;
      indicative = indicative.plus(v.current);
    } else if (h.priceAsOf != null && (newest == null || h.priceAsOf > newest)) {
      newest = h.priceAsOf;
    }
  }

  return {
    marketValue: market,
    costBasis: cost,
    valueByGroup: byGroup,
    positionCount: holdings.length,
    unpricedCount: unpriced,
    indicativeValue: indicative,
    lastPricedAt: newest,
  };
}

/** Convenience for tests and fixtures: totals from plain per-asset-type amounts. */
export function totalsOf(
  byType: Partial<Record<import('@/lib/types').AssetType, number>>,
  opts: { costBasis?: number; unpricedCount?: number; indicativeValue?: number } = {},
): InvestmentTotals {
  const byGroup: Partial<Record<AssetGroup, Decimal>> = {};
  let total = ZERO;
  let count = 0;
  for (const [type, amount] of Object.entries(byType)) {
    if (amount == null) continue;
    const g = ASSET_GROUP_OF[type as import('@/lib/types').AssetType];
    const v = D(amount);
    byGroup[g] = (byGroup[g] ?? ZERO).plus(v);
    total = total.plus(v);
    count += 1;
  }
  return {
    marketValue: total,
    costBasis: opts.costBasis == null ? total : D(opts.costBasis),
    valueByGroup: byGroup,
    positionCount: count,
    unpricedCount: opts.unpricedCount ?? 0,
    indicativeValue: D(opts.indicativeValue ?? 0),
    lastPricedAt: null,
  };
}
