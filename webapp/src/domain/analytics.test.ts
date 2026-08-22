// Analytics: the structural reads, and the honesty rules they have to keep.
//
// All of this used to be computed inline in the page component, where none of
// it could be tested and none of it could be shared with the Flutter client.
import { describe, test, expect } from 'vitest';
import { D } from '@/lib/money';
import type { Holding } from '@/lib/types';
import { holdingView, rollup, allocationByGroup, UNCLASSIFIED_KEY } from './portfolio';
import {
  returnBuckets, positionWeights, riskStats, diversificationScore,
  diversificationBand, returnQualityScore, extremes, POSITION_ALERT_WEIGHT,
} from './analytics';

const hold = (over: Partial<Holding>): Holding => ({
  id: over.symbol ?? 'h', vaultId: 'v', symbol: 'X', exchange: 'NSE',
  quantity: '100', avgCost: '100', lastPrice: '100', assetType: 'equity_etf', ...over,
} as Holding);

/** A position worth `qty × price` that is `pct` above (or below) its cost. */
const at = (symbol: string, pct: number, qty = 100, price = 100): Holding =>
  hold({ id: symbol, symbol, quantity: String(qty), lastPrice: String(price),
    avgCost: String(price / (1 + pct / 100)) });

const views = (hs: Holding[]) => hs.map((h) => holdingView(h));

describe('return distribution', () => {
  test('is a count histogram — every position lands in exactly one bucket', () => {
    const hs = [at('A', -25), at('B', -4), at('C', 3), at('D', 15), at('E', 55)];
    const bins = returnBuckets(views(hs));
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(hs.length);
  });

  test('puts each return in the bucket its label claims', () => {
    const bins = returnBuckets(views([at('A', -25), at('B', -4), at('C', 3), at('D', 15), at('E', 55)]));
    const by = Object.fromEntries(bins.map((b) => [b.label, b.count]));
    expect(by['<−10']).toBe(1);
    expect(by['−10–0']).toBe(1);
    expect(by['0–10']).toBe(1);
    expect(by['10–20']).toBe(1);
    expect(by['>40']).toBe(1);
  });

  test('marks exactly the below-cost buckets as negative', () => {
    const negatives = returnBuckets([]).filter((b) => b.negative).map((b) => b.label);
    expect(negatives).toEqual(['<−10', '−10–0']);
  });

  test('an empty book still returns the full axis', () => {
    // A histogram whose buckets appear and disappear with the data is not
    // comparable with itself week to week.
    const bins = returnBuckets([]);
    expect(bins).toHaveLength(7);
    expect(bins.every((b) => b.count === 0)).toBe(true);
  });

  test('a position exactly on its cost basis counts as working, not losing', () => {
    const bins = returnBuckets(views([at('A', 0)]));
    expect(bins.find((b) => b.label === '0–10')!.count).toBe(1);
    expect(bins.filter((b) => b.negative).every((b) => b.count === 0)).toBe(true);
  });
});

describe('concentration is measured per position, not per group', () => {
  test('ranks by weight, heaviest first, and the weights sum to one', () => {
    const w = positionWeights(views([
      at('SMALL', 0, 10), at('BIG', 0, 60), at('MID', 0, 30),
    ]));
    expect(w.map((x) => x.symbol)).toEqual(['BIG', 'MID', 'SMALL']);
    expect(w.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
  });

  test('flags a position at or above the alert weight', () => {
    // 12 of 100 units of value = 12%, over the 8% ceiling.
    const w = positionWeights(views([at('HEAVY', 0, 12), at('REST', 0, 88)]));
    expect(w.find((x) => x.symbol === 'HEAVY')!.flagged).toBe(true);
    expect(w.find((x) => x.symbol === 'REST')!.flagged).toBe(true);
  });

  test('does not flag a position below the ceiling', () => {
    const w = positionWeights(views(
      Array.from({ length: 20 }, (_, i) => at(`H${i}`, 0, 5)),
    ));
    expect(w.every((x) => x.weight < POSITION_ALERT_WEIGHT)).toBe(true);
    expect(w.some((x) => x.flagged)).toBe(false);
  });

  test('a worthless book yields no weights rather than dividing by zero', () => {
    expect(positionWeights(views([at('A', 0, 100, 0)]))).toEqual([]);
    expect(positionWeights([])).toEqual([]);
  });
});

describe('risk stats', () => {
  const build = (hs: Holding[]) => riskStats(
    hs, views(hs), allocationByGroup(hs), rollup(hs, 'sector'), UNCLASSIFIED_KEY, 19,
  );

  test('counts only classified sectors, against the full universe', () => {
    // Nothing classifies without the instrument master, so this is the honest
    // floor: zero of nineteen, not "1 of 19 — Unclassified".
    const s = build([at('A', 0), at('B', 0)]);
    expect(s.sectorsRepresented).toBe(0);
    expect(s.sectorUniverse).toBe(19);
  });

  test('names the largest position and its weight', () => {
    const s = build([at('BIG', 0, 70), at('SMALL', 0, 30)]);
    expect(s.largest).toEqual({ symbol: 'BIG', weight: 0.7 });
  });

  test('top-5 weight is the whole book when there are five or fewer', () => {
    const s = build([at('A', 0), at('B', 0), at('C', 0)]);
    expect(s.top5Weight).toBeCloseTo(1, 10);
  });

  test('top-5 weight excludes the tail when there are more', () => {
    const hs = [
      at('A', 0, 20), at('B', 0, 20), at('C', 0, 20), at('D', 0, 20), at('E', 0, 10),
      at('F', 0, 5), at('G', 0, 5),
    ];
    expect(build(hs).top5Weight).toBeCloseTo(0.9, 10);
  });

  test('an all-equity book reports full equity weight and no other sleeve', () => {
    const s = build([at('A', 0), at('B', 0)]);
    expect(s.equityWeight).toBeCloseTo(1, 10);
    expect(s.nonEquitySleeves).toBe(0);
  });

  test('a non-equity holding shows up as a sleeve', () => {
    const s = build([at('A', 0), hold({ id: 'g', symbol: 'GOLDBEES', assetType: 'gold_etf' })]);
    expect(s.nonEquitySleeves).toBe(1);
    expect(s.equityWeight).toBeLessThan(1);
  });
});

describe('scores are scores, not verdicts', () => {
  test('a single holding gets no diversification score at all', () => {
    // Not zero. One position is not "maximally undiversified" on a scale — it
    // is a book there is nothing to say about yet.
    expect(diversificationScore(1, 1, 1)).toBeNull();
    expect(diversificationScore(0, 0, null)).toBeNull();
  });

  test('a concentrated book scores below a spread one', () => {
    const concentrated = diversificationScore(10, 1, 1)!;
    const spread = diversificationScore(10, 5, 0.3)!;
    expect(concentrated).toBeLessThan(spread);
    expect(concentrated).toBeGreaterThanOrEqual(0);
    expect(spread).toBeLessThanOrEqual(100);
  });

  test('the band reads as a word a person would use', () => {
    expect(diversificationBand(54)).toBe('Concentrated');
    expect(diversificationBand(90)).toBe('Diversified');
    expect(diversificationBand(20)).toBe('Very concentrated');
  });

  test('return quality is null without a cost basis', () => {
    expect(returnQualityScore(D(0), 0)).toBeNull();
    expect(returnQualityScore(D(-1), 10)).toBeNull();
  });

  test('return quality stays inside 0–100 at the extremes', () => {
    expect(returnQualityScore(D(100), 900)).toBe(100);
    expect(returnQualityScore(D(100), -900)).toBe(0);
  });
});

describe('extremes', () => {
  test('picks the best and weakest by return, not by value', () => {
    const { best, weakest } = extremes(views([
      at('HUGE_FLAT', 0, 1000), at('TINY_WINNER', 80, 1), at('LOSER', -30, 50),
    ]));
    expect(best!.holding.symbol).toBe('TINY_WINNER');
    expect(weakest!.holding.symbol).toBe('LOSER');
  });

  test('an empty book has neither', () => {
    expect(extremes([])).toEqual({ best: null, weakest: null });
  });

  test('a single holding is both', () => {
    const { best, weakest } = extremes(views([at('ONLY', 5)]));
    expect(best!.holding.symbol).toBe('ONLY');
    expect(weakest!.holding.symbol).toBe('ONLY');
  });
});
