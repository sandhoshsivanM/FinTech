// Insurance coverage-gap analysis. Pure Decimal math; rules of thumb are
// configurable constants, not guesses presented as fact.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Insurance } from '@/lib/types';

export const LIFE_COVER_MULTIPLE = 10;   // recommended life cover ≈ 10× annual income
export const HEALTH_COVER_FLOOR = 500000; // minimum recommended health cover (₹5L)

export interface CoverageGap {
  kind: 'life' | 'health';
  label: string;
  current: Decimal;
  recommended: Decimal;
  gap: Decimal;        // recommended − current (0 if covered)
  coveredPct: number;  // 0..100+
}

export function annualPremiumTotal(policies: Insurance[]): Decimal {
  return policies.reduce((s, p) => s.plus(D(p.premium || '0')), ZERO);
}

export function coverageGaps(policies: Insurance[], annualIncome: Decimal): CoverageGap[] {
  const lifeCurrent = policies
    .filter((p) => p.type === 'life' || p.type === 'term')
    .reduce((s, p) => s.plus(D(p.coverAmount || '0')), ZERO);
  const healthCurrent = policies
    .filter((p) => p.type === 'health')
    .reduce((s, p) => s.plus(D(p.coverAmount || '0')), ZERO);

  const lifeRec = annualIncome.times(LIFE_COVER_MULTIPLE);
  const healthRec = Decimal.max(D(HEALTH_COVER_FLOOR), annualIncome.times(0.5));

  const mk = (kind: 'life' | 'health', label: string, current: Decimal, recommended: Decimal): CoverageGap => ({
    kind, label, current, recommended,
    gap: Decimal.max(ZERO, recommended.minus(current)),
    coveredPct: recommended.lte(0) ? 100 : Math.round(current.div(recommended).times(100).toNumber()),
  });

  return [
    mk('life', 'Life cover', lifeCurrent, lifeRec),
    mk('health', 'Health cover', healthCurrent, healthRec),
  ];
}
