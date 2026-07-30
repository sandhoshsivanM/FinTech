import { describe, expect, it } from 'vitest';
import {
  ASSET_GROUP_ORDER,
  UNCLASSIFIED_KEY,
  allocationByGroup,
  portfolioSummary,
  rollup,
  type RollupDimension,
} from './portfolio';
import { lookupClassification, parseInstrumentMaster } from './instrumentMaster';
import type { AssetType, Holding } from '@/lib/types';

/**
 * Paired with test/unit/portfolio_analytics_test.dart. Both sides assert the same
 * invariant: a roll-up along any dimension must sum exactly to the portfolio
 * total.
 */

function holding(
  id: string,
  opts: {
    symbol?: string;
    qty: string;
    avgCost: string;
    lastPrice?: string | null;
    assetType?: AssetType;
  },
): Holding {
  return {
    id,
    vaultId: 'v1',
    symbol: opts.symbol ?? id,
    exchange: 'NSE',
    quantity: opts.qty,
    avgCost: opts.avgCost,
    lastPrice: opts.lastPrice ?? null,
    assetType: opts.assetType ?? 'equity_etf',
  };
}

// The same fixture as the Dart test, so the two implementations are checked
// against identical hand-computed arithmetic:
//   INFY  IT         10 @ 100 = 1000 cost, @150 -> 1500 value
//   TCS   IT          5 @ 200 = 1000 cost, @180 ->  900 value
//   HDFCB Financials 20 @  50 = 1000 cost, @ 60 -> 1200 value
// Totals: cost 3000, value 3600, P&L +600
// IT: cost 2000, value 2400, P&L +400 (+20%)
// Financials: cost 1000, value 1200, P&L +200 (+20%)
const FIXTURE: Holding[] = [
  holding('INFY', { qty: '10', avgCost: '100', lastPrice: '150' }),
  holding('TCS', { qty: '5', avgCost: '200', lastPrice: '180' }),
  holding('HDFCBANK', { qty: '20', avgCost: '50', lastPrice: '60' }),
];

const MASTER = parseInstrumentMaster({
  schema_version: 1,
  instruments: [
    { symbol: 'INFY', sector: 'Information Technology', industry: 'IT - Software', cap: 'large' },
    { symbol: 'TCS', sector: 'Information Technology', industry: 'IT - Software', cap: 'large' },
    { symbol: 'HDFCBANK', sector: 'Financial Services', industry: 'Banks', cap: 'large' },
  ],
});

const classify = (h: Holding) =>
  lookupClassification(MASTER, { symbol: h.symbol });

describe('rollup', () => {
  it('matches hand-computed sector P&L', () => {
    const rows = rollup(FIXTURE, 'sector', classify);
    const bySector = new Map(rows.map((r) => [r.key, r]));

    const it_ = bySector.get('Information Technology')!;
    expect(it_.invested.toString()).toBe('2000');
    expect(it_.current.toString()).toBe('2400');
    expect(it_.pnl.toString()).toBe('400');
    expect(it_.pnlPct).toBeCloseTo(20, 6);
    expect(it_.holdingCount).toBe(2);

    const fin = bySector.get('Financial Services')!;
    expect(fin.pnl.toString()).toBe('200');
    expect(fin.pnlPct).toBeCloseTo(20, 6);
  });

  it('ACCEPTANCE: sums exactly to the portfolio total on every dimension', () => {
    const summary = portfolioSummary(FIXTURE);
    const dimensions: RollupDimension[] = [
      'sector', 'industry', 'marketCap', 'assetGroup', 'assetType', 'currency',
    ];
    for (const dim of dimensions) {
      const rows = rollup(FIXTURE, dim, classify);
      const current = rows.reduce((s, r) => s.plus(r.current), rows[0].current.times(0));
      const invested = rows.reduce((s, r) => s.plus(r.invested), rows[0].invested.times(0));
      const pnl = rows.reduce((s, r) => s.plus(r.pnl), rows[0].pnl.times(0));

      expect(current.toString(), `value mismatch for ${dim}`).toBe(summary.current.toString());
      expect(invested.toString(), `cost mismatch for ${dim}`).toBe(summary.invested.toString());
      expect(pnl.toString(), `P&L mismatch for ${dim}`).toBe(summary.pnl.toString());
    }
  });

  it('sorts rows by value descending', () => {
    const rows = rollup(FIXTURE, 'assetType', classify);
    expect(rows[0].current.comparedTo(rows[rows.length - 1].current)).toBeGreaterThanOrEqual(0);
  });

  it('puts an unclassified holding in an explicit row rather than dropping it', () => {
    const rows = rollup(
      [...FIXTURE, holding('MYSTERY', { qty: '1', avgCost: '500', lastPrice: '500' })],
      'sector',
      classify,
    );
    const keys = rows.map((r) => r.key);
    expect(keys).toContain(UNCLASSIFIED_KEY);
    // Dropping it would break reconciliation.
    const total = rows.reduce((s, r) => s.plus(r.invested), rows[0].invested.times(0));
    expect(total.toString()).toBe('3500');
  });

  it('counts unpriced holdings so the UI can disclose the understatement', () => {
    const rows = rollup(
      [holding('INFY', { qty: '1', avgCost: '100' })], // no lastPrice
      'sector',
      classify,
    );
    expect(rows[0].unpricedCount).toBe(1);
    // An unpriced holding contributes no P&L rather than vanishing.
    expect(rows[0].pnl.toString()).toBe('0');
    expect(rows[0].invested.toString()).toBe('100');
  });

  it('returns null pnlPct rather than 0 when cost is zero', () => {
    const rows = rollup([holding('FREE', { qty: '0', avgCost: '0' })], 'sector', classify);
    expect(rows[0].pnlPct).toBeNull();
  });

  it('works with no classifier at all', () => {
    const rows = rollup(FIXTURE, 'sector');
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(UNCLASSIFIED_KEY);
  });
});

describe('allocationByGroup', () => {
  it('emits the fixed chart order, not value order', () => {
    // Cash has the larger value but equity must still come first, or the
    // validated palette's colourblind separation no longer holds.
    const holdings = [
      holding('EQ', { qty: '1', avgCost: '100', lastPrice: '100' }),
      holding('CASH', { qty: '1', avgCost: '9999', lastPrice: '9999', assetType: 'cash' }),
    ];
    expect(allocationByGroup(holdings).map((r) => r.key)).toEqual(['equity', 'cash']);

    // The value-sorted roll-up would indeed reverse them.
    expect(rollup(holdings, 'assetGroup')[0].key).toBe('cash');
  });

  it('omits groups with no holdings', () => {
    const rows = allocationByGroup([holding('EQ', { qty: '1', avgCost: '1' })]);
    expect(rows).toHaveLength(1);
  });

  it('never emits a group outside the validated order', () => {
    const rows = allocationByGroup(FIXTURE);
    for (const r of rows) {
      expect(ASSET_GROUP_ORDER).toContain(r.key as never);
    }
  });
});

describe('instrument master', () => {
  it('prefers ISIN over symbol', () => {
    const m = parseInstrumentMaster({
      instruments: [
        { symbol: 'X', isin: 'INE000000001', sector: 'By ISIN', industry: 'i' },
        { symbol: 'X', sector: 'By Symbol', industry: 'i' },
      ],
    });
    expect(lookupClassification(m, { symbol: 'X', isin: 'INE000000001' })?.sector).toBe('By ISIN');
    expect(lookupClassification(m, { symbol: 'X' })?.sector).toBe('By Symbol');
  });

  it('is case-insensitive on lookup', () => {
    expect(lookupClassification(MASTER, { symbol: 'infy' })?.sector)
      .toBe('Information Technology');
  });

  it('returns undefined for an unknown symbol rather than guessing', () => {
    expect(lookupClassification(MASTER, { symbol: 'NOPE' })).toBeUndefined();
  });

  it('skips records missing a sector or industry', () => {
    const m = parseInstrumentMaster({
      instruments: [
        { symbol: 'A', sector: 'S' }, // no industry
        { symbol: 'B', industry: 'I' }, // no sector
        { symbol: 'C', sector: 'S', industry: 'I' },
      ],
    });
    expect(m.bySymbol.size).toBe(1);
    expect(m.bySymbol.has('C')).toBe(true);
  });

  it('tolerates malformed input without throwing', () => {
    expect(parseInstrumentMaster(null).bySymbol.size).toBe(0);
    expect(parseInstrumentMaster({}).bySymbol.size).toBe(0);
    expect(parseInstrumentMaster({ instruments: 'nope' }).bySymbol.size).toBe(0);
    expect(parseInstrumentMaster({ instruments: [null, 42, 'x'] }).bySymbol.size).toBe(0);
  });

  it('ignores an invalid cap value', () => {
    const m = parseInstrumentMaster({
      instruments: [{ symbol: 'A', sector: 'S', industry: 'I', cap: 'gigantic' }],
    });
    expect(m.bySymbol.get('A')!.cap).toBeUndefined();
  });
});
