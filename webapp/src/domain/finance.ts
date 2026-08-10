// Pure financial logic ported from the Flutter app's domain/services.
//
// Every period-bound function here takes a resolved `DateRange` (domain/period)
// rather than a window token or a pair of loose numbers, so a caller cannot
// query one span and caption the screen with another.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Budget, Liability, Txn } from '@/lib/types';
import { contains, shiftMonths, startOfDay, type DateRange } from './period';

export const signed = (t: Txn): Decimal =>
  t.type === 'income' ? D(t.amount) : D(t.amount).neg();

export const netWorthTotal = (txns: Txn[]): Decimal =>
  txns.reduce((s, t) => s.plus(signed(t)), ZERO);

export interface WindowSummary { income: Decimal; expense: Decimal; net: Decimal }

/**
 * Income, expense and net over a range.
 *
 * Takes a resolved `DateRange` rather than a window token, so the caller
 * cannot query one period and label the screen with another — which is exactly
 * what Reports and the Dashboard were both doing.
 */
export function windowSummary(txns: Txn[], range: DateRange): WindowSummary {
  let income = ZERO;
  let expense = ZERO;
  for (const t of txns) {
    if (!contains(range, t.date)) continue;
    if (t.type === 'income') income = income.plus(D(t.amount));
    else expense = expense.plus(D(t.amount));
  }
  return { income, expense, net: income.minus(expense) };
}

export interface NetWorthPoint { date: number; value: Decimal }

/**
 * A running net-worth line, one point per day in the range.
 *
 * Days are local calendar days via `startOfDay`, not `Math.floor(ms / 86400000)`
 * — that buckets by UTC day, so for anyone east of Greenwich an evening
 * transaction lands on the following day's point.
 */
export function netWorthSeries(txns: Txn[], range: DateRange): NetWorthPoint[] {
  const endDay = startOfDay(range.end);
  let running = txns.filter((t) => t.date < range.start).reduce((s, t) => s.plus(signed(t)), ZERO);
  const deltas = new Map<number, Decimal>();
  for (const t of txns) {
    if (!contains(range, t.date)) continue;
    const day = startOfDay(t.date);
    deltas.set(day, (deltas.get(day) ?? ZERO).plus(signed(t)));
  }
  const points: NetWorthPoint[] = [];
  // Stepped with setDate rather than by adding 86,400,000ms: across a
  // daylight-saving change a calendar day is 23 or 25 hours, and fixed-width
  // steps drift off midnight and start dropping or duplicating points.
  for (const d = new Date(startOfDay(range.start)); d.getTime() <= endDay; d.setDate(d.getDate() + 1)) {
    running = running.plus(deltas.get(d.getTime()) ?? ZERO);
    points.push({ date: d.getTime(), value: running });
  }
  return points;
}

// ---- Budget (PRD §7C) ----

/**
 * `warning` means the user's own alert threshold has been crossed; `over`
 * means the budget is actually exceeded.
 *
 * These used to be 70% and >90%, both hardcoded — so `over` was reported while
 * a tenth of the budget was still unspent, and the `alertThresholdPct` the user
 * had set was read by nothing.
 */
export type BudgetStatus = 'ok' | 'warning' | 'over';

/** Used when a budget carries no explicit threshold (§4.3). */
export const DEFAULT_ALERT_THRESHOLD_PCT = 90;

export interface BudgetProgress {
  budget: Budget;
  spent: Decimal;
  /** Carried in from the previous period; zero unless rollover is enabled. */
  rollover: Decimal;
  /** Allocation + rollover. What `remaining` is measured against. */
  limit: Decimal;
  remaining: Decimal;
  /** 0–1, clamped, for progress bars. `spent / limit` unclamped is `ratio`. */
  fraction: number;
  ratio: number;
  thresholdPct: number;
  status: BudgetStatus;
}

/**
 * What an unspent budget carries into the next period.
 *
 * Only the immediately preceding period, and never a deficit: overspending in
 * July should not silently shrink August's budget, and compounding the carry
 * across every month a budget has ever existed produces a number no user can
 * check against anything.
 */
export function budgetRollover(budget: Budget, txns: Txn[], range: DateRange): Decimal {
  if (!budget.rolloverEnabled) return ZERO;
  const prior = shiftMonths(range.start, -1);
  const spent = spentForCategory(txns, budget.categoryId, prior);
  const unspent = D(budget.amountLimit).minus(spent);
  return unspent.gt(0) ? unspent : ZERO;
}

export function evaluateBudget(budget: Budget, spent: Decimal, rollover: Decimal = ZERO): BudgetProgress {
  const limit = D(budget.amountLimit).plus(rollover);
  const remaining = limit.minus(spent);
  const ratio = limit.isZero() ? 0 : spent.div(limit).toNumber();
  const thresholdPct = budget.alertThresholdPct > 0
    ? budget.alertThresholdPct
    : DEFAULT_ALERT_THRESHOLD_PCT;
  const pct = ratio * 100;
  const status: BudgetStatus = pct > 100 ? 'over' : pct >= thresholdPct ? 'warning' : 'ok';
  return {
    budget, spent, rollover, limit, remaining,
    fraction: Math.min(Math.max(ratio, 0), 1),
    ratio, thresholdPct, status,
  };
}

/** What was spent in one category over a range. Always derived, never stored. */
export function spentForCategory(txns: Txn[], categoryId: string, range: DateRange): Decimal {
  return txns
    .filter((t) => t.type === 'expense' && t.categoryId === categoryId && contains(range, t.date))
    .reduce((s, t) => s.plus(D(t.amount)), ZERO);
}

// ---- Debt payoff (PRD §14) ----
export type PayoffStrategy = 'avalanche' | 'snowball';
export interface PayoffResult { months: number; totalInterest: Decimal; feasible: boolean }

export function emi(principal: Decimal, aprPct: Decimal, months: number): Decimal {
  if (months <= 0) return ZERO;
  const p = principal.toNumber();
  const r = aprPct.toNumber() / 1200;
  if (r === 0) return D((p / months).toFixed(2));
  const pw = Math.pow(1 + r, months);
  return D(((p * r * pw) / (pw - 1)).toFixed(2));
}

export function monthlyInterest(balance: Decimal, aprPct: Decimal): Decimal {
  return D(((balance.toNumber() * aprPct.toNumber()) / 1200).toFixed(2));
}

export function simulatePayoff(
  liabilities: Liability[], monthlyBudget: Decimal, strategy: PayoffStrategy, maxMonths = 1200,
): PayoffResult {
  const bal = new Map(liabilities.map((l) => [l.id, D(l.principal)]));
  const apr = new Map(liabilities.map((l) => [l.id, D(l.aprPct)]));
  let total = ZERO;
  let months = 0;
  while ([...bal.values()].some((b) => b.gt(0))) {
    if (months >= maxMonths) return { months, totalInterest: total, feasible: false };
    let interestThisMonth = ZERO;
    for (const id of bal.keys()) {
      if (bal.get(id)!.lte(0)) continue;
      const i = monthlyInterest(bal.get(id)!, apr.get(id)!);
      bal.set(id, bal.get(id)!.plus(i));
      interestThisMonth = interestThisMonth.plus(i);
    }
    total = total.plus(interestThisMonth);
    if (monthlyBudget.lte(interestThisMonth) && [...bal.values()].some((b) => b.gt(0))) {
      return { months, totalInterest: total, feasible: false };
    }
    const order = [...bal.keys()].filter((id) => bal.get(id)!.gt(0)).sort((a, b) =>
      strategy === 'avalanche' ? apr.get(b)!.cmp(apr.get(a)!) : bal.get(a)!.cmp(bal.get(b)!));
    let remaining = monthlyBudget;
    for (const id of order) {
      if (remaining.lte(0)) break;
      const pay = remaining.lt(bal.get(id)!) ? remaining : bal.get(id)!;
      bal.set(id, bal.get(id)!.minus(pay));
      remaining = remaining.minus(pay);
    }
    months++;
  }
  return { months, totalInterest: total, feasible: true };
}
