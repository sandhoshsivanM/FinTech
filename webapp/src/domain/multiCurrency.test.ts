// Every amount used to be assumed INR. A US holding bought through Vested is
// genuinely priced in dollars, and storing its cost as rupees baked in an
// error that compounded silently.
import { describe, expect, test } from 'vitest';
import { holdingView, fxRates, hasApproximateFx, portfolioSummary } from './portfolio';
import { findCurrency, isRateStale, rateAsOf, usesSeedRate } from './currency';
import type { FxRate, Holding } from '@/lib/types';

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

describe('recorded exchange rates beat the built-in seeds', () => {
  // The seed table said USD = 83.3 and there was no way to change it, so every
  // dollar holding was valued at 83.30 forever and nothing said so.
  const rate = (code: string, r: string, asOf = Date.now()): FxRate =>
    ({ id: code, code, rateToInr: r, asOf, source: 'manual' });

  const usd = (over: Partial<Holding> = {}): Holding => ({
    id: 'h-qqq', vaultId: 'v', symbol: 'QQQ', exchange: 'NASDAQ',
    quantity: '10', avgCost: '400', lastPrice: '500',
    assetType: 'foreign_equity', currency: 'USD', ...over,
  });

  test('a stored rate is used instead of the seed', () => {
    const seeded = holdingView(usd(), Date.now());
    const stored = holdingView(usd(), Date.now(), [rate('USD', '90')]);
    expect(stored.current.toString()).not.toBe(seeded.current.toString());
    expect(stored.current.toString()).toBe('450000'); // 10 × 500 × 90
  });

  test('cost keeps the purchase rate while market value moves with the current one', () => {
    // The whole point of holding two rates: P&L reflects the price move AND the
    // rupee's move, which is what actually happened to the money.
    const v = holdingView(usd({ fxRateAtPurchase: '80' }), Date.now(), [rate('USD', '90')]);
    expect(v.invested.toString()).toBe('320000');  // 10 × 400 × 80
    expect(v.current.toString()).toBe('450000');   // 10 × 500 × 90
    expect(v.pnl.toString()).toBe('130000');
  });

  test('changing the current rate moves market value but never cost', () => {
    const a = holdingView(usd({ fxRateAtPurchase: '80' }), Date.now(), [rate('USD', '85')]);
    const b = holdingView(usd({ fxRateAtPurchase: '80' }), Date.now(), [rate('USD', '95')]);
    expect(a.invested.toString()).toBe(b.invested.toString());
    expect(a.current.toString()).not.toBe(b.current.toString());
  });

  test('an unrecorded purchase rate is still reported as approximate', () => {
    expect(hasApproximateFx(usd())).toBe(true);
    expect(hasApproximateFx(usd({ fxRateAtPurchase: '80' }))).toBe(false);
  });

  test('a rupee holding ignores rates entirely', () => {
    const inr: Holding = { ...usd(), currency: null, assetType: 'equity_etf' };
    const v = holdingView(inr, Date.now(), [rate('USD', '999')]);
    expect(v.current.toString()).toBe('5000'); // 10 × 500, no conversion
  });

  test('a rate older than the staleness window is flagged', () => {
    const now = Date.now();
    const old = now - 120 * 86_400_000;
    expect(isRateStale('USD', [rate('USD', '90', old)], now)).toBe(true);
    expect(isRateStale('USD', [rate('USD', '90', now)], now)).toBe(false);
  });

  test('a rate that was never recorded is not "stale" — it is unrecorded', () => {
    // Different problem, reported differently: stale means we had a number and
    // it aged; unrecorded means we are showing a built-in guess.
    expect(isRateStale('USD', [], Date.now())).toBe(false);
    expect(rateAsOf('USD', [])).toBeNull();
  });
});

describe('the $102 case — a real reported defect', () => {
  // Reported from actual use: $102 invested in a US fund showed ₹8,000-odd in
  // Khazana while the real cost was ₹9,800. The cause was the built-in seed
  // rate of 83.30 standing in for a real rate of about 96, a 15% understatement
  // presented with no indication that the rate was a guess.
  const qqq = (over: Partial<Holding> = {}): Holding => ({
    id: 'h-qqq', vaultId: 'v', symbol: 'QQQ', exchange: 'NASDAQ',
    quantity: '1', avgCost: '102', lastPrice: '102',
    assetType: 'foreign_equity', currency: 'USD', ...over,
  });

  const rate = (r: string): FxRate =>
    ({ id: 'USD', code: 'USD', rateToInr: r, asOf: Date.now(), source: 'manual' });

  test('with the real rate recorded, the figure matches what was actually paid', () => {
    const v = holdingView(qqq({ fxRateAtPurchase: '96.08' }), Date.now(), [rate('96.08')]);
    expect(v.invested.toDecimalPlaces(0).toString()).toBe('9800');
  });

  test('a currency with no recorded rate is detectable, so the UI can say so', () => {
    // The actual defect was not the arithmetic — it was the silence. Nothing on
    // the Portfolio screen distinguished a converted guess from a real figure.
    expect(usesSeedRate('USD', [])).toBe(true);
    expect(usesSeedRate('USD', [rate('96')])).toBe(false);
    expect(usesSeedRate('INR', [])).toBe(false);
    expect(usesSeedRate(null, [])).toBe(false);
  });

  test('recording the rate corrects the valuation with no re-entry', () => {
    const before = holdingView(qqq(), Date.now(), []);
    const after = holdingView(qqq(), Date.now(), [rate('96.08')]);
    expect(after.current.gt(before.current)).toBe(true);
    expect(after.current.toDecimalPlaces(0).toString()).toBe('9800');
  });
});
