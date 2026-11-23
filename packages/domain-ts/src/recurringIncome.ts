/**
 * Regular monthly income — a salary, rent received, a pension — found in the
 * ledger. Mirrors packages/khazana_domain/lib/services/recurring_income.dart.
 *
 * A payer's entries form a pattern when at least `minOccurrences` of them are
 * within ±10% of their median amount and every gap between those is a month
 * (25–35 days), or two months (55–65) when one month was missed. Freelance
 * income that varies more than that is left alone on purpose: calling it
 * regular would make a quiet month look like a missed salary.
 */
import Decimal from 'decimal.js';
import { D } from './money';
import type { Txn } from './types';

export type RecurringIncomeKind = 'salary' | 'regular';

export const RECURRING_INCOME_LABEL: Record<RecurringIncomeKind, string> = {
  salary: 'Salary',
  regular: 'Regular',
};

export interface RecurringIncome {
  /** The normalised payer name the entries were grouped by. */
  payerKey: string;
  kind: RecurringIncomeKind;
  /** The median amount of the matching entries. */
  typicalAmount: Decimal;
  /** The median day of the month it lands on. */
  expectedDay: number;
  /** The entries that belong to the pattern. */
  txnIds: Set<string>;
}

const MONTHS = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
  'nov', 'dec', 'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);
const NOISE = new Set(['neft', 'imps', 'rtgs', 'upi', 'by', 'from', 'ref', 'for', 'cr']);
const SALARY_WORDS = new Set(['salary', 'sal', 'payroll', 'wages', 'stipend']);

/**
 * A payer name with the parts that change every month removed, so
 * "ACME TECH SALARY JAN26" and "Acme Tech Salary Feb26" group together.
 */
export function payerKey(merchant: string | null | undefined): string {
  if (!merchant) return '';
  return merchant
    .toLowerCase()
    .split(/[^a-z@.]+/)
    .filter((w) => w.length > 0 && !MONTHS.has(w) && !NOISE.has(w))
    .join(' ');
}

const isMonthlyGap = (days: number) => (days >= 25 && days <= 35) || (days >= 55 && days <= 65);

/** Whole calendar days, counted in UTC so a DST change cannot shift it. */
function daysBetween(a: number, b: number): number {
  const da = new Date(a);
  const db = new Date(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** The lower middle value, so the result is always one of the inputs. */
function median(values: Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Finds regular monthly income in `txns`, largest first. */
export function detectRecurringIncome(txns: Iterable<Txn>, minOccurrences = 3): RecurringIncome[] {
  const byPayer = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.type !== 'income') continue;
    const key = payerKey(t.merchant);
    if (!key) continue;
    const group = byPayer.get(key);
    if (group) group.push(t);
    else byPayer.set(key, [t]);
  }

  const out: RecurringIncome[] = [];
  for (const [key, group] of byPayer) {
    if (group.length < minOccurrences) continue;
    const mid = median(group.map((t) => D(t.amount)));
    const tolerance = mid.mul('0.1');
    const matching = group
      .filter((t) => D(t.amount).minus(mid).abs().lte(tolerance))
      .sort((a, b) => a.date - b.date);
    if (matching.length < minOccurrences) continue;
    let monthly = true;
    for (let i = 1; i < matching.length; i++) {
      if (!isMonthlyGap(daysBetween(matching[i - 1].date, matching[i].date))) {
        monthly = false;
        break;
      }
    }
    if (!monthly) continue;
    const days = matching.map((t) => new Date(t.date).getDate()).sort((a, b) => a - b);
    out.push({
      payerKey: key,
      kind: key.split(' ').some((w) => SALARY_WORDS.has(w)) ? 'salary' : 'regular',
      typicalAmount: median(matching.map((t) => D(t.amount))),
      expectedDay: days[Math.floor((days.length - 1) / 2)],
      txnIds: new Set(matching.map((t) => t.id)),
    });
  }
  return out.sort((a, b) => b.typicalAmount.comparedTo(a.typicalAmount));
}

/** Entry id → kind, for the ledger rows. */
export function recurringIncomeById(patterns: Iterable<RecurringIncome>): Map<string, RecurringIncomeKind> {
  const out = new Map<string, RecurringIncomeKind>();
  for (const p of patterns) for (const id of p.txnIds) out.set(id, p.kind);
  return out;
}
