// The narrative engine, and the compliance rule it exists to keep.
//
// The ban-list group is the actual guarantee, and the twin of the one in
// test/unit/narrative_engine_test.dart. This page previously shipped
// "Prioritising high-APR debt first saves the most interest" and "Consider
// diversifying into long-term assets" — both written in good faith, both
// regulated advice. A style guide would not have caught either.
import { describe, test, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  generateNarratives,
  headlineNarrative,
  weeklyReport,
  BANNED_PHRASES,
  NARRATIVE_DISCLAIMER,
  type NarrativeContext,
} from './narrative';
import { healthScore } from './health';
import { EMPTY_INVESTMENTS, totalsOf } from './investmentTotals';
import type { AssetType, NetWorthSnapshot } from '@/lib/types';

const NOW = Date.parse('2026-06-15T00:00:00.000Z');
const DAY = 86_400_000;
const d = (v: number) => new Decimal(v);

const snap = (daysAgo: number, netWorth: number): NetWorthSnapshot => ({
  id: `snap-${daysAgo}`, vaultId: 'v', date: NOW - daysAgo * DAY,
  netWorth: String(netWorth), cash: String(netWorth), investments: '0', liabilities: '0',
});

function ctx(over: {
  investments?: Partial<Record<AssetType, number>>;
  indicativeValue?: number;
  safeToSpend?: NarrativeContext['safeToSpend'];
  anomalies?: NarrativeContext['anomalies'];
  snapshots?: NetWorthSnapshot[];
  categoryNames?: Record<string, string>;
} = {}): NarrativeContext {
  const investments = over.investments
    ? totalsOf(over.investments, { indicativeValue: over.indicativeValue })
    : EMPTY_INVESTMENTS;
  return {
    health: healthScore({ txns: [], investments, liabilities: [], now: NOW }),
    investments,
    safeToSpend: over.safeToSpend,
    anomalies: over.anomalies ?? [],
    snapshots: over.snapshots ?? [],
    categoryNames: over.categoryNames ?? {},
    formatMoney: (v) => `₹${v.round()}`,
    now: NOW,
  };
}

/** A spread of vault shapes, so every rule gets a chance to fire. */
const matrix = (): NarrativeContext[] => [
  ctx(),
  ctx({
    investments: { equity_etf: 500000, bond: 300000 },
    indicativeValue: 300000,
    safeToSpend: { remaining: d(18200), perDay: d(1400), daysLeft: 13 },
    anomalies: [{ categoryId: 'food', current: d(9400), avg: d(4500), ratio: 2.1 }],
    snapshots: [snap(90, 1000000), snap(1, 1420000)],
    categoryNames: { food: 'Food' },
  }),
  ctx({ snapshots: [snap(90, 1420000), snap(1, 1000000)] }),
  ctx({ investments: { bond: 500000 }, indicativeValue: 500000 }),
  ctx({ safeToSpend: { remaining: d(0), perDay: d(0), daysLeft: 0 } }),
];

describe('SEBI ban list', () => {
  test('no generated sentence contains a banned phrase', () => {
    for (const context of matrix()) {
      for (const n of generateNarratives(context)) {
        const lower = n.text.toLowerCase();
        for (const banned of BANNED_PHRASES) {
          expect(
            lower.includes(banned),
            `rule "${n.id}" produced advice-shaped text (contains "${banned}"): ${n.text}`,
          ).toBe(false);
        }
      }
    }
  });

  test('the weekly report is clean too', () => {
    for (const context of matrix()) {
      const report = weeklyReport(context).toLowerCase();
      for (const banned of BANNED_PHRASES) {
        expect(report.includes(banned), `report contains "${banned}"`).toBe(false);
      }
    }
  });

  test('the disclaimer exists and says what it must', () => {
    expect(NARRATIVE_DISCLAIMER.toLowerCase()).toContain('not investment advice');
  });

  test('the banned list matches the Dart one', () => {
    // Kept as a literal so a change on one side has to be made on both.
    expect(BANNED_PHRASES).toEqual([
      'buy ', 'sell ', 'invest in', 'recommend', 'you should', 'guaranteed',
      'will return', 'best fund', 'top pick', 'consider ', 'aim for',
      'prioritis', 'prioritiz',
    ]);
  });
});

describe('rules stay silent rather than filling space', () => {
  test('an empty vault says only what it can, and nothing generic', () => {
    expect(generateNarratives(ctx()).map((n) => n.id)).toEqual(['untracked_category']);
  });

  test('one snapshot is not a trend', () => {
    const ids = generateNarratives(ctx({ snapshots: [snap(1, 1000000)] })).map((n) => n.id);
    expect(ids).not.toContain('networth_change');
  });

  test('under 28 days of history is not a monthly change', () => {
    const ids = generateNarratives(
      ctx({ snapshots: [snap(10, 1000000), snap(1, 1200000)] }),
    ).map((n) => n.id);
    expect(ids, 'a fortnight of movement is mostly one salary landing')
      .not.toContain('networth_change');
  });

  test('an anomaly with no known category name is skipped', () => {
    const ids = generateNarratives(ctx({
      anomalies: [{ categoryId: 'unknown', current: d(9400), avg: d(4500), ratio: 2.1 }],
    })).map((n) => n.id);
    expect(ids).not.toContain('category_spike');
  });

  test('a lightly-manual portfolio raises no pricing headline', () => {
    const ids = generateNarratives(
      ctx({ investments: { equity_etf: 1000000 }, indicativeValue: 50000 }),
    ).map((n) => n.id);
    expect(ids).not.toContain('stale_pricing');
  });
});

describe('content', () => {
  test('a rising net worth reads as rising', () => {
    const n = generateNarratives(ctx({ snapshots: [snap(90, 1000000), snap(1, 1420000)] }))
      .find((x) => x.id === 'networth_change')!;
    expect(n.text).toContain('up ₹420000');
    expect(n.tone).toBe('positive');
  });

  test('a falling net worth reads as falling, without a negative sign', () => {
    const n = generateNarratives(ctx({ snapshots: [snap(90, 1420000), snap(1, 1000000)] }))
      .find((x) => x.id === 'networth_change')!;
    expect(n.text).toContain('down ₹420000');
    expect(n.text).not.toContain('-');
    expect(n.tone).toBe('caution');
  });

  test('an untracked category says what the app needs, not what to do', () => {
    const n = generateNarratives(ctx()).find((x) => x.id === 'untracked_category')!;
    expect(n.text).toContain('not scored yet');
    expect(n.text).toContain('needs');
  });

  test('the headline is the highest-priority sentence', () => {
    const context = ctx({
      safeToSpend: { remaining: d(18200), perDay: d(1400), daysLeft: 13 },
      anomalies: [{ categoryId: 'food', current: d(9400), avg: d(4500), ratio: 2.1 }],
      categoryNames: { food: 'Food' },
    });
    // A spending spike outranks "here is your daily allowance".
    expect(headlineNarrative(context)!.id).toBe('category_spike');
  });

  test('every sentence is complete and uniquely identified', () => {
    const all = generateNarratives(matrix()[1]);
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
    for (const n of all) expect(n.text.endsWith('.'), n.text).toBe(true);
  });

  test('the weekly report joins at most three sentences', () => {
    const context = matrix()[1];
    const all = generateNarratives(context);
    expect(all.length).toBeGreaterThan(3);
    expect(weeklyReport(context)).toBe(all.slice(0, 3).map((n) => n.text).join(' '));
  });
});
