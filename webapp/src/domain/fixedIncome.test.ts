// A bond or FD used to value at cost for its entire life and report exactly ₹0
// return. These pin the accrual that replaced that.
import { describe, expect, test } from 'vitest';
import { accrue, annualIncome, canAccrue, isFixedIncome } from './fixedIncome';
import { holdingView } from './portfolio';
import type { AssetType, Holding } from '@/lib/types';

const DAY = 86_400_000;
const START = new Date(2026, 2, 15).getTime(); // 15 Mar 2026

const fd = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1', vaultId: 'v', symbol: 'HDFC FD', exchange: 'NSE',
  quantity: '1', avgCost: '100000', assetType: 'fd',
  firstPurchaseDate: START,
  couponRatePct: '7.1',
  payoutFrequency: 'cumulative',
  maturityDate: new Date(2031, 2, 15).getTime(),
  ...over,
});

describe('which instruments accrue', () => {
  test('interest-bearing types do', () => {
    for (const t of ['bond', 'fd', 'ppf_epf', 'ssy'] as AssetType[]) {
      expect(isFixedIncome(t)).toBe(true);
    }
  });

  test('price-quoted types do not', () => {
    // NPS and ULIP hold units at a NAV; SGB tracks the gold price. The price
    // model is already correct for all three.
    for (const t of ['equity_etf', 'equity_mf', 'gold_etf', 'nps', 'ulip', 'sgb', 'crypto'] as AssetType[]) {
      expect(isFixedIncome(t)).toBe(false);
    }
  });

  test('a holding with no rate or no start date accrues nothing', () => {
    expect(canAccrue(fd({ couponRatePct: null }))).toBe(false);
    expect(canAccrue(fd({ couponRatePct: '0' }))).toBe(false);
    expect(canAccrue(fd({ firstPurchaseDate: null }))).toBe(false);
    expect(accrue(fd({ couponRatePct: null }))).toBeNull();
  });
});

describe('cumulative FD — compounds, collected at maturity', () => {
  test('one year at 7.1% compounded quarterly', () => {
    const a = accrue(fd(), START + 365 * DAY)!;
    // 100000 × (1 + 0.071/4)^4 = 107,291 (to the rupee)
    expect(Math.round(a.value.toNumber())).toBe(107291);
    expect(Math.round(a.accrued.toNumber())).toBe(7291);
    expect(a.principal.toNumber()).toBe(100000);
  });

  test('value grows every day, so net worth never jumps', () => {
    const d90 = accrue(fd(), START + 90 * DAY)!.value.toNumber();
    const d180 = accrue(fd(), START + 180 * DAY)!.value.toNumber();
    expect(d90).toBeGreaterThan(100000);
    expect(d180).toBeGreaterThan(d90);
  });

  test('nothing has accrued on day zero', () => {
    expect(accrue(fd(), START)!.accrued.toNumber()).toBeCloseTo(0, 6);
  });

  test('accrual stops at maturity', () => {
    const at = accrue(fd(), new Date(2031, 2, 15).getTime())!;
    const wayAfter = accrue(fd(), new Date(2035, 2, 15).getTime())!;
    // A matured FD that kept earning would quietly inflate net worth forever.
    expect(wayAfter.value.toNumber()).toBeCloseTo(at.value.toNumber(), 6);
    expect(wayAfter.matured).toBe(true);
    expect(wayAfter.daysToMaturity).toBe(0);
  });

  test('maturity value is projected from the full term', () => {
    const a = accrue(fd(), START)!;
    // ACT/365: 15 Mar 2026 → 15 Mar 2031 is 1826 days (Feb 2028 is a leap
    // day), so 5.0027 years, not a flat 5. 100000 × (1+0.071/4)^(4×5.0027).
    expect(Math.round(a.maturityValue!.toNumber())).toBe(142202);
  });
});

describe('bond paying a periodic coupon', () => {
  const bond = fd({
    assetType: 'bond', symbol: 'NHAI 8.2%', avgCost: '50000',
    couponRatePct: '8.2', payoutFrequency: 'half_yearly',
  });

  test('only the current period is unrealised', () => {
    // Coupons already paid are in the bank account, not in the bond.
    const a = accrue(bond, START + 100 * DAY)!;
    expect(Math.round(a.accrued.toNumber())).toBe(1123); // 50000×8.2%×100/365
    expect(Math.round(a.value.toNumber())).toBe(51123);
  });

  test('accrual resets after each coupon', () => {
    const justBefore = accrue(bond, START + 182 * DAY)!.accrued.toNumber();
    const justAfter = accrue(bond, START + 184 * DAY)!.accrued.toNumber();
    expect(justAfter).toBeLessThan(justBefore);
  });

  test('the principal never grows, unlike a cumulative deposit', () => {
    const a = accrue(bond, START + 3 * 365 * DAY)!;
    expect(a.principal.toNumber()).toBe(50000);
    // Maturity returns principal — the coupons were received along the way, so
    // adding them here would double count.
    expect(a.maturityValue!.toNumber()).toBe(50000);
  });

  test('the next coupon date is reported', () => {
    const a = accrue(bond, START + 10 * DAY)!;
    expect(a.nextPayout).not.toBeNull();
    expect(a.nextPayout!).toBeGreaterThan(START + 10 * DAY);
  });

  test('annual income is the coupon in money', () => {
    expect(annualIncome(bond)!.toNumber()).toBeCloseTo(4100, 6);
  });
});

describe('holdingView uses accrual for fixed income', () => {
  test('an FD no longer reports zero return', () => {
    // The regression this whole module exists for.
    const v = holdingView(fd(), START + 365 * DAY);
    expect(v.invested.toNumber()).toBe(100000);
    expect(v.current.toNumber()).toBeGreaterThan(100000);
    expect(v.pnl.toNumber()).toBeGreaterThan(0);
    expect(v.pnlPct).toBeGreaterThan(6);
  });

  test('an FD with no rate still values at cost, not at nothing', () => {
    const v = holdingView(fd({ couponRatePct: null }), START + 365 * DAY);
    expect(v.current.toNumber()).toBe(100000);
    expect(v.pnl.toNumber()).toBe(0);
  });

  test('a stock is untouched by any of this', () => {
    const stock: Holding = {
      id: 's', vaultId: 'v', symbol: 'ITC', exchange: 'NSE',
      quantity: '10', avgCost: '400', lastPrice: '450', assetType: 'equity_etf',
    };
    const v = holdingView(stock, START);
    expect(v.current.toNumber()).toBe(4500);
    expect(v.pnl.toNumber()).toBe(500);
  });
});
