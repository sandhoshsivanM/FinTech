import { describe, test, expect } from 'vitest';
import { coverageGaps, annualPremiumTotal } from './insurance';
import { D } from '@/lib/money';
import type { Insurance } from '@/lib/types';

const policy = (type: Insurance['type'], coverAmount: string, premium = '0'): Insurance => ({
  id: `i-${type}-${coverAmount}`, vaultId: 'v', name: type, type, coverAmount, premium,
});

describe('coverageGaps', () => {
  test('life recommended = 10× income; gap and coveredPct computed', () => {
    const [life] = coverageGaps([policy('life', '4000000')], D(1000000));
    expect(life.recommended.toString()).toBe('10000000');
    expect(life.gap.toString()).toBe('6000000');
    expect(life.coveredPct).toBe(40);
  });

  test('term policies count toward life cover', () => {
    const [life] = coverageGaps([policy('term', '10000000')], D(1000000));
    expect(life.coveredPct).toBe(100);
    expect(life.gap.toString()).toBe('0');
  });

  test('health uses the ₹5L floor when half-income is lower', () => {
    const gaps = coverageGaps([], D(200000)); // half-income = 100k < 500k floor
    const health = gaps.find((g) => g.kind === 'health')!;
    expect(health.recommended.toString()).toBe('500000');
    expect(health.coveredPct).toBe(0);
  });

  test('health uses half-income when it exceeds the floor', () => {
    const gaps = coverageGaps([], D(2000000)); // half-income = 1,000,000 > 500k
    const health = gaps.find((g) => g.kind === 'health')!;
    expect(health.recommended.toString()).toBe('1000000');
  });

  test('zero income → life recommended 0 → vacuously 100% covered', () => {
    const [life] = coverageGaps([], D(0));
    expect(life.recommended.toString()).toBe('0');
    expect(life.coveredPct).toBe(100);
  });
});

describe('annualPremiumTotal', () => {
  test('sums premiums across policies', () => {
    const total = annualPremiumTotal([
      policy('life', '5000000', '15000'),
      policy('health', '1000000', '22000'),
    ]);
    expect(total.toString()).toBe('37000');
  });

  test('empty list → 0', () => {
    expect(annualPremiumTotal([]).toString()).toBe('0');
  });
});
