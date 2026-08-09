// A single avgCost cannot express a part-short part-long sale. These pin the
// per-lot split that replaced it, and the invariant that keeps lots and the
// position they describe from drifting apart.
import { describe, expect, test } from 'vitest';
import { D } from '@/lib/money';
import { allocateFifo, gainsForSale, hasRealLots, lotsFor, reconcileLots } from './lots';
import type { Holding, HoldingLot } from '@/lib/types';

// Chosen so the two lots genuinely fall either side of the 12-month line:
// Mar 2024 → Jan 2026 is 22 months (long); Nov 2025 → Jan 2026 is 2 (short).
const MAR = new Date(2024, 2, 15).getTime();   // 15 Mar 2024
const NOV = new Date(2025, 10, 20).getTime();  // 20 Nov 2025
const SALE = new Date(2026, 0, 20);            // 20 Jan 2026

const holding = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1', vaultId: 'v', symbol: 'INFY', exchange: 'NSE',
  quantity: '30', avgCost: '1500', lastPrice: '1800',
  assetType: 'equity_etf', firstPurchaseDate: MAR, ...over,
});

const lot = (id: string, qty: string, cost: string, date: number): HoldingLot =>
  ({ id, vaultId: 'v', holdingId: 'h1', quantity: qty, costPerUnit: cost, purchaseDate: date });

describe('falling back to the position average', () => {
  test('a holding with no lots yields one synthetic lot', () => {
    const [l] = lotsFor(holding(), []);
    expect(l.quantity).toBe('30');
    expect(l.costPerUnit).toBe('1500');
    expect(l.purchaseDate).toBe(MAR);
    expect(hasRealLots(holding(), [])).toBe(false);
  });

  test('the synthetic lot is never mistaken for a recorded one', () => {
    const [l] = lotsFor(holding(), []);
    expect(l.id).toMatch(/^synthetic:/);
    expect(l.note).toMatch(/no purchase history/i);
  });

  test('a holding with no purchase date does not claim 1970', () => {
    // Epoch 0 would silently qualify everything as long-term.
    const [l] = lotsFor(holding({ firstPurchaseDate: null }), []);
    expect(l.purchaseDate).toBe(0);
  });

  test('real lots win and come back oldest first', () => {
    const lots = [lot('l2', '20', '1600', NOV), lot('l1', '10', '1300', MAR)];
    expect(lotsFor(holding(), lots).map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(hasRealLots(holding(), lots)).toBe(true);
  });
});

describe('reconciliation with the position', () => {
  test('lots that describe the holding reconcile', () => {
    // 10×1300 + 20×1600 = 45,000 over 30 units = 1,500 average.
    const r = reconcileLots(holding(), [lot('l1', '10', '1300', MAR), lot('l2', '20', '1600', NOV)]);
    expect(r.ok).toBe(true);
    expect(r.lotQuantity.toNumber()).toBe(30);
    expect(r.lotWeightedCost.toNumber()).toBe(1500);
  });

  test('a quantity that has drifted is reported, not averaged away', () => {
    const r = reconcileLots(holding(), [lot('l1', '10', '1500', MAR)]);
    expect(r.quantityMatches).toBe(false);
    expect(r.ok).toBe(false);
  });

  test('sub-paise rounding across many lots still counts as agreement', () => {
    const r = reconcileLots(holding({ quantity: '3', avgCost: '1000' }), [
      lot('l1', '1', '1000.001', MAR), lot('l2', '1', '999.999', MAR), lot('l3', '1', '1000', MAR),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe('FIFO allocation', () => {
  const lots = [lot('l1', '10', '1300', MAR), lot('l2', '20', '1600', NOV)];

  test('the oldest lot is consumed first', () => {
    const { allocations } = allocateFifo(lots, D('15'));
    expect(allocations.map((a) => [a.lot.id, a.quantity.toNumber()]))
      .toEqual([['l1', 10], ['l2', 5]]);
  });

  test('selling everything consumes every lot', () => {
    const { allocations, shortfall } = allocateFifo(lots, D('30'));
    expect(allocations).toHaveLength(2);
    expect(shortfall.toNumber()).toBe(0);
  });

  test('overselling reports a shortfall instead of clamping silently', () => {
    // A gain computed on units you do not own is worse than an error.
    const { shortfall } = allocateFifo(lots, D('40'));
    expect(shortfall.toNumber()).toBe(10);
  });
});

describe('gains split across lots — the reason this exists', () => {
  const lots = [lot('l1', '10', '1300', MAR), lot('l2', '20', '1600', NOV)];

  test('one sale is part long-term and part short-term', () => {
    // Mar 2024 → Jan 2026 is over 12 months (long); Nov 2025 → Jan 2026 is not.
    const g = gainsForSale({
      holding: holding(), lots, sellQuantity: D('15'),
      salePricePerUnit: D('1800'), saleDate: SALE,
    });
    expect(g.perLot).toHaveLength(2);
    expect(g.perLot[0].gainType).toBe('long_term');
    expect(g.perLot[1].gainType).toBe('short_term');
    // 10×(1800−1300) = 5,000 long; 5×(1800−1600) = 1,000 short.
    expect(g.longTermGain.toNumber()).toBe(5000);
    expect(g.shortTermGain.toNumber()).toBe(1000);
    expect(g.totalGain.toNumber()).toBe(6000);
    expect(g.fromRealLots).toBe(true);
  });

  test('the average alone would have called the whole sale one thing', () => {
    // Same sale, no lots: a single 1,500 average dated March 2024 classifies
    // all of it long-term and overstates the long-term gain.
    const g = gainsForSale({
      holding: holding(), lots: [], sellQuantity: D('15'),
      salePricePerUnit: D('1800'), saleDate: SALE,
    });
    expect(g.perLot).toHaveLength(1);
    expect(g.shortTermGain.toNumber()).toBe(0);
    expect(g.longTermGain.toNumber()).toBe(4500); // 15×(1800−1500)
    expect(g.fromRealLots).toBe(false);
  });

  test('a lot with no purchase date is treated as short-term and flagged', () => {
    // Conservative: never understates the tax, and says the split is a guess.
    const g = gainsForSale({
      holding: holding({ firstPurchaseDate: null }), lots: [],
      sellQuantity: D('10'), salePricePerUnit: D('1800'), saleDate: SALE,
    });
    expect(g.incomplete).toBe(true);
    expect(g.perLot[0].gainType).toBe('short_term');
  });

  test('overselling surfaces on the result', () => {
    const g = gainsForSale({
      holding: holding(), lots, sellQuantity: D('50'),
      salePricePerUnit: D('1800'), saleDate: SALE,
    });
    expect(g.shortfall.toNumber()).toBe(20);
  });
});
