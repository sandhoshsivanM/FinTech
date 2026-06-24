// Pure financial logic ported from the Flutter app's domain/services.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Budget, Liability, Txn } from '@/lib/types';

export type TimeWindow = '7D' | '1M' | '3M';
export const WINDOW_DAYS: Record<TimeWindow, number> = { '7D': 7, '1M': 30, '3M': 90 };

export const signed = (t: Txn): Decimal =>
  t.type === 'income' ? D(t.amount) : D(t.amount).neg();

export const netWorthTotal = (txns: Txn[]): Decimal =>
  txns.reduce((s, t) => s.plus(signed(t)), ZERO);

export interface WindowSummary { income: Decimal; expense: Decimal; net: Decimal }

export function windowSummary(txns: Txn[], w: TimeWindow, now = Date.now()): WindowSummary {
  const start = now - WINDOW_DAYS[w] * 86400000;
  let income = ZERO;
  let expense = ZERO;
  for (const t of txns) {
    if (t.date < start || t.date > now) continue;
    if (t.type === 'income') income = income.plus(D(t.amount));
    else expense = expense.plus(D(t.amount));
  }
  return { income, expense, net: income.minus(expense) };
}

export interface NetWorthPoint { date: number; value: Decimal }

export function netWorthSeries(txns: Txn[], w: TimeWindow, now = Date.now()): NetWorthPoint[] {
  const dayMs = 86400000;
  const endDay = Math.floor(now / dayMs) * dayMs;
  const startDay = endDay - WINDOW_DAYS[w] * dayMs;
  let running = txns.filter((t) => t.date < startDay).reduce((s, t) => s.plus(signed(t)), ZERO);
  const deltas = new Map<number, Decimal>();
  for (const t of txns) {
    const day = Math.floor(t.date / dayMs) * dayMs;
    if (day < startDay || day > endDay) continue;
    deltas.set(day, (deltas.get(day) ?? ZERO).plus(signed(t)));
  }
  const points: NetWorthPoint[] = [];
  for (let day = startDay; day <= endDay; day += dayMs) {
    running = running.plus(deltas.get(day) ?? ZERO);
    points.push({ date: day, value: running });
  }
  return points;
}

// ---- Budget (PRD §7C) ----
export type BudgetStatus = 'ok' | 'warning' | 'over';
export interface BudgetProgress {
  budget: Budget; spent: Decimal; remaining: Decimal; fraction: number; status: BudgetStatus;
}

export function monthRange(d = new Date()): [number, number] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
  return [first, last];
}

export function spentForCategory(txns: Txn[], categoryId: string, first: number, last: number): Decimal {
  return txns
    .filter((t) => t.type === 'expense' && t.categoryId === categoryId && t.date >= first && t.date <= last)
    .reduce((s, t) => s.plus(D(t.amount)), ZERO);
}

export function evaluateBudget(budget: Budget, spent: Decimal): BudgetProgress {
  const limit = D(budget.amountLimit);
  const remaining = limit.minus(spent);
  const ratio = limit.isZero() ? 0 : spent.div(limit).toNumber();
  const pct = ratio * 100;
  const status: BudgetStatus = pct > 90 ? 'over' : pct >= 70 ? 'warning' : 'ok';
  return { budget, spent, remaining, fraction: Math.min(Math.max(ratio, 0), 1), status };
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
