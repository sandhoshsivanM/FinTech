/**
 * Purchase lots, and the capital gains that need them.
 *
 * The Tax Centre computed a gain from one `avgCost` and one purchase date. For
 * a position bought once that is exactly right. For a position bought twice —
 * which is what an SIP is, monthly, for years — it is a confident number that
 * cannot be correct: a December sale of March and November purchases is part
 * long-term and part short-term, and an average has no way to say so.
 *
 * Lots are additive. A holding with none is treated as a single synthetic lot
 * built from its own fields, so behaviour is unchanged until real lots exist.
 * That also makes the migration lossless: nothing is rewritten, and a vault
 * that never records a lot never notices this module.
 *
 * Allocation is FIFO, which is what Indian tax law requires for listed equity
 * and equity mutual funds. It is not configurable, because choosing a method
 * you are not entitled to produces a return you cannot file.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { AssetType, Holding, HoldingLot } from '@/lib/types';
import { computeGain, type GainResult } from './tax';

/**
 * The lots of a holding, oldest first — real ones where recorded, otherwise a
 * single synthetic lot standing in for the whole position.
 *
 * The synthetic lot is never persisted. Writing it would turn an average into
 * something that looks like a real purchase record, and the user would have no
 * way to tell the difference later.
 */
export function lotsFor(h: Holding, all: HoldingLot[]): HoldingLot[] {
  const own = all.filter((l) => l.holdingId === h.id);
  if (own.length > 0) return [...own].sort((a, b) => a.purchaseDate - b.purchaseDate);
  return [{
    id: `synthetic:${h.id}`,
    vaultId: h.vaultId,
    profileId: h.profileId,
    holdingId: h.id,
    quantity: h.quantity,
    costPerUnit: h.avgCost,
    // Epoch 0 would claim a 1970 purchase and silently qualify everything as
    // long-term. Absent stays absent, and the caller reports it as unknown.
    purchaseDate: h.firstPurchaseDate ?? 0,
    note: 'Derived from the position average — no purchase history recorded.',
  }];
}

/** True when this holding has real recorded lots rather than the fallback. */
export const hasRealLots = (h: Holding, all: HoldingLot[]): boolean =>
  all.some((l) => l.holdingId === h.id);

export interface LotReconciliation {
  lotQuantity: Decimal;
  holdingQuantity: Decimal;
  lotWeightedCost: Decimal;
  holdingAvgCost: Decimal;
  quantityMatches: boolean;
  costMatches: boolean;
  ok: boolean;
}

/**
 * Do the lots still describe the position they belong to?
 *
 * Two records of the same truth drift, and drift here means a tax figure
 * computed from lots disagreeing with a portfolio value computed from the
 * holding. Checked rather than assumed, and surfaced in Diagnostics.
 */
export function reconcileLots(h: Holding, all: HoldingLot[]): LotReconciliation {
  const lots = lotsFor(h, all);
  const lotQuantity = lots.reduce((s, l) => s.plus(D(l.quantity)), ZERO);
  const holdingQuantity = D(h.quantity);
  const cost = lots.reduce((s, l) => s.plus(D(l.quantity).times(D(l.costPerUnit))), ZERO);
  const lotWeightedCost = lotQuantity.isZero() ? ZERO : cost.div(lotQuantity);
  const holdingAvgCost = D(h.avgCost);

  const quantityMatches = lotQuantity.minus(holdingQuantity).abs().lt('0.0001');
  // A paise of rounding across many lots is agreement, not a discrepancy.
  const costMatches = lotWeightedCost.minus(holdingAvgCost).abs().lt('0.01');

  return {
    lotQuantity, holdingQuantity, lotWeightedCost, holdingAvgCost,
    quantityMatches, costMatches, ok: quantityMatches && costMatches,
  };
}

export interface Allocation {
  lot: HoldingLot;
  /** Units of this lot consumed by the sale. */
  quantity: Decimal;
}

/**
 * Which lots a sale consumes, oldest first.
 *
 * Selling more than is held is not silently clamped: the shortfall is
 * returned, because a tax figure computed from a quantity you do not own is
 * worse than an error message.
 */
export function allocateFifo(lots: HoldingLot[], sellQuantity: Decimal): {
  allocations: Allocation[];
  shortfall: Decimal;
} {
  let remaining = sellQuantity;
  const allocations: Allocation[] = [];
  for (const lot of [...lots].sort((a, b) => a.purchaseDate - b.purchaseDate)) {
    if (remaining.lte(0)) break;
    const available = D(lot.quantity);
    if (available.lte(0)) continue;
    const take = Decimal.min(available, remaining);
    allocations.push({ lot, quantity: take });
    remaining = remaining.minus(take);
  }
  return { allocations, shortfall: remaining.gt(0) ? remaining : ZERO };
}

export interface LotGain extends GainResult {
  lot: HoldingLot;
  quantity: Decimal;
  buyValue: Decimal;
  saleValue: Decimal;
  /** False when the lot has no recorded purchase date. */
  dateKnown: boolean;
}

export interface SaleGains {
  perLot: LotGain[];
  totalGain: Decimal;
  totalTax: Decimal;
  shortTermGain: Decimal;
  longTermGain: Decimal;
  shortfall: Decimal;
  /** True when any lot lacked a purchase date, so the split is a guess. */
  incomplete: boolean;
  /** False when the figures come from a derived average, not real lots. */
  fromRealLots: boolean;
}

/**
 * Gains for a sale, split across the lots it consumes.
 *
 * This is the whole point of the module: each tranche is classified on its own
 * holding period, so a part-short part-long sale reports as exactly that
 * instead of collapsing to whichever side the average happened to fall on.
 */
export function gainsForSale(input: {
  holding: Holding;
  lots: HoldingLot[];
  sellQuantity: Decimal;
  salePricePerUnit: Decimal;
  saleDate: Date;
  assetType?: AssetType;
}): SaleGains {
  const { holding, lots, sellQuantity, salePricePerUnit, saleDate } = input;
  const assetType = input.assetType ?? holding.assetType;
  const resolved = lotsFor(holding, lots);
  const { allocations, shortfall } = allocateFifo(resolved, sellQuantity);

  const perLot: LotGain[] = allocations.map((a) => {
    const buyValue = a.quantity.times(D(a.lot.costPerUnit));
    const saleValue = a.quantity.times(salePricePerUnit);
    const dateKnown = a.lot.purchaseDate > 0;
    // With no purchase date there is no holding period. Treating it as
    // short-term is the conservative reading — it never understates the tax.
    const purchase = dateKnown ? new Date(a.lot.purchaseDate) : saleDate;
    return {
      ...computeGain(assetType, purchase, saleDate, buyValue, saleValue),
      lot: a.lot, quantity: a.quantity, buyValue, saleValue, dateKnown,
    };
  });

  const sum = (f: (g: LotGain) => Decimal) => perLot.reduce((s, g) => s.plus(f(g)), ZERO);

  return {
    perLot,
    totalGain: sum((g) => g.gain),
    totalTax: sum((g) => g.estimatedTax),
    shortTermGain: perLot.filter((g) => g.gainType === 'short_term').reduce((s, g) => s.plus(g.gain), ZERO),
    longTermGain: perLot.filter((g) => g.gainType === 'long_term').reduce((s, g) => s.plus(g.gain), ZERO),
    shortfall,
    incomplete: perLot.some((g) => !g.dateKnown),
    fromRealLots: hasRealLots(holding, lots),
  };
}
