// Smarter local insights (no network, no LLM). Pure functions over the ledger.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Goal, RecurringRule, Txn } from '@/lib/types';
import { advance } from './recurrence';

function monthBounds(offsetMonths: number, now: number): [number, number] {
  const d = new Date(now);
  const first = new Date(d.getFullYear(), d.getMonth() - offsetMonths, 1).getTime();
  const last = new Date(d.getFullYear(), d.getMonth() - offsetMonths + 1, 1).getTime() - 1;
  return [first, last];
}

// ---- Spending anomalies: this month vs trailing 3-month average, per category ----
export interface Anomaly { categoryId: string; current: Decimal; avg: Decimal; ratio: number }

export function spendingAnomalies(txns: Txn[], now = Date.now()): Anomaly[] {
  const [cf, cl] = monthBounds(0, now);
  const curByCat = new Map<string, Decimal>();
  for (const t of txns) {
    if (t.type !== 'expense' || t.date < cf || t.date > cl) continue;
    curByCat.set(t.categoryId, (curByCat.get(t.categoryId) ?? ZERO).plus(D(t.amount)));
  }
  // trailing 3 months average per category
  const histByCat = new Map<string, Decimal>();
  for (let m = 1; m <= 3; m++) {
    const [f, l] = monthBounds(m, now);
    for (const t of txns) {
      if (t.type !== 'expense' || t.date < f || t.date > l) continue;
      histByCat.set(t.categoryId, (histByCat.get(t.categoryId) ?? ZERO).plus(D(t.amount)));
    }
  }
  const out: Anomaly[] = [];
  for (const [cat, current] of curByCat) {
    const avg = (histByCat.get(cat) ?? ZERO).div(3);
    if (avg.lte(0)) continue;
    const ratio = current.div(avg).toNumber();
    if (ratio >= 1.5 && current.minus(avg).gt(500)) out.push({ categoryId: cat, current, avg, ratio });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

// ---- Safe-to-spend: discretionary cash left this month / days remaining ----
export interface SafeToSpend { remaining: Decimal; perDay: Decimal; daysLeft: number }

export function safeToSpend(txns: Txn[], recurring: RecurringRule[], now = Date.now()): SafeToSpend {
  const [cf, cl] = monthBounds(0, now);
  let income = ZERO, expense = ZERO;
  for (const t of txns) {
    if (t.date < cf || t.date > cl) continue;
    if (t.type === 'income') income = income.plus(D(t.amount));
    else expense = expense.plus(D(t.amount));
  }
  // recurring expenses still due before month end
  let upcoming = ZERO;
  for (const r of recurring) {
    if (r.type !== 'expense') continue;
    let next = r.nextRun;
    let guard = 0;
    while (next <= cl && guard < 60) {
      if (next >= now) upcoming = upcoming.plus(D(r.amount));
      next = advance(next, r.frequency);
      guard++;
    }
  }
  const remaining = Decimal.max(ZERO, income.minus(expense).minus(upcoming));
  const daysLeft = Math.max(1, Math.ceil((cl - now) / 86400000));
  return { remaining, perDay: remaining.div(daysLeft), daysLeft };
}

// ---- Goal SIP: required monthly contribution to hit target by date ----
export function requiredMonthlySip(goal: Goal, now = Date.now()): Decimal | null {
  if (!goal.targetDate) return null;
  const remaining = D(goal.targetAmount).minus(D(goal.currentAmount));
  if (remaining.lte(0)) return ZERO;
  const months = Math.max(1, Math.round((goal.targetDate - now) / (30.44 * 86400000)));
  return remaining.div(months);
}
