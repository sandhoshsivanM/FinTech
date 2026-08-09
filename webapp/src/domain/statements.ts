/**
 * Balance sheet and cash-flow statement, from the postings that already exist.
 *
 * The chart of accounts and its double-entry postings have been in the vault
 * all along, producing one figure — a per-account balance. The same records
 * answer "what do I own, what do I owe" and "where did the money come from and
 * go", which is what most people actually want from a finance app and what a
 * category donut only gestures at.
 *
 * No new data: this is a different question asked of the same ledger.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Account, AccountType, Posting } from '@/lib/types';
import { accountBalances } from './accountLedger';

export interface StatementLine {
  id: string;
  label: string;
  amount: Decimal;
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  /** Assets − liabilities. The figure the dashboard calls net worth. */
  netWorth: Decimal;
  /**
   * Whether the books balance.
   *
   * In a complete double-entry system assets − liabilities − equity is zero.
   * When it is not, something is posted against an account the statement does
   * not classify, and reporting that honestly beats printing a total that
   * looks authoritative and is not.
   */
  balanced: boolean;
  discrepancy: Decimal;
}

/** Balances are debit-signed, so a liability sits negative. Show magnitudes. */
const magnitude = (d: Decimal) => d.abs();

export function balanceSheet(accounts: Account[], postings: Posting[]): BalanceSheet {
  const balances = accountBalances(accounts, postings);
  const live = accounts.filter((a) => !a.archived);
  const of = (t: AccountType) => live.filter((a) => a.type === t);

  const line = (a: Account): StatementLine => ({
    id: a.id, label: a.name, amount: magnitude(balances.get(a.id) ?? ZERO),
  });
  const sum = (ls: StatementLine[]) => ls.reduce((s, l) => s.plus(l.amount), ZERO);

  // Zero-balance rows are noise on a statement — a closed account with nothing
  // in it tells the reader nothing.
  const assets = of('asset').map(line).filter((l) => !l.amount.isZero()).sort((a, b) => b.amount.cmp(a.amount));
  const liabilities = of('liability').map(line).filter((l) => !l.amount.isZero()).sort((a, b) => b.amount.cmp(a.amount));

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const equity = of('equity').reduce((s, a) => s.plus(balances.get(a.id) ?? ZERO), ZERO);

  // Debit-signed: assets positive, liabilities and equity negative. A complete
  // set sums to zero.
  const raw = of('asset').reduce((s, a) => s.plus(balances.get(a.id) ?? ZERO), ZERO)
    .plus(of('liability').reduce((s, a) => s.plus(balances.get(a.id) ?? ZERO), ZERO))
    .plus(equity);

  return {
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets.minus(totalLiabilities),
    balanced: raw.abs().lt('0.005'),
    discrepancy: raw,
  };
}

export interface CashFlow {
  income: StatementLine[];
  expenses: StatementLine[];
  totalIncome: Decimal;
  totalExpenses: Decimal;
  /** Income − expenses over the window. */
  net: Decimal;
}

/**
 * Where money came from and went, over a window.
 *
 * Filtered by the entry dates the caller passes in, not by posting date —
 * postings carry no date of their own; they inherit the entry's.
 */
export function cashFlow(
  accounts: Account[],
  postings: Posting[],
  entryDates: Map<string, number>,
  from: number,
  to: number,
): CashFlow {
  const inWindow = postings.filter((p) => {
    const d = entryDates.get(p.entryId);
    return d != null && d >= from && d <= to;
  });

  const byAccount = new Map<string, Decimal>();
  for (const p of inWindow) {
    byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? ZERO).plus(D(p.amount)));
  }

  const live = accounts.filter((a) => !a.archived);
  const build = (t: AccountType) => live
    .filter((a) => a.type === t)
    .map((a) => ({ id: a.id, label: a.name, amount: magnitude(byAccount.get(a.id) ?? ZERO) }))
    .filter((l) => !l.amount.isZero())
    .sort((a, b) => b.amount.cmp(a.amount));

  const income = build('income');
  const expenses = build('expense');
  const totalIncome = income.reduce((s, l) => s.plus(l.amount), ZERO);
  const totalExpenses = expenses.reduce((s, l) => s.plus(l.amount), ZERO);

  return { income, expenses, totalIncome, totalExpenses, net: totalIncome.minus(totalExpenses) };
}
