// Every amount used to be assumed INR. A US holding bought through Vested is
// genuinely priced in dollars, and storing its cost as rupees baked in an
// error that compounded silently.
import { describe, expect, test } from 'vitest';
import { holdingView, fxRates, hasApproximateFx, portfolioSummary } from './portfolio';
import { findCurrency } from './currency';
import type { Holding } from '@/lib/types';

const USD = findCurrency('USD').rateToInr; // 83.3

const inr = (over: Partial<Holding> = {}): Holding => ({
  id: 'h-inr', vaultId: 'v', symbol: 'INFY', exchange: 'NSE',
  quantity: '10', avgCost: '1400', lastPrice: '1500',
  assetType: 'equity_etf', ...over,
});

const usd = (over: Partial<Holding> = {}): Holding => ({
  id: 'h-usd', vaultId: 'v', symbol: 'AAPL', exchange: 'NSE',
  quantity: '10', avgCost: '150', lastPrice: '200',
  assetType: 'equity_etf', currency: 'USD', ...over,
});

describe('an INR holding is completely unaffected', () => {
  test('no currency recorded means rupees, and the rates are 1', () => {
    const { costRate, priceRate } = fxRates(inr());
    expect(costRate.toNumber()).toBe(1);
    expect(priceRate.toNumber()).toBe(1);
    const v = holdingView(inr(), 0);
    expect(v.invested.toNumber()).toBe(14000);
    expect(v.current.toNumber()).toBe(15000);
    expect(hasApproximateFx(inr())).toBe(false);
  });
});

describe('a foreign holding converts to the base currency', () => {
  test('cost and value are both expressed in INR so they can be summed', () => {
    // The bug: $150 and ₹1,400 were previously added together as if equal.
    const v = holdingView(usd(), 0);
    expect(v.invested.toNumber()).toBeCloseTo(10 * 150 * USD, 4);
    expect(v.current.toNumber()).toBeCloseTo(10 * 200 * USD, 4);
  });

  test('a recorded purchase rate is used for cost, the current rate for value', () => {
    // Bought when a dollar was ₹70; it is ₹83.3 now. The gain is part price,
    // part currency — converting both at today's rate hides that.
    const h = usd({ fxRateAtPurchase: '70' });
    const v = holdingView(h, 0);
    expect(v.invested.toNumber()).toBeCloseTo(10 * 150 * 70, 4);
    expect(v.current.toNumber()).toBeCloseTo(10 * 200 * USD, 4);
    expect(hasApproximateFx(h)).toBe(false);
  });

  test('without a purchase rate the figure is approximate, and says so', () => {
    const h = usd();
    expect(hasApproximateFx(h)).toBe(true);
    // Both sides at today's rate: the P&L is then purely the price move.
    const v = holdingView(h, 0);
    expect(v.pnlPct).toBeCloseTo(100 * (200 - 150) / 150, 6);
  });

  test('currency movement alone shows as a gain when the price has not moved', () => {
    // $150 → $150, but the rupee weakened from 70 to 83.3. That is a real gain
    // in base currency and the model must not hide it.
    const flat = usd({ lastPrice: '150', fxRateAtPurchase: '70' });
    const v = holdingView(flat, 0);
    expect(v.pnl.toNumber()).toBeGreaterThan(0);
    expect(v.invested.toNumber()).toBeCloseTo(10 * 150 * 70, 4);
    expect(v.current.toNumber()).toBeCloseTo(10 * 150 * USD, 4);
  });
});

describe('a mixed portfolio totals correctly', () => {
  test('rupee and dollar holdings sum in one base currency', () => {
    const s = portfolioSummary([inr(), usd({ fxRateAtPurchase: '70' })], 0);
    expect(s.invested.toNumber()).toBeCloseTo(14000 + 10 * 150 * 70, 4);
    expect(s.current.toNumber()).toBeCloseTo(15000 + 10 * 200 * USD, 4);
  });

  test('an unknown currency code falls back to INR rather than zeroing the holding', () => {
    // Zero would silently delete the position from every total.
    const v = holdingView(usd({ currency: 'XYZ' }), 0);
    expect(v.current.toNumber()).toBe(10 * 200);
  });
});
