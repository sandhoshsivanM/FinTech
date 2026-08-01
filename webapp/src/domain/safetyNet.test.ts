import { describe, test, expect } from 'vitest';
import { safetyNet } from './safetyNet';
import { EMPTY_INVESTMENTS, totalsOf } from './investmentTotals';
import type { Txn, Goal, Holding, Insurance } from '@/lib/types';

// Fixed clock so all date windows are deterministic.
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

let _id = 0;
const uid = () => `id${++_id}`;

const txn = (amount: string, type: 'income' | 'expense', daysAgo: number): Txn => ({
  id: uid(), vaultId: 'v', amount, type, categoryId: 'c',
  date: NOW - daysAgo * DAY, createdAt: NOW,
});
const goal = (currentAmount: string, targetAmount: string, t: Goal['goalType'] = 'emergency_fund'): Goal => ({
  id: uid(), vaultId: 'v', name: 'EF', goalType: t, targetAmount, currentAmount,
});
const holding = (
  assetType: Holding['assetType'], quantity: string, price: string, lastPrice?: string,
): Holding => ({
  id: uid(), vaultId: 'v', symbol: assetType.toUpperCase(), exchange: 'NSE',
  quantity, avgCost: price, lastPrice: lastPrice ?? null, assetType,
});
const ins = (type: Insurance['type'], coverAmount: string, premium = '1000'): Insurance => ({
  id: uid(), vaultId: 'v', name: type, type, coverAmount, premium,
});

describe('safetyNet', () => {
  test('all four pillars covered → score 100, Excellent, positive summary', () => {
    const income = txn('1000000', 'income', 30); // ₹10L within the last year
    const sn = safetyNet(
      [income],
      [goal('600000', '600000')], // EF fully funded
      [ins('life', '10000000'), ins('health', '500000')], // 10× income + ₹5L floor
      totalsOf({ fd: 1000000 }), // ≥ 1× income parked safely
      NOW,
    );
    expect(sn.score).toBe(100);
    expect(sn.grade).toBe('Excellent');
    expect(sn.summary).toMatch(/well protected/i);
    expect(sn.components).toHaveLength(4);
  });

  test('empty inputs → low score; zero income means life cover is vacuously 100%', () => {
    const sn = safetyNet([], [], [], EMPTY_INVESTMENTS, NOW);
    // life recommended = 10×0 = 0 ⇒ coverageGaps treats it as 100% covered (nothing to cover).
    // Only that pillar's 25 weight lands; everything else is 0 ⇒ score 25.
    expect(sn.score).toBe(25);
    expect(sn.grade).toBe('At risk');
    expect(sn.components.find((c) => c.key === 'emergency')!.detail).toMatch(/No emergency-fund goal/i);
    expect(sn.summary).toMatch(/biggest gap/i);
  });

  test('emergency target falls back to 6× monthly expense when no goal target', () => {
    // 90-day expense of ₹30k ⇒ monthlyExpense ₹10k ⇒ target ₹60k.
    const sn = safetyNet(
      [txn('30000', 'expense', 10)],
      [goal('30000', '0')], // currentAmount 30k, no explicit target
      [], EMPTY_INVESTMENTS, NOW,
    );
    const ef = sn.components.find((c) => c.key === 'emergency')!;
    expect(ef.recommended.toString()).toBe('60000');
    expect(ef.current.toString()).toBe('30000');
    expect(Math.round(ef.coveredPct)).toBe(50);
    expect(sn.monthsCovered).toBeCloseTo(3, 5);
    expect(ef.detail).toMatch(/3\.0 of 6 months/);
  });

  test('explicit goal target overrides the 6× fallback', () => {
    const sn = safetyNet(
      [txn('30000', 'expense', 10)], // would imply ₹60k fallback
      [goal('50000', '200000')], // explicit ₹2L target
      [], EMPTY_INVESTMENTS, NOW,
    );
    const ef = sn.components.find((c) => c.key === 'emergency')!;
    expect(ef.recommended.toString()).toBe('200000');
    expect(Math.round(ef.coveredPct)).toBe(25);
  });

  test('retirement counts only the retirement asset group', () => {
    const income = txn('1000000', 'income', 30);
    const sn = safetyNet(
      [income], [],
      [],
      // Equity is in the portfolio but not in the retirement group, so it must
      // not count toward safe assets. That grouping is InvestmentTotals' job
      // now rather than a filter repeated inside this service.
      totalsOf({ fd: 300000, ppf_epf: 200000, equity_etf: 10000000 }),
      NOW,
    );
    const r = sn.components.find((c) => c.key === 'retirement')!;
    expect(r.current.toString()).toBe('500000'); // 300000 + 200000, equity excluded
    // 500k of 1,000k income ⇒ 50% covered.
    expect(Math.round(r.coveredPct)).toBe(50);
  });

  test('weights: emergency 35 + retirement 15 land independently of insurance', () => {
    const income = txn('1000000', 'income', 30);
    const sn = safetyNet(
      [income],
      [goal('100000', '100000')],       // emergency 100%
      [],                                // no insurance ⇒ health 0% (life vacuous at income>0 ⇒ 0%)
      totalsOf({ fd: 1000000 }),         // retirement 100%
      NOW,
    );
    // 35 (emergency) + 0 (life: 10×income recommended, 0 current) + 0 (health) + 15 (retire) = 50.
    expect(sn.score).toBe(50);
    expect(sn.grade).toBe('Needs work');
  });

  test('weights: life 25 + health 25 land independently of savings', () => {
    const income = txn('1000000', 'income', 30);
    const sn = safetyNet(
      [income], [],
      [ins('life', '10000000'), ins('health', '500000')], // both fully covered
      EMPTY_INVESTMENTS, NOW,
    );
    // 0 (emergency) + 25 (life) + 25 (health) + 0 (retire) = 50.
    expect(sn.score).toBe(50);
  });

  test('grade bands map score → label', () => {
    // Drive scores by toggling how many of the four equal-ish pillars are covered.
    const income = txn('1000000', 'income', 30);
    const strong = safetyNet(
      [income],
      [goal('600000', '600000')],
      [ins('life', '10000000'), ins('health', '500000')],
      EMPTY_INVESTMENTS, // retirement 0 ⇒ 85, Excellent boundary
      NOW,
    );
    expect(strong.score).toBe(85);
    expect(strong.grade).toBe('Excellent');
  });
});
