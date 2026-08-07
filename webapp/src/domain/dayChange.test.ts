import { describe, test, expect } from 'vitest';
import { dayChange } from './dayChange';
import { parseHoldingsCsv } from '@/lib/holdingsCsv';
import type { Holding } from '@/lib/types';

const h = (over: Partial<Holding>): Holding => ({
  id: over.symbol ?? 'x', vaultId: 'v', symbol: over.symbol ?? 'X', exchange: 'NSE',
  quantity: '10', avgCost: '100', assetType: 'equity_etf', ...over,
} as Holding);

describe('dayChange', () => {
  test('a recorded previous close gives a real, correctly signed figure', () => {
    // 10 × (110 − 100) = +100 on a covered value of 1100.
    const d = dayChange([h({ symbol: 'A', lastPrice: '110', previousClose: '100' })], true);
    expect(d.isReal).toBe(true);
    expect(d.pnl).toBeCloseTo(100, 6);
    expect(d.pct).toBeCloseTo((100 / 1100) * 100, 6);
  });

  test('real closes win over the demo feed, and the demo rows are dropped', () => {
    // This is the whole point: a portfolio imported from a broker read −0.31%
    // against the broker's own +0.24% because the synthesised feed outranked
    // the real data. One real close must now silence the feed entirely.
    const holdings = [
      h({ symbol: 'REAL', lastPrice: '110', previousClose: '100' }),
      h({ symbol: 'NOCLOSE', lastPrice: '500' }),
    ];
    const d = dayChange(holdings, true);
    expect(d.isReal).toBe(true);
    expect(d.pnl).toBeCloseTo(100, 6);   // NOCLOSE contributes nothing
    expect(d.covered).toBe(1);
    expect(d.total).toBe(2);
  });

  test('the percentage is against covered value, not the whole book', () => {
    const d = dayChange([
      h({ symbol: 'A', lastPrice: '110', previousClose: '100' }),
      h({ symbol: 'B', lastPrice: '1000' }),
    ], false);
    // 100 / 1100, NOT 100 / (1100 + 10000).
    expect(d.pct).toBeCloseTo(9.0909, 3);
  });

  test('no closes and no demo feed means no number at all', () => {
    const d = dayChange([h({ symbol: 'A', lastPrice: '110' })], false);
    expect(d.pnl).toBeNull();
    expect(d.pct).toBeNull();
    expect(d.isReal).toBe(false);
  });

  test('the demo fallback is flagged so the UI must badge it', () => {
    const d = dayChange([h({ symbol: 'A', lastPrice: '110' })], true);
    expect(d.pnl).not.toBeNull();
    expect(d.isReal).toBe(false);
  });

  test('an empty book says nothing', () => {
    expect(dayChange([], true).pnl).toBeNull();
  });
});

describe('holdings CSV previous close', () => {
  test("derives yesterday's close from a broker's day-P&L column", () => {
    // Upstox's export shape. IDFCFIRSTB: 100 @ LTP 84.62, day P&L −73.00
    // → prev close = 84.62 − (−73 / 100) = 85.35.
    const csv = [
      'Symbol,Net Qty,Avg Price,LTP,Current Value,Day P&L,Overall P&L',
      'IDFCFIRSTB,100,74.66,84.62,8462.00,-73.00,996.00',
    ].join('\n');
    const { rows } = parseHoldingsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].previousClose)).toBeCloseTo(85.35, 6);
  });

  test('an explicit previous-close column is preferred over arithmetic', () => {
    const csv = [
      'Symbol,Qty,Avg Price,LTP,Prev Close,Day P&L',
      'TCS,10,2400,2452.70,2440,127',
    ].join('\n');
    const { rows } = parseHoldingsCsv(csv);
    expect(Number(rows[0].previousClose)).toBe(2440);
  });

  test('no close and no day P&L leaves the field empty rather than guessing', () => {
    const { rows } = parseHoldingsCsv('Symbol,Qty,Avg Price,LTP\nINFY,10,1100,1175.10');
    expect(rows[0].previousClose).toBe('');
  });

  test('an imported row feeds straight into a real day change', () => {
    const csv = [
      'Symbol,Net Qty,Avg Price,LTP,Day P&L',
      'IDFCFIRSTB,100,74.66,84.62,-73.00',
    ].join('\n');
    const { rows } = parseHoldingsCsv(csv);
    const d = dayChange([h({
      symbol: rows[0].symbol, quantity: rows[0].quantity,
      lastPrice: rows[0].lastPrice, previousClose: rows[0].previousClose,
    })], true);
    expect(d.isReal).toBe(true);
    expect(d.pnl).toBeCloseTo(-73, 6);
  });
});
