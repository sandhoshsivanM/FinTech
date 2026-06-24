// Financial Health Score (0-100) — WealthCare signature feature.
// Four weighted pillars; each returns a 0..max sub-score with an explanation.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Holding, Liability, Txn } from '@/lib/types';
import { netWorthTotal, windowSummary } from './finance';

export interface Pillar { key: string; label: string; score: number; max: number; detail: string }
export interface HealthScore { score: number; grade: string; pillars: Pillar[]; summary: string }

function grade(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Needs work';
  return 'At risk';
}

export function healthScore(
  txns: Txn[], holdings: Holding[], liabilities: Liability[], now = Date.now(),
): HealthScore {
  const s90 = windowSummary(txns, '3M', now);
  const monthlyExpense = s90.expense.div(3);
  const netWorth = netWorthTotal(txns);
  const invested = holdings.reduce((a, h) => a.plus(D(h.quantity).times(D(h.lastPrice ?? h.avgCost))), ZERO);
  const debt = liabilities.reduce((a, l) => a.plus(D(l.principal)), ZERO);

  // 1. Savings rate (30) — net / income over 90d.
  const savingsRate = s90.income.isZero() ? 0 : s90.net.div(s90.income).toNumber();
  const p1 = Math.max(0, Math.min(1, savingsRate / 0.3)) * 30;

  // 2. Emergency buffer (25) — net worth vs 6× monthly expense.
  const months = monthlyExpense.lte(0) ? (netWorth.gt(0) ? 6 : 0) : netWorth.div(monthlyExpense).toNumber();
  const p2 = Math.max(0, Math.min(1, months / 6)) * 25;

  // 3. Debt load (25) — lower debt-to-asset is better.
  const assets = netWorth.plus(invested);
  const dti = assets.lte(0) ? (debt.gt(0) ? 1 : 0) : Math.min(1, debt.div(assets).toNumber());
  const p3 = (1 - dti) * 25;

  // 4. Investing (20) — invested vs net worth; rewards putting money to work.
  const investRatio = assets.lte(0) ? 0 : Math.min(1, invested.div(assets).toNumber() / 0.4);
  const p4 = investRatio * 20;

  const pillars: Pillar[] = [
    { key: 'savings', label: 'Savings rate', score: p1, max: 30, detail: `${(savingsRate * 100).toFixed(0)}% of income saved (90d)` },
    { key: 'buffer', label: 'Emergency buffer', score: p2, max: 25, detail: `${months.toFixed(1)} months of expenses covered` },
    { key: 'debt', label: 'Debt load', score: p3, max: 25, detail: `${(dti * 100).toFixed(0)}% debt-to-asset ratio` },
    { key: 'investing', label: 'Investing', score: p4, max: 20, detail: invested.gt(0) ? `${(invested.div(assets.lte(0) ? D(1) : assets).toNumber() * 100).toFixed(0)}% of assets invested` : 'No investments tracked yet' },
  ];
  const total = Math.round(pillars.reduce((a, p) => a + p.score, 0));
  const weakest = [...pillars].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  return {
    score: total,
    grade: grade(total),
    pillars,
    summary: total >= 70
      ? `You're in ${grade(total).toLowerCase()} shape. Keep it up — your strongest area is carrying you.`
      : `Biggest opportunity: ${weakest.label.toLowerCase()}. Small improvements here lift your score fastest.`,
  };
}
