// The Financial Health Score, and its parity contract with Dart.
//
// This file did not exist before. `health.ts` claimed to mirror
// `lib/domain/services/financial_health.dart` and was checked by nobody — while
// the two portfolio models, under exactly that arrangement, had already drifted
// far enough to show different net worths on different screens.
//
// The `shared fixture` group below loads `__fixtures__/health_cases.json`, a
// byte-identical copy of `test/fixtures/health_cases.json`, which the Dart suite
// also loads and asserts against. Keeping the two implementations in step is now
// a build failure rather than a convention.
import { describe, test, expect } from 'vitest';
import {
  healthScore,
  gradeOf,
  MIN_GRADABLE_WEIGHT,
  type HealthCategory,
  type HealthInputs,
  type HealthScore,
} from './health';
import { EMPTY_INVESTMENTS, totalsOf } from './investmentTotals';
import type { AssetType, Budget, Goal, Insurance, Liability, NetWorthSnapshot, Txn } from '@/lib/types';
import fixture from './__fixtures__/health_cases.json';

const NOW = Date.parse('2026-06-15T00:00:00.000Z');
const DAY = 86_400_000;
let seq = 0;
const uid = () => `id${++seq}`;

const txn = (amount: number, type: 'income' | 'expense', daysAgo: number, categoryId = 'c'): Txn => ({
  id: uid(), vaultId: 'v', amount: String(amount), type, categoryId,
  date: NOW - daysAgo * DAY, createdAt: NOW,
});

const liab = (principal: number, apr: number): Liability => ({
  id: uid(), vaultId: 'v', name: 'L', kind: 'loan',
  principal: String(principal), aprPct: String(apr),
});

const ins = (type: Insurance['type'], cover: number): Insurance => ({
  id: uid(), vaultId: 'v', name: type, type,
  coverAmount: String(cover), premium: '10000',
});

const goal = (goalType: Goal['goalType'], target: number, current: number, targetDate?: number): Goal => ({
  id: uid(), vaultId: 'v', name: 'G', goalType,
  targetAmount: String(target), currentAmount: String(current), targetDate,
});

const budget = (categoryId: string, limit: number): Budget => ({
  id: uid(), vaultId: 'v', categoryId, amountLimit: String(limit),
  rolloverEnabled: false, alertThresholdPct: 90,
});

/** Investments are given as plain per-asset-type amounts; everything else as-is. */
type Over = Omit<Partial<HealthInputs>, 'investments'> & {
  investments?: Partial<Record<AssetType, number>>;
};

function score(over: Over = {}): HealthScore {
  return healthScore({
    txns: over.txns ?? [],
    investments: over.investments ? totalsOf(over.investments) : EMPTY_INVESTMENTS,
    liabilities: over.liabilities ?? [],
    goals: over.goals ?? [],
    insurances: over.insurances ?? [],
    budgets: over.budgets ?? [],
    snapshots: over.snapshots ?? [],
    now: NOW,
  });
}

const categoryOf = (s: HealthScore, key: string): HealthCategory =>
  s.categories.find((c) => c.key === key)!;
const metricOf = (s: HealthScore, cat: string, key: string) =>
  categoryOf(s, cat).metrics.find((m) => m.key === key)!.value;

describe('shape', () => {
  test('always returns the four categories in a fixed order', () => {
    expect(score().categories.map((c) => c.key)).toEqual([
      'wealth', 'protection', 'efficiency', 'future',
    ]);
  });

  test('category weights sum to 100', () => {
    expect(score().categories.reduce((a, c) => a + c.weight, 0)).toBe(100);
  });

  test('every metric carries a sentence in both states', () => {
    for (const s of [score(), score({ txns: [txn(100000, 'income', 30)] })]) {
      for (const c of s.categories) {
        expect(c.detail).not.toBe('');
        for (const m of c.metrics) expect(m.detail, m.key).not.toBe('');
      }
    }
  });
});

describe('not yet tracked', () => {
  test('an empty vault has no score, no grade, nothing tracked', () => {
    const s = score();
    expect(s.score, 'an empty vault must not score 0').toBeNull();
    expect(s.grade).toBeNull();
    expect(s.trackedWeight).toBe(0);
    expect(s.trackedCategoryCount).toBe(0);
    for (const c of s.categories) {
      expect(c.tracked, c.key).toBe(false);
      expect(c.score, c.key).toBeNull();
      expect(c.fraction, c.key).toBeNull();
    }
  });

  test('no insurance means Protection is untracked, NOT zero', () => {
    // A user with no policies on file is not a user with bad cover. The app has
    // simply not been told.
    const s = score({
      txns: [txn(300000, 'income', 45), txn(150000, 'expense', 40)],
      investments: { equity_etf: 500000 },
    });
    expect(metricOf(s, 'protection', 'protection.life')).toBeNull();
    expect(metricOf(s, 'protection', 'protection.health')).toBeNull();
  });

  test('an untracked category is excluded from the denominator', () => {
    const s = score({
      txns: [txn(300000, 'income', 45), txn(150000, 'expense', 40)],
      investments: { equity_etf: 500000, fd: 300000 },
      goals: [goal('vacation', 200000, 150000)],
    });
    expect(categoryOf(s, 'protection').tracked).toBe(false);
    expect(s.trackedWeight).toBe(75);
    expect(s.partial).toBe(true);
    expect(s.trackedCategoryCount).toBe(3);
  });

  test('the score is out of what is tracked, not out of 100', () => {
    const s = score({ txns: [txn(300000, 'income', 45), txn(150000, 'expense', 40)] });
    const tracked = s.categories.filter((c) => c.tracked);
    const earned = tracked.reduce((a, c) => a + (c.score as number), 0);
    expect(s.score).toBe(Math.round((earned / s.trackedWeight) * 100));
    expect(s.score!).toBeGreaterThanOrEqual(0);
    expect(s.score!).toBeLessThanOrEqual(100);
  });

  test('a category with one tracked metric renormalises within itself', () => {
    const s = score({
      txns: [txn(4000, 'expense', 2, 'food')],
      budgets: [budget('food', 8000)],
    });
    expect(metricOf(s, 'efficiency', 'efficiency.savings_rate')).toBeNull();
    const eff = categoryOf(s, 'efficiency');
    expect(eff.fraction).toBe(1);
    expect(eff.score).toBe(eff.weight);
  });
});

describe('grading', () => {
  test('grade bands are unchanged: 85 / 70 / 55 / 40', () => {
    expect(gradeOf(85)).toBe('Excellent');
    expect(gradeOf(84)).toBe('Strong');
    expect(gradeOf(70)).toBe('Strong');
    expect(gradeOf(69)).toBe('Fair');
    expect(gradeOf(55)).toBe('Fair');
    expect(gradeOf(54)).toBe('Needs work');
    expect(gradeOf(40)).toBe('Needs work');
    expect(gradeOf(39)).toBe('At risk');
  });

  test('too little tracked to grade still yields an honest number', () => {
    const s = score({ txns: [txn(300000, 'income', 45)] });
    if (s.trackedWeight < MIN_GRADABLE_WEIGHT) {
      expect(s.grade).toBeNull();
      expect(s.score).not.toBeNull();
    }
  });

  test('the summary names the untracked areas rather than hiding them', () => {
    const s = score({
      txns: [txn(300000, 'income', 45), txn(150000, 'expense', 40)],
      investments: { equity_etf: 500000 },
      goals: [goal('vacation', 200000, 150000)],
    });
    expect(s.summary.toLowerCase()).toContain('protection');
    expect(s.summary.toLowerCase()).toContain('not tracked');
  });
});

describe('metrics', () => {
  test('high-APR debt scores below the same balance at a low rate', () => {
    const t = () => [txn(300000, 'income', 45), txn(150000, 'expense', 40)];
    const inv = { equity_etf: 500000 };
    const cheap = score({ txns: t(), investments: inv, liabilities: [liab(100000, 9)] });
    const dear = score({ txns: t(), investments: inv, liabilities: [liab(100000, 42)] });
    expect(metricOf(dear, 'efficiency', 'efficiency.debt_load')!)
      .toBeLessThan(metricOf(cheap, 'efficiency', 'efficiency.debt_load')!);
  });

  test('one asset group scores worse than a spread', () => {
    const diversification = (inv: Partial<Record<AssetType, number>>) =>
      metricOf(score({ txns: [txn(300000, 'income', 45)], investments: inv }),
        'wealth', 'wealth.concentration')!;
    expect(diversification({ equity_etf: 400000, gold_etf: 300000, fd: 300000 }))
      .toBeGreaterThan(diversification({ equity_etf: 1000000 }));
  });

  test('budget adherence counts budgets still inside their limit', () => {
    const s = score({
      txns: [txn(300000, 'income', 45), txn(9000, 'expense', 2, 'food')],
      budgets: [budget('food', 8000), budget('transport', 3000)],
    });
    expect(metricOf(s, 'efficiency', 'efficiency.budget_adherence')).toBe(0.5);
  });

  test('an overspent budget is not rounded back to "at limit"', () => {
    const s = score({
      txns: [txn(80000, 'expense', 2, 'food')],
      budgets: [budget('food', 8000)],
    });
    expect(metricOf(s, 'efficiency', 'efficiency.budget_adherence')).toBe(0);
  });

  test('overdue unfunded goals score below the same goals with time left', () => {
    const pace = (due: number) =>
      metricOf(score({ goals: [goal('vacation', 200000, 50000, due)] }),
        'future', 'future.goal_pace')!;
    expect(pace(NOW - 30 * DAY)).toBeLessThan(pace(NOW + 200 * DAY));
  });

  test('emergency-fund goals do not also count toward Future', () => {
    const s = score({
      goals: [goal('emergency_fund', 300000, 300000)],
      txns: [txn(300000, 'income', 45)],
    });
    expect(metricOf(s, 'future', 'future.goal_pace')).toBeNull();
  });

  test('net-worth trajectory prefers real snapshots over the income proxy', () => {
    const snap = (daysAgo: number, netWorth: number): NetWorthSnapshot => ({
      id: `snap-${daysAgo}`, vaultId: 'v', date: NOW - daysAgo * DAY,
      netWorth: String(netWorth), cash: String(netWorth), investments: '0', liabilities: '0',
    });
    const traj = (snapshots: NetWorthSnapshot[]) =>
      metricOf(score({ txns: [txn(300000, 'income', 45)], snapshots }),
        'wealth', 'wealth.trajectory')!;
    expect(traj([snap(60, 1000000), snap(1, 1200000)]))
      .toBeGreaterThan(traj([snap(60, 1200000), snap(1, 1000000)]));
  });

  test('trajectory is untracked with one snapshot and no income', () => {
    expect(metricOf(score({ investments: { equity_etf: 100000 } }), 'wealth', 'wealth.trajectory'))
      .toBeNull();
  });
});

describe('shared fixture (parity with lib/domain/services/financial_health.dart)', () => {
  test('the fixture pins the same "now" both suites use', () => {
    expect(Date.parse(fixture.now)).toBe(NOW);
  });

  const fromFixture = (input: Record<string, unknown>): HealthScore =>
    healthScore({
      txns: ((input.txns as { amount: number; type: 'income' | 'expense'; daysAgo: number }[]) ?? [])
        .map((t) => txn(t.amount, t.type, t.daysAgo)),
      investments: input.investments
        ? totalsOf(input.investments as Partial<Record<AssetType, number>>)
        : EMPTY_INVESTMENTS,
      liabilities: ((input.liabilities as { principal: number; apr: number }[]) ?? [])
        .map((l) => liab(l.principal, l.apr)),
      insurances: ((input.insurances as { type: Insurance['type']; cover: number }[]) ?? [])
        .map((i) => ins(i.type, i.cover)),
      goals: ((input.goals as { type: Goal['goalType']; target: number; current: number }[]) ?? [])
        .map((g) => goal(g.type, g.target, g.current)),
      now: NOW,
    });

  interface FixtureCase {
    name: string;
    input: Record<string, unknown>;
    expect?: Record<string, unknown>;
    comparison?: { against: Record<string, unknown>; expect: string };
  }

  test('every fixture case matches its expectations', () => {
    for (const c of fixture.cases as unknown as FixtureCase[]) {
      const { name } = c;
      const s = fromFixture(c.input);
      const expected = c.expect;

      if (expected) {
        if ('score' in expected) expect(s.score, name).toBe(expected.score);
        if ('grade' in expected) expect(s.grade, name).toBe(expected.grade);
        if ('trackedWeight' in expected) expect(s.trackedWeight, name).toBe(expected.trackedWeight);
        if ('trackedCategoryCount' in expected) {
          expect(s.trackedCategoryCount, name).toBe(expected.trackedCategoryCount);
        }
        if ('untracked' in expected) {
          expect(s.categories.filter((x) => !x.tracked).map((x) => x.key).sort(), name)
            .toEqual([...(expected.untracked as string[])].sort());
        }
        if ('categories' in expected) {
          for (const [key, want] of Object.entries(expected.categories as Record<string, number | null>)) {
            expect(categoryOf(s, key).score, `${name} / ${key}`).toBe(want);
          }
        }
      }

      const { comparison } = c;
      if (comparison) {
        const other = fromFixture(comparison.against);
        if (comparison.expect === 'lower') {
          expect(s.score!, name).toBeLessThan(other.score!);
        } else {
          expect(s.score!, name).toBeGreaterThan(other.score!);
        }
      }
    }
  });
});
