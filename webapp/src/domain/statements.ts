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
import { accountBalances, openingDebitSigned } from './accountLedger';

export interface StatementLine {
  id: string;
  label: string;
  amount: Decimal;
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  /**
   * Equity accounts, plus the two lines every ledger owes but does not store:
   * opening balances contributed and earnings retained.
   */
  equity: StatementLine[];
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  totalEquity: Decimal;
  /**
   * Cumulative income − expense, i.e. what the business of living has earned.
   *
   * Income and expense accounts are never closed into an equity account, so
   * without this line the statement is missing the single largest component of
   * equity and cannot balance. Positive means income has exceeded expense.
   */
  retainedEarnings: Decimal;
  /**
   * Net assets brought in via account opening balances.
   *
   * An opening balance is money that existed before the ledger did; recording
   * it on the asset side alone would create value from nothing. Accounting
   * calls the other side owner's capital, and it is derived here rather than
   * stored because the opening balances themselves are the source of truth.
   */
  openingCapital: Decimal;
  /** Assets − liabilities. The figure the dashboard calls net worth. */
  netWorth: Decimal;
  /**
   * Whether the books balance.
   *
   * With retained earnings and opening capital derived above, assets +
   * liabilities + equity is identically zero for a well-formed ledger — so a
   * non-zero value here means real damage: an entry whose postings do not sum
   * to zero, or a posting against an account that is not in the chart. It is
   * never merely "you earned more than you spent", which is what this figure
   * used to be.
   */
  balanced: boolean;
  discrepancy: Decimal;
  /**
   * Postings pointing at account ids the chart does not contain, grouped by id.
   * These are the usual cause of a discrepancy and naming them saves a hunt.
   */
  unclassified: StatementLine[];
  /** When this sheet was drawn. A balance sheet is always point-in-time. */
  asOf: number;
}

/** Balances are debit-signed, so a liability sits negative. Show magnitudes. */
const magnitude = (d: Decimal) => d.abs();

/** Tolerance for the balanced check — half a paisa, below any real rounding. */
const TOLERANCE = '0.005';

export function balanceSheet(
  accounts: Account[],
  postings: Posting[],
  asOf: number = Date.now(),
): BalanceSheet {
  const balances = accountBalances(accounts, postings);
  const of = (t: AccountType) => accounts.filter((a) => a.type === t);
  const balanceOf = (a: Account) => balances.get(a.id) ?? ZERO;
  const totalOf = (t: AccountType) => of(t).reduce((s, a) => s.plus(balanceOf(a)), ZERO);

  const line = (a: Account): StatementLine => ({
    id: a.id, label: a.name, amount: magnitude(balanceOf(a)),
  });
  const sum = (ls: StatementLine[]) => ls.reduce((s, l) => s.plus(l.amount), ZERO);

  // Zero-balance rows are noise on a statement — a closed account with nothing
  // in it tells the reader nothing. An archived account still holding money is
  // the opposite: hiding it would drop real money out of the totals.
  const section = (t: AccountType) => of(t)
    .map(line)
    .filter((l) => !l.amount.isZero())
    .sort((a, b) => b.amount.cmp(a.amount));

  const assets = section('asset');
  const liabilities = section('liability');

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);

  // Debit-signed throughout: assets and expenses positive, liabilities, equity
  // and income negative. Retained earnings carries the sign of the income and
  // expense balances it replaces, so substituting it changes nothing but the
  // heading it sits under.
  const retainedEarningsDebitSigned = totalOf('income').plus(totalOf('expense'));
  const openingCapitalDebitSigned = accounts
    .reduce((s, a) => s.plus(openingDebitSigned(a)), ZERO)
    .neg();

  const equityAccounts = section('equity');
  const equity = [...equityAccounts];
  if (!openingCapitalDebitSigned.isZero()) {
    equity.push({ id: 'derived-opening', label: 'Opening balances', amount: magnitude(openingCapitalDebitSigned) });
  }
  if (!retainedEarningsDebitSigned.isZero()) {
    equity.push({ id: 'derived-retained', label: 'Retained earnings', amount: magnitude(retainedEarningsDebitSigned) });
  }

  const known = new Set(accounts.map((a) => a.id));
  const strays = new Map<string, Decimal>();
  for (const p of postings) {
    if (known.has(p.accountId)) continue;
    strays.set(p.accountId, (strays.get(p.accountId) ?? ZERO).plus(D(p.amount)));
  }
  const unclassified = [...strays.entries()]
    .map(([id, amount]) => ({ id, label: id, amount }))
    .filter((l) => !l.amount.isZero())
    .sort((a, b) => b.amount.abs().cmp(a.amount.abs()));

  // Every account balance plus the two derived equity lines. The opening
  // balances cancel against openingCapital and the postings cancel among
  // themselves, so anything left over is an unbalanced entry or a stray
  // posting — a fault, not an outcome.
  const raw = totalOf('asset')
    .plus(totalOf('liability'))
    .plus(totalOf('equity'))
    .plus(retainedEarningsDebitSigned)
    .plus(openingCapitalDebitSigned);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity: sum(equity),
    retainedEarnings: retainedEarningsDebitSigned.neg(),
    openingCapital: openingCapitalDebitSigned.neg(),
    netWorth: totalAssets.minus(totalLiabilities),
    balanced: raw.abs().lt(TOLERANCE),
    discrepancy: raw,
    unclassified,
    asOf,
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
