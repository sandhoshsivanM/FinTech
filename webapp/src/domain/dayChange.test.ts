import { describe, test, expect } from 'vitest';
import { dayChange, hasRealClose, priceAsOfLabel, rowDayPct } from './dayChange';
import { parseHoldingsCsv, planImport, importCounts } from '@/lib/holdingsCsv';
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

describe('the per-row rule', () => {
  test('a recorded close beats the demo feed', () => {
    const row = h({ symbol: 'A', lastPrice: '110', previousClose: '100' });
    expect(rowDayPct(row, true, true)).toBeCloseTo(10, 6);
  });

  test('one real close in the book silences the feed for every other row', () => {
    // The /holdings grid used to ignore previousClose entirely and synthesise
    // every row, so a fully imported book still showed invented moves there
    // while /investments showed the truth. Same rule, one implementation.
    const book = [
      h({ symbol: 'REAL', lastPrice: '110', previousClose: '100' }),
      h({ symbol: 'NOCLOSE', lastPrice: '500' }),
    ];
    const anyReal = hasRealClose(book);
    expect(anyReal).toBe(true);
    expect(rowDayPct(book[1], anyReal, true)).toBeNull();
  });

  test('with no closes anywhere the feed fills in, but only when demo is on', () => {
    const row = h({ symbol: 'NOCLOSE', lastPrice: '500' });
    expect(rowDayPct(row, false, false)).toBeNull();
    expect(rowDayPct(row, false, true)).not.toBeNull();
  });

  test('a close with no last price cannot be measured', () => {
    expect(hasRealClose([h({ symbol: 'A', previousClose: '100' })])).toBe(true);
    expect(rowDayPct(h({ symbol: 'A', previousClose: '100' }), true, true)).toBeNull();
  });
});

describe('priceAsOfLabel', () => {
  const now = Date.UTC(2026, 7, 7, 6, 0); // 07 Aug 2026, 11:30 IST

  test('a large portfolio does not blow the argument limit', () => {
    // `Math.max(...stamps)` threw RangeError past ~100k entries, so the
    // dashboards that failed would have been the biggest portfolios.
    const many = Array.from({ length: 200_000 }, (_, i) =>
      h({ symbol: `S${i}`, lastPrice: '110', previousClose: '100', priceAsOf: now - i }));
    expect(() => priceAsOfLabel(many, now)).not.toThrow();
  });

  test('prices taken today read as a live comparison', () => {
    const book = [h({ symbol: 'A', lastPrice: '110', previousClose: '100', priceAsOf: now - 3_600_000 })];
    expect(priceAsOfLabel(book, now)).toBe('Against yesterday’s close');
  });

  test('older prices name their date instead of implying "now"', () => {
    const book = [h({ symbol: 'A', lastPrice: '110', previousClose: '100', priceAsOf: now - 3 * 86_400_000 })];
    expect(priceAsOfLabel(book, now)).toMatch(/^Prices from /);
  });

  test('holdings from before the field existed keep the old wording', () => {
    expect(priceAsOfLabel([h({ symbol: 'A', lastPrice: '110', previousClose: '100' })], now))
      .toBe('Against yesterday’s close');
  });
});

describe('planImport', () => {
  const ctx = { vaultId: 'v', newId: () => 'new-id', now: 1_700_000_000_000 };
  const row = (over: Partial<ReturnType<typeof parseHoldingsCsv>['rows'][number]>) => ({
    symbol: 'TCS', exchange: 'NSE', quantity: '10', avgCost: '2400',
    lastPrice: '2452.70', previousClose: '2440', assetType: 'equity_etf' as const, ...over,
  });

  test('a position already on file is updated, not duplicated', () => {
    const existing = [h({ id: 'old', symbol: 'TCS', quantity: '5', avgCost: '2000' })];
    const plan = planImport([row({})], existing, ctx);
    expect(plan.created).toBe(0);
    expect(plan.updated).toBe(1);
    expect(plan.records[0].id).toBe('old');
    expect(plan.records[0].quantity).toBe('10');
    expect(plan.records[0].previousClose).toBe('2440');
    expect(plan.records[0].priceAsOf).toBe(ctx.now);
  });

  test('the same ticker on another exchange is a separate position', () => {
    const existing = [h({ id: 'old', symbol: 'TCS', exchange: 'BSE' })];
    const plan = planImport([row({})], existing, ctx);
    expect(plan.created).toBe(1);
    expect(plan.records[0].id).toBe('new-id');
  });

  test('what the CSV cannot know survives the update', () => {
    const existing = [h({
      id: 'old', symbol: 'TCS', firstPurchaseDate: 1_600_000_000_000,
      sector: 'IT', name: 'Tata Consultancy', assetType: 'equity_mf',
    })];
    const plan = planImport([row({ assetType: 'equity_etf' })], existing, ctx);
    expect(plan.records[0].firstPurchaseDate).toBe(1_600_000_000_000);
    expect(plan.records[0].sector).toBe('IT');
    expect(plan.records[0].name).toBe('Tata Consultancy');
    // The "import as" dropdown classifies new rows; it must not reclassify a
    // position the user already typed.
    expect(plan.records[0].assetType).toBe('equity_mf');
  });

  test('a fresh price never pairs with a stale close', () => {
    // The export carries an LTP but no day-change column. Keeping the old
    // previousClose would compute a move that never happened.
    const existing = [h({ id: 'old', symbol: 'TCS', lastPrice: '2400', previousClose: '2380' })];
    const plan = planImport([row({ previousClose: '' })], existing, ctx);
    expect(plan.records[0].lastPrice).toBe('2452.70');
    expect(plan.records[0].previousClose).toBeNull();
  });

  test('an export with no price column at all leaves recorded prices alone', () => {
    const existing = [h({ id: 'old', symbol: 'TCS', lastPrice: '2400', previousClose: '2380', priceAsOf: 42 })];
    const plan = planImport([row({ lastPrice: '', previousClose: '' })], existing, ctx);
    expect(plan.records[0].lastPrice).toBe('2400');
    expect(plan.records[0].previousClose).toBe('2380');
    expect(plan.records[0].priceAsOf).toBe(42);
  });

  test('matching ignores case on both symbol and exchange', () => {
    const existing = [h({ id: 'old', symbol: 'tcs', exchange: 'nse' })];
    expect(planImport([row({})], existing, ctx).updated).toBe(1);
  });

  test('an import into an empty book creates everything', () => {
    const plan = planImport([row({}), row({ symbol: 'INFY' })], [], ctx);
    expect(plan.created).toBe(2);
    expect(plan.updated).toBe(0);
  });

  test('importCounts agrees with the plan it previews', () => {
    const existing = [h({ id: 'old', symbol: 'TCS' })];
    const rows = [row({}), row({ symbol: 'INFY' })];
    expect(importCounts(rows, existing)).toEqual({ created: 1, updated: 1 });
    const plan = planImport(rows, existing, ctx);
    expect({ created: plan.created, updated: plan.updated }).toEqual(importCounts(rows, existing));
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
