import { describe, test, expect } from 'vitest';
import { applyQuotes } from './refresh';
import type { Quote } from './yahoo';
import type { Holding } from '@/lib/types';

const h = (over: Partial<Holding>): Holding => ({
  id: 'h1', vaultId: 'v1', symbol: 'INFY', exchange: 'NSE',
  quantity: '10', avgCost: '1000', assetType: 'equity_etf', ...over,
});

const q = (price: string, previousClose: string | null = null): Quote => ({ price, previousClose });
const NOW = 1_757_000_000_000;

describe('applyQuotes', () => {
  test('writes price, previous close, timestamp and provenance', () => {
    const { updates, priced } = applyQuotes(
      [h({ symbol: 'INFY' })],
      new Map([['INFY.NS', q('1168.7', '1180.2')]]),
      NOW,
    );
    expect(priced).toBe(1);
    expect(updates[0]).toMatchObject({
      lastPrice: '1168.7', previousClose: '1180.2', priceAsOf: NOW, priceSource: 'yahoo',
    });
  });

  // A quote is an observation about the market, not about the position.
  test('never touches quantity or cost basis', () => {
    const before = h({ quantity: '10', avgCost: '1000' });
    const [after] = applyQuotes([before], new Map([['INFY.NS', q('9999')]]), NOW).updates;
    expect(after.quantity).toBe('10');
    expect(after.avgCost).toBe('1000');
  });

  // HoldingEditor learned this the hard way: writing a bare literal wipes the
  // fields the writer does not know about.
  test('carries through fields the quote knows nothing about', () => {
    const before = h({ sector: 'Healthcare', country: 'IN', name: 'Dr Reddy', firstPurchaseDate: 123 });
    const [after] = applyQuotes([before], new Map([['INFY.NS', q('100')]]), NOW).updates;
    expect(after).toMatchObject({ sector: 'Healthcare', country: 'IN', name: 'Dr Reddy', firstPurchaseDate: 123 });
  });

  // A stale real price that states its age beats a blank column.
  test('leaves a holding untouched when its ticker did not answer', () => {
    const before = h({ lastPrice: '900', priceAsOf: 1, priceSource: 'import' });
    const { updates, priced } = applyQuotes([before], new Map(), NOW);
    expect(updates).toEqual([]);
    expect(priced).toBe(0);
  });

  test('a quote without a previous close keeps the recorded one', () => {
    const before = h({ previousClose: '1180.2' });
    const [after] = applyQuotes([before], new Map([['INFY.NS', q('1168.7', null)]]), NOW).updates;
    expect(after.previousClose).toBe('1180.2');
    expect(after.lastPrice).toBe('1168.7');
  });

  test('leaves previousClose null when neither side has one', () => {
    const [after] = applyQuotes([h({})], new Map([['INFY.NS', q('1168.7')]]), NOW).updates;
    expect(after.previousClose).toBeNull();
  });

  // The market was flat, not the data stale — the price was confirmed now.
  test('refreshes the timestamp even when the price is unchanged', () => {
    const before = h({ lastPrice: '100', priceAsOf: 1 });
    const [after] = applyQuotes([before], new Map([['INFY.NS', q('100')]]), NOW).updates;
    expect(after.priceAsOf).toBe(NOW);
  });

  test('skips holdings Yahoo cannot price by ticker', () => {
    const { updates, priced } = applyQuotes(
      [h({ id: 'a', assetType: 'equity_mf' }), h({ id: 'b', assetType: 'fd' })],
      new Map([['INFY.NS', q('100')]]),
      NOW,
    );
    expect(updates).toEqual([]);
    expect(priced).toBe(0);
  });

  test('matches each holding to its own exchange-suffixed quote', () => {
    const { updates } = applyQuotes(
      [h({ id: 'n', symbol: 'INFY', exchange: 'NSE' }), h({ id: 'b', symbol: 'INFY', exchange: 'BSE' })],
      new Map([['INFY.NS', q('100')], ['INFY.BO', q('101')]]),
      NOW,
    );
    expect(updates.find((u) => u.id === 'n')?.lastPrice).toBe('100');
    expect(updates.find((u) => u.id === 'b')?.lastPrice).toBe('101');
  });
});
