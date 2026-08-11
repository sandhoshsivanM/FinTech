/**
 * The intelligence layer (Hardening Plan §9).
 *
 * One rule governs everything here: facts → rules → insight. Every number is
 * derived from records already in the vault, and every output carries the
 * inputs it was derived from. Nothing predicts; things *project*, which is a
 * different claim — a projection says "if these assumptions hold", and the
 * assumptions are on the screen next to it.
 *
 * The Safe-to-Spend contract (§9) is the sharpest version of this: if an input
 * is missing the answer is "not enough data", never a fabricated figure. A
 * spending allowance invented from incomplete information is worse than no
 * allowance, because the user will spend against it.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Liability, RecurringRule, Txn } from '@/lib/types';
import { advance } from './recurrence';
import { emi, windowSummary } from './finance';
import {
  contains, currentMonth, daysIn, monthsIn, monthsBack, shiftMonths, startOfDay,
  type DateRange,
} from './period';

const DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Safe to spend                                                              */
/* -------------------------------------------------------------------------- */

/** Why an allowance could not be produced. Each maps to a concrete gap. */
export type SafeToSpendGap = 'no-income' | 'no-history';

export interface SafeToSpendInputs {
  /** Cash on hand across money accounts. */
  availableCash: Decimal;
  /** Budget allocation left for the period, or null when no budget is set. */
  budgetRemaining: Decimal | null;
  /** Recurring obligations still due before the period ends. */
  committed: Decimal;
  daysRemaining: number;
  period: DateRange;
}

export interface SafeToSpend {
  /** Null when the inputs cannot support an answer. */
  perDay: Decimal | null;
  total: Decimal | null;
  inputs: SafeToSpendInputs;
  /** Present exactly when `perDay` is null. */
  gap: SafeToSpendGap | null;
}

/**
 * What is genuinely spendable per remaining day.
 *
 * Deliberately the *minimum* of the two honest ceilings: what is left in the
 * budget, and what is left in the bank after committed obligations. A figure
 * that ignored either would tell someone to spend money that is already owed,
 * or money they do not have.
 */
export function safeToSpend(
  txns: Txn[],
  recurring: RecurringRule[],
  availableCash: Decimal,
  budgetRemaining: Decimal | null,
  now: number,
): SafeToSpend {
  const period = currentMonth(now);
  const committed = committedBefore(recurring, period.end, now);
  // Today counts: on the 31st there is still one day left to spend, and a
  // zero here would divide the allowance by nothing.
  const daysRemaining = Math.max(1, Math.ceil((period.end - now) / DAY));

  const inputs: SafeToSpendInputs = {
    availableCash, budgetRemaining, committed, daysRemaining, period,
  };

  // No recorded income at all means there is no basis for an allowance: the
  // cash on hand might be a float, a loan, or the last of someone's savings.
  const earned = windowSummary(txns, monthsBack(3, now)).income;
  if (earned.lte(0)) return { perDay: null, total: null, inputs, gap: 'no-income' };

  const afterCommitments = availableCash.minus(committed);
  const ceiling = budgetRemaining == null
    ? afterCommitments
    : Decimal.min(afterCommitments, budgetRemaining);
  const total = ceiling.gt(0) ? ceiling : ZERO;

  return { perDay: total.div(daysRemaining), total, inputs, gap: null };
}

/** Recurring outflows still due between `now` and `until`. */
export function committedBefore(rules: RecurringRule[], until: number, now: number): Decimal {
  let total = ZERO;
  for (const r of rules) {
    if (r.type === 'income') continue;
    let next = r.nextRun;
    // Bounded: a corrupt daily rule with a far-past nextRun would otherwise
    // walk forever.
    for (let i = 0; i < 400 && next <= until; i++) {
      if (next >= now) total = total.plus(D(r.amount));
      next = advance(next, r.frequency);
    }
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* Cash-flow forecast                                                         */
/* -------------------------------------------------------------------------- */

export interface ForecastMonth {
  range: DateRange;
  label: string;
  /** Recurring income scheduled to land. */
  scheduledIncome: Decimal;
  /** Recurring outgoings scheduled to leave. */
  scheduledExpense: Decimal;
  /** Typical non-recurring spending, from history. */
  typicalDiscretionary: Decimal;
  /** Projected closing cash position. */
  closingCash: Decimal;
  /** True when the month is projected to end below zero. */
  shortfall: boolean;
}

export interface CashFlowForecast {
  months: ForecastMonth[];
  /** Months of history the discretionary estimate is based on. */
  basedOnMonths: number;
  /** Null when there is too little history to say anything. */
  monthlyDiscretionary: Decimal | null;
  openingCash: Decimal;
}

/**
 * Where the cash position is heading, from recurring rules plus typical spend.
 *
 * The discretionary figure is a median of completed months, not a mean: one
 * holiday or one insurance premium drags a mean badly, and a forecast that
 * swings on a single month is not one anybody should plan against.
 *
 * Returns `monthlyDiscretionary: null` rather than guessing when there are
 * fewer than two completed months of history.
 */
export function cashFlowForecast(
  txns: Txn[],
  recurring: RecurringRule[],
  openingCash: Decimal,
  now: number,
  monthsAhead = 6,
): CashFlowForecast {
  // Completed months only. The current month is partial, and averaging it in
  // makes spending look lower every time you check early in a month.
  const history = monthsIn(monthsBack(4, now)).filter((m) => m.end < startOfDay(now));
  const recurringCategories = new Set(recurring.map((r) => r.categoryId).filter(Boolean));

  // Only months the user was actually recording in. A calendar month with no
  // transactions at all is absence of data, not evidence of zero spending —
  // counting it dragged the median to zero and presented that as a forecast.
  const perMonth = history
    .filter((m) => txns.some((t) => contains(m, t.date)))
    .map((m) => txns
      .filter((t) => t.type === 'expense' && contains(m, t.date) && !recurringCategories.has(t.categoryId))
      .reduce((s, t) => s.plus(D(t.amount)), ZERO));

  const monthlyDiscretionary = perMonth.length >= 2 ? median(perMonth) : null;

  const months: ForecastMonth[] = [];
  let cash = openingCash;
  for (let i = 1; i <= monthsAhead; i++) {
    const range = shiftMonths(now, i);
    const scheduledIncome = scheduledIn(recurring, range, 'income');
    const scheduledExpense = scheduledIn(recurring, range, 'expense');
    const typicalDiscretionary = monthlyDiscretionary ?? ZERO;
    cash = cash.plus(scheduledIncome).minus(scheduledExpense).minus(typicalDiscretionary);
    months.push({
      range,
      label: range.label.split(' · ')[0],
      scheduledIncome,
      scheduledExpense,
      typicalDiscretionary,
      closingCash: cash,
      shortfall: cash.lt(0),
    });
  }

  return { months, basedOnMonths: perMonth.length, monthlyDiscretionary, openingCash };
}

function scheduledIn(rules: RecurringRule[], range: DateRange, type: 'income' | 'expense'): Decimal {
  let total = ZERO;
  for (const r of rules) {
    if (r.type !== type) continue;
    let next = r.nextRun;
    for (let i = 0; i < 400 && next <= range.end; i++) {
      if (contains(range, next)) total = total.plus(D(r.amount));
      next = advance(next, r.frequency);
    }
  }
  return total;
}

function median(values: Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => a.cmp(b));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? sorted[mid - 1].plus(sorted[mid]).div(2) : sorted[mid];
}

/* -------------------------------------------------------------------------- */
/* Monthly review                                                             */
/* -------------------------------------------------------------------------- */

export interface MonthlyChange {
  key: string;
  label: string;
  current: Decimal;
  previous: Decimal;
  delta: Decimal;
  /** Null when the previous month was zero — a share of nothing is undefined. */
  changePct: number | null;
  /** Whether an increase is good. Income up is good; expense up is not. */
  higherIsBetter: boolean;
}

export interface MonthlyReview {
  month: DateRange;
  previous: DateRange;
  changes: MonthlyChange[];
  /** Categories whose spending moved most, largest absolute change first. */
  categoryMoves: { categoryId: string; current: Decimal; previous: Decimal; delta: Decimal }[];
}

/**
 * This month against last, and what actually moved.
 *
 * Comparisons are between the same *kind* of window — a full month against a
 * full month. Comparing a part-month against a complete one is how a review
 * ends up congratulating someone on the 3rd for spending 90% less.
 */
export function monthlyReview(txns: Txn[], now: number): MonthlyReview {
  const month = currentMonth(now);
  const previous = shiftMonths(now, -1);

  // Same slice of each month, so an in-progress month is compared like for like.
  const elapsed = Math.min(daysIn(month), Math.ceil((now - month.start) / DAY));
  const clipped: DateRange = {
    ...previous,
    end: Math.min(previous.end, previous.start + elapsed * DAY - 1),
  };

  const cur = windowSummary(txns, month);
  const prev = windowSummary(txns, clipped);

  const change = (
    key: string, label: string, a: Decimal, b: Decimal, higherIsBetter: boolean,
  ): MonthlyChange => ({
    key, label, current: a, previous: b, delta: a.minus(b),
    changePct: b.isZero() ? null : a.minus(b).div(b).times(100).toNumber(),
    higherIsBetter,
  });

  const changes = [
    change('income', 'Income', cur.income, prev.income, true),
    change('expense', 'Spending', cur.expense, prev.expense, false),
    change('net', 'Net', cur.net, prev.net, true),
    change('invested', 'Invested', cur.invested, prev.invested, true),
  ];

  const byCategory = new Map<string, { current: Decimal; previous: Decimal }>();
  const add = (id: string, key: 'current' | 'previous', amount: Decimal) => {
    const e = byCategory.get(id) ?? { current: ZERO, previous: ZERO };
    e[key] = e[key].plus(amount);
    byCategory.set(id, e);
  };
  for (const t of txns) {
    if (t.type !== 'expense') continue;
    if (contains(month, t.date)) add(t.categoryId, 'current', D(t.amount));
    else if (contains(clipped, t.date)) add(t.categoryId, 'previous', D(t.amount));
  }

  const categoryMoves = [...byCategory.entries()]
    .map(([categoryId, e]) => ({ categoryId, ...e, delta: e.current.minus(e.previous) }))
    .filter((m) => !m.delta.isZero())
    .sort((a, b) => b.delta.abs().cmp(a.delta.abs()));

  return { month, previous: clipped, changes, categoryMoves };
}

/* -------------------------------------------------------------------------- */
/* Net-worth projection                                                       */
/* -------------------------------------------------------------------------- */

export interface ProjectionPoint { date: number; value: Decimal }

export interface NetWorthProjection {
  points: ProjectionPoint[];
  /** The monthly surplus the projection assumes. */
  monthlySurplus: Decimal;
  /** The annual growth rate assumed on invested assets, as a percentage. */
  growthPct: number;
  /** Null when there is not enough history to assume a surplus. */
  basedOnMonths: number;
}

/**
 * Where net worth goes if the last few months repeat.
 *
 * A projection, never a prediction — the assumptions are returned alongside the
 * points precisely so the screen can state them. Growth is applied only to
 * invested assets, because cash does not compound.
 */
export function netWorthProjection(
  txns: Txn[],
  currentNetWorth: Decimal,
  investedValue: Decimal,
  now: number,
  monthsAhead = 60,
  growthPct = 8,
): NetWorthProjection {
  const history = monthsIn(monthsBack(4, now)).filter((m) => m.end < startOfDay(now));
  const surpluses = history.filter((m) => txns.some((t) => contains(m, t.date))).map((m) => {
    const s = windowSummary(txns, m);
    // Investing is not spending, so it stays inside net worth — the surplus is
    // what was not consumed, whether it sat in cash or bought a holding.
    return s.income.minus(s.expense);
  });
  const monthlySurplus = surpluses.length >= 2 ? median(surpluses) : ZERO;

  const monthlyGrowth = D(growthPct).div(1200);
  const points: ProjectionPoint[] = [];
  let value = currentNetWorth;
  let invested = investedValue;

  for (let i = 1; i <= monthsAhead; i++) {
    const growth = invested.times(monthlyGrowth);
    invested = invested.plus(growth);
    value = value.plus(monthlySurplus).plus(growth);
    points.push({ date: shiftMonths(now, i).start, value });
  }

  return { points, monthlySurplus, growthPct, basedOnMonths: surpluses.length };
}

/* -------------------------------------------------------------------------- */
/* What-if                                                                    */
/* -------------------------------------------------------------------------- */

export interface WhatIfResult {
  /** Months until every liability is cleared, or null when never. */
  debtFreeMonths: number | null;
  totalInterest: Decimal;
  /** Net worth at the horizon under this scenario. */
  netWorthAtHorizon: Decimal;
}

/**
 * One scenario, run against the same deterministic facts as everything else.
 *
 * @param extraMonthly additional money directed at debt each month.
 */
export function whatIf(
  liabilities: Liability[],
  txns: Txn[],
  currentNetWorth: Decimal,
  investedValue: Decimal,
  extraMonthly: Decimal,
  now: number,
  horizonMonths = 60,
): WhatIfResult {
  const balances = new Map(liabilities.map((l) => [l.id, D(l.principal)]));
  const rates = new Map(liabilities.map((l) => [l.id, D(l.aprPct).div(1200)]));
  // There is no stored EMI: it is derived from principal, rate and term by the
  // same `emi()` the Liabilities screen uses, so the scenario and the screen
  // cannot quote different minimum payments. A liability with no term has no
  // schedule, so 1% of the balance stands in — the usual credit-card minimum.
  const minimums = liabilities.reduce((s, l) => s.plus(
    l.termMonths && l.termMonths > 0
      ? emi(D(l.principal), D(l.aprPct), l.termMonths)
      : D(l.principal).times('0.01'),
  ), ZERO);

  let interest = ZERO;
  let debtFreeMonths: number | null = null;

  for (let m = 1; m <= horizonMonths; m++) {
    let pool = minimums.plus(extraMonthly);
    for (const [id, bal] of balances) {
      if (bal.lte(0)) continue;
      const charge = bal.times(rates.get(id) ?? ZERO);
      interest = interest.plus(charge);
      balances.set(id, bal.plus(charge));
    }
    // Avalanche: highest rate first, which minimises total interest.
    const order = [...balances.keys()]
      .filter((id) => balances.get(id)!.gt(0))
      .sort((a, b) => (rates.get(b) ?? ZERO).cmp(rates.get(a) ?? ZERO));
    for (const id of order) {
      if (pool.lte(0)) break;
      const bal = balances.get(id)!;
      const pay = Decimal.min(pool, bal);
      balances.set(id, bal.minus(pay));
      pool = pool.minus(pay);
    }
    if (debtFreeMonths == null && [...balances.values()].every((b) => b.lte(0))) {
      debtFreeMonths = m;
    }
  }

  const projection = netWorthProjection(txns, currentNetWorth, investedValue, now, horizonMonths);
  const netWorthAtHorizon = projection.points.length
    ? projection.points[projection.points.length - 1].value.minus(extraMonthly.times(horizonMonths))
    : currentNetWorth;

  return { debtFreeMonths, totalInterest: interest, netWorthAtHorizon };
}
