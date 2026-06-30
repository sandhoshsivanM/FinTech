// "Safety Net" readiness — aggregates emergency fund (Goals), insurance cover
// (Insurance), and safe/retirement assets (Investments) into one score.
// Pure Decimal math; reuses the existing coverage-gap engine.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Goal, Holding, Insurance, Txn } from '@/lib/types';
import { windowSummary } from './finance';
import { coverageGaps, annualPremiumTotal } from './insurance';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RETIREMENT_ASSETS = new Set(['fd', 'ppf_epf', 'nps']);
const EMERGENCY_MONTHS_TARGET = 6;

export interface SafetyComponent {
  key: 'emergency' | 'life' | 'health' | 'retirement';
  label: string;
  current: Decimal;
  recommended: Decimal;
  gap: Decimal; // max(0, recommended − current)
  coveredPct: number; // 0..100 (capped at 100 for scoring)
  detail: string;
}

export interface SafetyNet {
  score: number; // 0..100
  grade: string;
  summary: string;
  components: SafetyComponent[];
  premium: Decimal; // total annual insurance premium
  monthsCovered: number; // emergency fund ÷ monthly expense
  annualIncome: Decimal;
}

// Weights sum to 100.
const WEIGHTS = { emergency: 35, life: 25, health: 25, retirement: 15 } as const;

function grade(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Needs work';
  return 'At risk';
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function safetyNet(
  txns: Txn[],
  goals: Goal[],
  insurances: Insurance[],
  holdings: Holding[],
  now = Date.now(),
): SafetyNet {
  // Bases shared with the Insurance page / health score.
  const monthlyExpense = windowSummary(txns, '3M', now).expense.div(3);
  const annualIncome = txns
    .filter((t) => t.type === 'income' && t.date >= now - YEAR_MS)
    .reduce((s, t) => s.plus(D(t.amount)), ZERO);

  // ---- Emergency fund ----
  const efGoals = goals.filter((g) => g.goalType === 'emergency_fund');
  const efFund = efGoals.reduce((s, g) => s.plus(D(g.currentAmount)), ZERO);
  const efGoalTarget = efGoals.reduce((s, g) => s.plus(D(g.targetAmount)), ZERO);
  // Target: explicit goal target, else 6× monthly expense.
  const efTarget = efGoalTarget.gt(0)
    ? efGoalTarget
    : monthlyExpense.times(EMERGENCY_MONTHS_TARGET);
  const monthsCovered = monthlyExpense.gt(0)
    ? efFund.div(monthlyExpense).toNumber()
    : (efFund.gt(0) ? EMERGENCY_MONTHS_TARGET : 0);
  const efPct = efTarget.gt(0) ? efFund.div(efTarget).times(100).toNumber() : (efFund.gt(0) ? 100 : 0);
  const emergency: SafetyComponent = {
    key: 'emergency', label: 'Emergency fund',
    current: efFund, recommended: efTarget, gap: Decimal.max(ZERO, efTarget.minus(efFund)),
    coveredPct: efPct,
    detail: efGoals.length === 0
      ? 'No emergency-fund goal yet — aim for ~6 months of expenses.'
      : `${monthsCovered.toFixed(1)} of ${EMERGENCY_MONTHS_TARGET} months of expenses covered.`,
  };

  // ---- Insurance cover (reuse the gap engine) ----
  const gaps = coverageGaps(insurances, annualIncome);
  const lifeGap = gaps.find((g) => g.kind === 'life')!;
  const healthGap = gaps.find((g) => g.kind === 'health')!;
  const life: SafetyComponent = {
    key: 'life', label: 'Life cover',
    current: lifeGap.current, recommended: lifeGap.recommended, gap: lifeGap.gap,
    coveredPct: lifeGap.coveredPct,
    detail: lifeGap.gap.gt(0) ? 'Below the 10× annual-income guideline.' : 'Meets the guideline.',
  };
  const health: SafetyComponent = {
    key: 'health', label: 'Health cover',
    current: healthGap.current, recommended: healthGap.recommended, gap: healthGap.gap,
    coveredPct: healthGap.coveredPct,
    detail: healthGap.gap.gt(0) ? 'Below the ₹5L / half-income guideline.' : 'Meets the guideline.',
  };

  // ---- Safe / retirement assets (FD, PPF·EPF, NPS) ----
  const retireValue = holdings
    .filter((h) => RETIREMENT_ASSETS.has(h.assetType))
    .reduce((s, h) => s.plus(D(h.quantity).times(D(h.lastPrice ?? h.avgCost))), ZERO);
  // Heuristic: ~1 year of income parked safely = fully covered.
  const retirePct = annualIncome.gt(0)
    ? clamp01(retireValue.div(annualIncome).toNumber()) * 100
    : (retireValue.gt(0) ? 100 : 0);
  const retirement: SafetyComponent = {
    key: 'retirement', label: 'Safe & retirement assets',
    current: retireValue, recommended: annualIncome,
    gap: Decimal.max(ZERO, annualIncome.minus(retireValue)),
    coveredPct: retirePct,
    detail: retireValue.gt(0) ? 'FD / PPF·EPF / NPS tracked.' : 'No FD / PPF / NPS tracked yet.',
  };

  const components = [emergency, life, health, retirement];

  const score = Math.round(
    clamp01(emergency.coveredPct / 100) * WEIGHTS.emergency +
    clamp01(life.coveredPct / 100) * WEIGHTS.life +
    clamp01(health.coveredPct / 100) * WEIGHTS.health +
    clamp01(retirement.coveredPct / 100) * WEIGHTS.retirement,
  );

  const weakest = [...components].sort((a, b) => a.coveredPct - b.coveredPct)[0];
  const summary = score >= 70
    ? `Your safety net is ${grade(score).toLowerCase()} — well protected against surprises.`
    : `Biggest gap: ${weakest.label.toLowerCase()}. Closing it strengthens your safety net the most.`;

  return {
    score,
    grade: grade(score),
    summary,
    components,
    premium: annualPremiumTotal(insurances),
    monthsCovered,
    annualIncome,
  };
}
