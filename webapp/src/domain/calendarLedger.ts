// Per-day calendar aggregation — mirrors
// lib/domain/services/calendar_aggregator.dart. Money stays Decimal so totals
// never drift by a rounding cent. Date-key convention: the transaction's local
// calendar day, formatted 'YYYY-MM-DD'.
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Txn } from '@/lib/types';

export interface DayLedger {
  date: string; // 'YYYY-MM-DD'
  income: Decimal;
  expense: Decimal;
  net: Decimal;
  txnIds: string[];
  hasAttachment: boolean; // any txn that day carries a receipt attachment
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function aggregateByDay(txns: Txn[]): Map<string, DayLedger> {
  const income = new Map<string, Decimal>();
  const expense = new Map<string, Decimal>();
  const ids = new Map<string, string[]>();
  const attach = new Map<string, boolean>();
  const keys = new Set<string>();

  for (const t of txns) {
    const k = dayKey(t.date);
    keys.add(k);
    (ids.get(k) ?? ids.set(k, []).get(k)!).push(t.id);
    if (t.type === 'income') income.set(k, (income.get(k) ?? ZERO).plus(D(t.amount)));
    else expense.set(k, (expense.get(k) ?? ZERO).plus(D(t.amount)));
    if (t.attachmentRef != null) attach.set(k, true);
  }

  const out = new Map<string, DayLedger>();
  for (const k of [...keys].sort()) {
    const inc = income.get(k) ?? ZERO;
    const exp = expense.get(k) ?? ZERO;
    out.set(k, {
      date: k,
      income: inc,
      expense: exp,
      net: inc.minus(exp),
      txnIds: ids.get(k) ?? [],
      hasAttachment: attach.get(k) ?? false,
    });
  }
  return out;
}
