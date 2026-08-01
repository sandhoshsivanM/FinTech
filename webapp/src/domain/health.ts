// The Financial Health Score — four categories, honest about what it cannot see.
//
// The twin of `lib/domain/services/financial_health.dart`. The two are pinned
// to the same numbers by `__fixtures__/health_cases.json`, which is a
// byte-identical copy of `test/fixtures/health_cases.json` on the Flutter side.
// That fixture exists because this file previously had no test at all while
// claiming parity with Dart, and the two portfolio models had already drifted
// under exactly that arrangement.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Budget, Goal, Insurance, Liability, NetWorthSnapshot, Txn } from '@/lib/types';
import { monthRange, netWorthTotal, spentForCategory, windowSummary } from './finance';
import {
  concentration,
  growthValue,
  isEmptyPortfolio,
  type InvestmentTotals,
} from './investmentTotals';
import { safetyNet } from './safetyNet';

export type HealthCategoryKey = 'wealth' | 'protection' | 'efficiency' | 'future';

/**
 * One measurable inside a category.
 *
 * `value` is null — never 0 — when there is no data to judge this on. That
 * distinction is the whole point: a user with no insurance and a user with
 * terrible insurance are not in the same position, and scoring both zero told
 * them they were.
 */
export interface HealthMetric {
  key: string;
  label: string;
  /** Relative weight inside its category. Only tracked metrics' weights count. */
  weight: number;
  /** Achievement 0..1, or null for "not tracked". */
  value: number | null;
  /** A sentence that reads correctly in both states. */
  detail: string;
  tracked: boolean;
}

export interface HealthCategory {
  key: HealthCategoryKey;
  label: string;
  /** This category's share of the full 100. */
  weight: number;
  metrics: HealthMetric[];
  detail: string;
  /** Achievement across tracked metrics, weights renormalised. Null if none. */
  fraction: number | null;
  /** Points out of `weight`. Null when untracked — not zero. */
  score: number | null;
  tracked: boolean;
}

export interface HealthScore {
  /** 0..100 over the tracked categories. Null when nothing is tracked. */
  score: number | null;
  /** Null below MIN_GRADABLE_WEIGHT — see the note on renormalisation. */
  grade: string | null;
  /** Sum of tracked category weights. Drives "based on 3 of 4 areas". */
  trackedWeight: number;
  /** Always four, always in this order. */
  categories: HealthCategory[];
  summary: string;
  partial: boolean;
  trackedCategoryCount: number;
}

export interface HealthInputs {
  txns: Txn[];
  investments: InvestmentTotals;
  liabilities: Liability[];
  goals?: Goal[];
  insurances?: Insurance[];
  budgets?: Budget[];
  snapshots?: NetWorthSnapshot[];
  now?: number;
}

/** Two categories out of four is the least that can support a one-word verdict. */
export const MIN_GRADABLE_WEIGHT = 50;

export const CATEGORY_WEIGHTS = {
  wealth: 30,
  protection: 25,
  efficiency: 25,
  future: 20,
} as const;

/** Unchanged from the previous score, so existing colour thresholds still hold. */
export function gradeOf(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Fair';
  if (score >= 40) return 'Needs work';
  return 'At risk';
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function metric(
  key: string,
  label: string,
  weight: number,
  value: number | null,
  detail: string,
): HealthMetric {
  // `tracked` is an eager field rather than a getter: getters do not survive
  // structural comparison or memo dependency arrays, and this object crosses
  // both. The Dart side uses a getter, which is why the parity fixture compares
  // numbers rather than shapes.
  return { key, label, weight, value, detail, tracked: value !== null };
}

function category(
  key: HealthCategoryKey,
  label: string,
  weight: number,
  detail: string,
  metrics: HealthMetric[],
): HealthCategory {
  const tracked = metrics.filter((m) => m.tracked);
  const w = tracked.reduce((s, m) => s + m.weight, 0);
  const fraction =
    tracked.length === 0 || w <= 0
      ? null
      : tracked.reduce((s, m) => s + (m.value as number) * m.weight, 0) / w;
  return {
    key,
    label,
    weight,
    metrics,
    detail,
    fraction,
    score: fraction === null ? null : fraction * weight,
    tracked: fraction !== null,
  };
}

/**
 * ## Why renormalise rather than cap
 *
 * A user with excellent cash flow and no insurance policies has no Protection
 * data. Scoring them 0 asserts they are unprotected when the app simply does not
 * know. Capping the total at 75 reads as "At risk" on a 0–100 gauge, punishing
 * them for a module they have not filled in. Renormalising over what is tracked,
 * and showing the denominator, is the only option that puts no number on screen
 * the data cannot support.
 */
export function healthScore(input: HealthInputs): HealthScore {
  const now = input.now ?? Date.now();
  const goals = input.goals ?? [];
  const insurances = input.insurances ?? [];
  const budgets = input.budgets ?? [];
  const snapshots = input.snapshots ?? [];

  const s90 = windowSummary(input.txns, '3M', now);
  const monthlyExpense = s90.expense.div(3);
  const cash = netWorthTotal(input.txns);
  const invested = input.investments.marketValue;
  const debt = input.liabilities.reduce((a, l) => a.plus(D(l.principal)), ZERO);
  const assets = cash.plus(invested);

  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const annualIncome = input.txns
    .filter((t) => t.type === 'income' && t.date >= now - YEAR_MS)
    .reduce((s, t) => s.plus(D(t.amount)), ZERO);

  const hasLedger = input.txns.length > 0;
  const hasPortfolio = !isEmptyPortfolio(input.investments);

  // Protection and the retirement metric come from the safety-net service
  // rather than being recomputed: one implementation of "how covered am I",
  // shared with the Safety Net page.
  const sn = safetyNet(input.txns, goals, insurances, input.investments, now);
  const component = (key: string): number | null => {
    const c = sn.components.find((x) => x.key === key);
    return c ? clamp01(c.coveredPct / 100) : null;
  };

  const hasInsurance = insurances.length > 0;
  // An emergency fund is only visible as an emergency-fund goal. Spending
  // history gives a target to measure against but no reading of what has
  // actually been set aside, and scoring that 0% would assert there is no
  // buffer when the truth is that the app has not been told about one.
  const hasEmergencyBasis = goals.some((g) => g.goalType === 'emergency_fund');

  // ---- Wealth ----
  const traj = trajectory(snapshots, annualIncome, assets);
  const investedShare = assets.lte(0)
    ? null
    : clamp01(invested.div(assets).toNumber() / 0.4);
  const conc = concentration(input.investments);
  const wealth = category(
    'wealth',
    'Wealth',
    CATEGORY_WEIGHTS.wealth,
    hasLedger || hasPortfolio
      ? 'What you own, and how concentrated it is.'
      : 'Add a transaction or a holding to start tracking this.',
    [
      metric('wealth.trajectory', 'Net-worth trajectory', 12, traj?.value ?? null,
        traj?.detail ?? 'Needs a few weeks of history.'),
      metric('wealth.invested_share', 'Invested share', 10, investedShare,
        investedShare === null
          ? 'No assets tracked yet.'
          : `${Math.round(invested.div(assets).toNumber() * 100)}% of assets invested (target 40%).`),
      metric('wealth.concentration', 'Diversification', 8,
        conc === null ? null : clamp01((1 - conc) / 0.4),
        conc === null
          ? 'No holdings tracked yet.'
          : `${Math.round(conc * 100)}% sits in your largest asset group.`),
    ],
  );

  // ---- Protection ----
  const protection = category(
    'protection',
    'Protection',
    CATEGORY_WEIGHTS.protection,
    hasInsurance || hasEmergencyBasis
      ? 'Your cover against the unexpected.'
      : 'Add a policy or an emergency-fund goal to track this.',
    [
      metric('protection.emergency', 'Emergency fund', 10,
        hasEmergencyBasis ? component('emergency') : null,
        hasEmergencyBasis
          ? `${sn.monthsCovered.toFixed(1)} months of expenses covered.`
          : 'No emergency-fund goal set yet.'),
      // Without a policy on file the app does not know the user is uninsured,
      // only that it has not been told.
      metric('protection.life', 'Life cover', 8,
        hasInsurance ? component('life') : null,
        hasInsurance ? 'Against the 10× annual-income guideline.' : 'No policies added yet.'),
      metric('protection.health', 'Health cover', 7,
        hasInsurance ? component('health') : null,
        hasInsurance ? 'Against the ₹5L / half-income guideline.' : 'No policies added yet.'),
    ],
  );

  // ---- Efficiency ----
  const savingsRate = s90.income.isZero() ? null : s90.net.div(s90.income).toNumber();
  const hasDebtBasis = input.liabilities.length > 0 || assets.gt(0);
  const dti = !hasDebtBasis
    ? null
    : assets.lte(0)
      ? (debt.gt(0) ? 1 : 0)
      : clamp01(debt.div(assets).toNumber());
  // A small balance at 42% compounds faster than a large one at 8%.
  const highApr = input.liabilities.some((l) => D(l.aprPct).gt(24));
  const debtScore = dti === null ? null : clamp01((1 - dti) * (highApr ? 0.85 : 1));
  const adherence = budgetAdherence(budgets, input.txns, now);
  const efficiency = category(
    'efficiency',
    'Efficiency',
    CATEGORY_WEIGHTS.efficiency,
    hasLedger ? 'How much of what comes in stays in.' : 'Add some transactions to track this.',
    [
      metric('efficiency.savings_rate', 'Savings rate', 10,
        savingsRate === null ? null : clamp01(savingsRate / 0.3),
        savingsRate === null
          ? 'No income recorded in the last 90 days.'
          : `${Math.round(savingsRate * 100)}% of income saved (90 days).`),
      metric('efficiency.debt_load', 'Debt load', 10, debtScore,
        dti === null
          ? 'No assets or liabilities tracked yet.'
          : `${Math.round(dti * 100)}% debt-to-asset ratio${highApr ? ', including high-interest debt.' : '.'}`),
      metric('efficiency.budget_adherence', 'Budget adherence', 5,
        adherence?.value ?? null, adherence?.detail ?? 'No budgets set yet.'),
    ],
  );

  // ---- Future ----
  const growth = growthValue(input.investments);
  const growthShare = invested.lte(0) ? null : clamp01(growth.div(invested).toNumber());
  const pace = goalPace(goals, now);
  const retirementTracked = hasPortfolio && annualIncome.gt(0);
  const future = category(
    'future',
    'Future',
    CATEGORY_WEIGHTS.future,
    hasPortfolio || goals.length > 0
      ? 'What you are building toward.'
      : 'Add a goal or a holding to track this.',
    [
      // Needs both sides of the ratio: a user who has recorded no holdings has
      // not told us they hold no FD or PPF.
      metric('future.retirement_assets', 'Retirement assets', 8,
        retirementTracked ? component('retirement') : null,
        retirementTracked
          ? 'FD / PPF·EPF / NPS against a year of income.'
          : 'Needs both a portfolio and recorded income.'),
      metric('future.goal_pace', 'Goal pace', 7, pace?.value ?? null,
        pace?.detail ?? 'No goals set yet.'),
      metric('future.growth_allocation', 'Growth allocation', 5, growthShare,
        growthShare === null
          ? 'No holdings tracked yet.'
          : `${Math.round(growthShare * 100)}% of your portfolio is in growth assets.`),
    ],
  );

  const categories = [wealth, protection, efficiency, future];
  const tracked = categories.filter((c) => c.tracked);
  const trackedWeight = tracked.reduce((s, c) => s + c.weight, 0);

  const score =
    trackedWeight > 0
      ? Math.round((tracked.reduce((s, c) => s + (c.score as number), 0) / trackedWeight) * 100)
      : null;
  const grade = score !== null && trackedWeight >= MIN_GRADABLE_WEIGHT ? gradeOf(score) : null;

  return {
    score,
    grade,
    trackedWeight,
    categories,
    summary: summarise(score, grade, categories),
    partial: trackedWeight < 100,
    trackedCategoryCount: tracked.length,
  };
}

function summarise(
  score: number | null,
  grade: string | null,
  categories: HealthCategory[],
): string {
  if (score === null) {
    return 'Add a transaction, a holding or a policy and your score will appear here.';
  }
  const untracked = categories.filter((c) => !c.tracked);
  const trackedCount = categories.length - untracked.length;
  if (grade === null) {
    return `Based on ${trackedCount} of ${categories.length} areas so far — add more and this gets sharper.`;
  }
  if (untracked.length > 0) {
    const names = untracked.map((c) => c.label.toLowerCase()).join(' and ');
    return `You're in ${grade.toLowerCase()} shape across ${trackedCount} of ${categories.length} areas. ${names} ${untracked.length === 1 ? 'is' : 'are'} not tracked yet.`;
  }
  const weakest = [...categories].sort((a, b) => (a.fraction ?? 0) - (b.fraction ?? 0))[0];
  return score >= 70
    ? `You're in ${grade.toLowerCase()} shape across all four areas.`
    : `Biggest opportunity: ${weakest.label.toLowerCase()}. Small improvements here lift your score fastest.`;
}

/**
 * Net-worth direction. Prefers real snapshots; with fewer than two it falls back
 * to net worth as a multiple of annual income, which measures something adjacent
 * rather than pretending to know a trend from one point.
 */
function trajectory(
  snapshots: NetWorthSnapshot[],
  annualIncome: Decimal,
  netWorth: Decimal,
): { value: number; detail: string } | null {
  if (snapshots.length >= 2) {
    const sorted = [...snapshots].sort((a, b) => a.date - b.date);
    const first = D(sorted[0].netWorth).toNumber();
    const last = D(sorted[sorted.length - 1].netWorth).toNumber();
    const delta = last - first;
    if (Math.abs(first) < 1e-9) {
      return {
        value: delta > 0 ? 1 : 0,
        detail: delta > 0 ? 'Net worth is growing.' : 'Net worth is flat.',
      };
    }
    const growth = delta / Math.abs(first);
    // Full marks at +10% over the tracked window; flat scores a third, because
    // holding steady is not failure.
    return {
      value: clamp01(0.33 + (growth / 0.1) * 0.67),
      detail:
        delta >= 0
          ? `Net worth is up ${Math.abs(growth * 100).toFixed(1)}% over your tracked history.`
          : `Net worth is down ${Math.abs(growth * 100).toFixed(1)}% over your tracked history.`,
    };
  }
  if (annualIncome.lte(0)) return null;
  const multiple = netWorth.div(annualIncome).toNumber();
  return {
    value: clamp01(multiple / 3),
    detail: `${multiple.toFixed(1)}× your annual income saved so far.`,
  };
}

/** Share of budgeted categories still inside their limit this month. */
function budgetAdherence(
  budgets: Budget[],
  txns: Txn[],
  now: number,
): { value: number; detail: string } | null {
  if (budgets.length === 0) return null;
  const [first, last] = monthRange(new Date(now));
  let within = 0;
  for (const b of budgets) {
    const spent = spentForCategory(txns, b.categoryId, first, last);
    // Compare raw amounts: BudgetProgress.fraction caps at 1 for the progress
    // bar, so comparing fractions makes every overspend read as exactly at limit.
    if (spent.lte(D(b.amountLimit))) within += 1;
  }
  return {
    value: within / budgets.length,
    detail: `${within} of ${budgets.length} budgets still within limit this month.`,
  };
}

/**
 * How well funded are the goals?
 *
 * Emergency-fund goals are excluded — they are Protection's business, and
 * counting them twice would let one goal move two categories.
 *
 * This measures funding, not pace against a schedule: Goal records a target date
 * but not a start date, so there is no baseline to straight-line from. The one
 * schedule fact available is whether the date has passed.
 */
function goalPace(goals: Goal[], now: number): { value: number; detail: string } | null {
  // A fully funded goal is done, not 'at 100% pace' — leaving it in would let
  // finished goals prop the category up forever. The Flutter Goal also carries
  // an explicit isAchieved flag; the web model has no such column, so both
  // sides use funded-out as the shared, expressible definition.
  const relevant = goals.filter(
    (g) => g.goalType !== 'emergency_fund' && D(g.currentAmount).lt(D(g.targetAmount)),
  );
  if (relevant.length === 0) return null;

  let scored = 0;
  let healthy = 0;
  let overdue = 0;
  for (const g of relevant) {
    const target = D(g.targetAmount).toNumber();
    const funded = target <= 0 ? 1 : clamp01(D(g.currentAmount).toNumber() / target);
    const isOverdue = g.targetDate != null && g.targetDate < now;
    // Past its date and still short: the shortfall is now certain rather than
    // merely possible, so it counts for half.
    const v = isOverdue ? funded * 0.5 : funded;
    scored += v;
    if (isOverdue) overdue += 1;
    if (v >= 0.75) healthy += 1;
  }
  return {
    value: scored / relevant.length,
    detail:
      overdue > 0
        ? `${healthy} of ${relevant.length} goals well funded, ${overdue} past its target date.`
        : `${healthy} of ${relevant.length} goals well funded.`,
  };
}
