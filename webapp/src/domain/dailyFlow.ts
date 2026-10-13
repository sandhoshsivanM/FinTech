/**
 * Money in and out per calendar day, for the home screen's "Last 7 days" chart.
 *
 * Income and spending only. An investment is money moving into holdings, not
 * money spent — counting it as "out" would make a SIP day look like a splurge
 * (the same rule `isSpending` enforces for budgets). Transfers are separate
 * records and never reach this function.
 *
 * Days are LOCAL calendar days, built by date arithmetic rather than by
 * subtracting 24h, so a DST change can never merge or skip a day.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import { isSpending, type Txn } from '@/lib/types';
import { startOfDay } from './period';

export interface DayFlow {
  /** Local midnight of the day. */
  day: number;
  income: Decimal;
  expense: Decimal;
}

/**
 * A change between two amounts, worded the way a person reads it: a percentage
 * up to double, a multiple beyond that ("52×" rather than "5145%").
 * Null when there is nothing to compare against.
 */
export function describeChange(now: Decimal, before: Decimal): { up: boolean; text: string } | null {
  if (before.isZero()) return null;
  const ratio = now.div(before).toNumber();
  const up = ratio > 1;
  if (ratio >= 2) return { up, text: `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}×` };
  return { up, text: `${Math.abs((ratio - 1) * 100).toFixed(0)}%` };
}

export function dailyFlow(txns: Txn[], now: number, days = 7): DayFlow[] {
  const today = new Date(startOfDay(now));
  const out: DayFlow[] = [];
  const index = new Map<number, DayFlow>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i).getTime();
    const row = { day, income: ZERO, expense: ZERO };
    out.push(row);
    index.set(day, row);
  }
  for (const t of txns) {
    const row = index.get(startOfDay(t.date));
    if (!row) continue;
    if (t.type === 'income') row.income = row.income.plus(D(t.amount));
    else if (isSpending(t.type)) row.expense = row.expense.plus(D(t.amount));
  }
  return out;
}
