/**
 * The numbers behind the dashboard's chart board.
 *
 * Pure functions over the vault, so every chart on the board is a view of a
 * figure that can be tested on its own. Money stays Decimal until the screen
 * converts it for display; each function takes resolved ranges (domain/period)
 * so a chart cannot draw one period and be captioned with another.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from './money';
import { isSpending, type Category, type Goal, type NetWorthSnapshot, type Txn } from './types';
import { contains, shiftMonths, startOfDay, type DateRange } from './period';
import type { BudgetProgress } from './finance';

/* -------------------------------------------------------------------------- */
/* Income by source                                                           */
/* -------------------------------------------------------------------------- */

export interface IncomeSource { categoryId: string; label: string; amount: Decimal }

/** Income in the range, one row per income category, largest first. */
export function incomeBySource(txns: Txn[], categories: Category[], range: DateRange): IncomeSource[] {
  const sums = new Map<string, Decimal>();
  for (const t of txns) {
    if (t.type !== 'income' || !contains(range, t.date)) continue;
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? ZERO).plus(D(t.amount)));
  }
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Other income';
  return [...sums]
    .map(([categoryId, amount]) => ({ categoryId, label: name(categoryId), amount }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

/* -------------------------------------------------------------------------- */
/* Month-by-month flow                                                        */
/* -------------------------------------------------------------------------- */

/** Fixed rather than `toLocaleString`, which gives "Sept" in en-IN and varies by device. */
export const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthFlow {
  range: DateRange;
  /** Short month name, e.g. "Oct". */
  label: string;
  income: Decimal;
  expense: Decimal;
  invested: Decimal;
}

/**
 * The last `n` calendar months ending with the month containing `anchor`,
 * oldest first. Investment is kept apart from expense for the same reason
 * `windowSummary` keeps it apart: it is money moved, not money spent.
 */
export function monthlyFlow(txns: Txn[], anchor: number, n: number): MonthFlow[] {
  const months = Array.from({ length: n }, (_, i) => shiftMonths(anchor, i - (n - 1)));
  const rows: MonthFlow[] = months.map((range) => ({
    range,
    label: SHORT_MONTHS[new Date(range.start).getMonth()],
    income: ZERO, expense: ZERO, invested: ZERO,
  }));
  const first = months[0].start, last = months[n - 1].end;
  for (const t of txns) {
    if (t.date < first || t.date > last) continue;
    const row = rows.find((r) => contains(r.range, t.date));
    if (!row) continue;
    const amt = D(t.amount);
    if (t.type === 'income') row.income = row.income.plus(amt);
    else if (t.type === 'investment') row.invested = row.invested.plus(amt);
    else row.expense = row.expense.plus(amt);
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Daily spending                                                             */
/* -------------------------------------------------------------------------- */

export interface DaySpend {
  /** Local midnight. */
  day: number;
  /** Day of the month, 1-based. */
  date: number;
  /** Null for a day that has not happened yet. */
  spent: Decimal | null;
}

/** Spending per day across a calendar month. Days after `now` are null. */
export function dailySpend(txns: Txn[], month: DateRange, now: number): DaySpend[] {
  const start = new Date(month.start);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const today = startOfDay(now);
  const out: DaySpend[] = Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), i + 1).getTime();
    return { day, date: i + 1, spent: day > today ? null : ZERO };
  });
  for (const t of txns) {
    if (!isSpending(t.type) || !contains(month, t.date)) continue;
    const row = out[new Date(t.date).getDate() - 1];
    if (row?.spent) row.spent = row.spent.plus(D(t.amount));
  }
  return out;
}

/**
 * How far through `month` we are on `now`, 0–1. A finished month is 1 and a
 * future one 0, so budgets in a past month are judged against the whole month.
 */
export function monthElapsed(month: DateRange, now: number): number {
  if (now >= month.end) return 1;
  if (now < month.start) return 0;
  const start = new Date(month.start);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return new Date(now).getDate() / days;
}

/* -------------------------------------------------------------------------- */
/* Budget pace                                                                */
/* -------------------------------------------------------------------------- */

export type PaceStatus = 'over' | 'ahead' | 'onTrack';

/** How far ahead of the month a budget may run before it is flagged. */
export const PACE_TOLERANCE = 0.1;

/**
 * Over the limit, spending faster than the month is passing, or on track.
 * "Ahead" compares the share of the budget used with the share of the month
 * gone: 80% used on the 10th is a problem, on the 28th it is not.
 */
export function paceStatus(p: Pick<BudgetProgress, 'ratio'>, elapsed: number): PaceStatus {
  if (p.ratio > 1) return 'over';
  if (p.ratio > elapsed + PACE_TOLERANCE) return 'ahead';
  return 'onTrack';
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

export interface GoalProgress {
  goal: Goal;
  saved: Decimal;
  target: Decimal;
  /** 0–1, clamped. */
  fraction: number;
  /** Whole months left until the target date; null without a date. */
  monthsLeft: number | null;
  /** What to set aside each month to finish on time; null when done or undated. */
  perMonth: Decimal | null;
}

export function goalProgress(goal: Goal, now: number): GoalProgress {
  const saved = D(goal.currentAmount);
  const target = D(goal.targetAmount);
  const fraction = target.isZero() ? 0 : Math.min(Math.max(saved.div(target).toNumber(), 0), 1);
  let monthsLeft: number | null = null;
  if (goal.targetDate != null) {
    const a = new Date(now), b = new Date(goal.targetDate);
    monthsLeft = Math.max((b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()), 0);
  }
  const left = target.minus(saved);
  const perMonth = monthsLeft == null || left.lte(0) ? null : left.div(Math.max(monthsLeft, 1));
  return { goal, saved, target, fraction, monthsLeft, perMonth };
}

/* -------------------------------------------------------------------------- */
/* Month-end trend from snapshots                                             */
/* -------------------------------------------------------------------------- */

export type SnapshotField = 'netWorth' | 'cash' | 'investments' | 'liabilities';

/**
 * The last recorded value in each of the last `n` months, oldest first, with
 * `current` standing in for the month containing `now` so the line ends on the
 * figure printed beside it. Months with no snapshot are skipped rather than
 * drawn as zero.
 */
export function monthEndSeries(
  snapshots: NetWorthSnapshot[], field: SnapshotField, now: number, n: number, current: Decimal,
): Decimal[] {
  const out: Decimal[] = [];
  for (let i = n - 1; i >= 1; i--) {
    const m = shiftMonths(now, -i);
    let best: NetWorthSnapshot | undefined;
    for (const s of snapshots) if (contains(m, s.date) && (!best || s.date > best.date)) best = s;
    if (best) out.push(D(best[field]));
  }
  out.push(current);
  return out;
}
