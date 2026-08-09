/**
 * Comparing the book against a bank statement.
 *
 * The gap this fills is a real workflow that had no support: exporting to a
 * spreadsheet and eyeballing two columns to find why "my app says ₹1,08,420
 * and HDFC says ₹1,09,920". The importer already reads the statement's running
 * balance and threw it away, and every entry was posted to a double-entry
 * ledger that could answer the question exactly.
 *
 * The arithmetic that matters:
 *
 *     cleared balance  =  opening balance
 *                      +  every cleared entry up to the statement date
 *
 *     difference       =  statement closing balance − cleared balance
 *
 * A difference of zero means the book and the bank agree about every entry
 * that has actually settled. A non-zero difference is not an error — it is
 * usually an entry the bank has not processed yet, or one that was never
 * recorded. The uncleared list is what explains it, which is the part a
 * spreadsheet cannot do for you.
 */
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Account, Posting, Transfer, Txn } from '@/lib/types';
import { openingDebitSigned } from './accountLedger';

export interface ReconcileEntry {
  id: string;
  kind: 'txn' | 'transfer';
  date: number;
  description: string;
  /** Debit-signed: what this entry does to the chosen account. */
  delta: Decimal;
  cleared: boolean;
}

export interface Reconciliation {
  /** Balance before any entry in the period. */
  opening: Decimal;
  /** Opening plus every cleared entry — what the bank should show. */
  clearedBalance: Decimal;
  /** Opening plus every entry, cleared or not — what the app shows. */
  bookBalance: Decimal;
  /** statementBalance − clearedBalance. Zero means reconciled. */
  difference: Decimal | null;
  reconciled: boolean;
  entries: ReconcileEntry[];
  clearedCount: number;
  unclearedCount: number;
}

/** What one entry does to `accountId`, from the postings that already exist. */
function deltaFor(entryId: string, accountId: string, postings: Posting[]): Decimal {
  return postings
    .filter((p) => p.entryId === entryId && p.accountId === accountId)
    .reduce((s, p) => s.plus(D(p.amount)), ZERO);
}

export function reconcile(input: {
  account: Account;
  txns: Txn[];
  transfers: Transfer[];
  postings: Posting[];
  /** Entries on or before this instant are in scope. */
  asOf: number;
  /** The bank's closing balance. Null until the user types one. */
  statementBalance: Decimal | null;
  describe: (e: Txn | Transfer) => string;
}): Reconciliation {
  const { account, txns, transfers, postings, asOf, statementBalance, describe } = input;

  // Opening balance comes from the account record, not from summing entries —
  // an account opened with money already in it has no transaction for it.
  const opening = openingDebitSigned(account);

  const inScope: ReconcileEntry[] = [];
  for (const t of txns) {
    if (t.date > asOf) continue;
    const delta = deltaFor(t.id, account.id, postings);
    if (delta.isZero()) continue; // does not touch this account
    inScope.push({ id: t.id, kind: 'txn', date: t.date, description: describe(t), delta, cleared: t.cleared === true });
  }
  for (const t of transfers) {
    if (t.date > asOf) continue;
    const delta = deltaFor(t.id, account.id, postings);
    if (delta.isZero()) continue;
    inScope.push({ id: t.id, kind: 'transfer', date: t.date, description: describe(t), delta, cleared: t.cleared === true });
  }

  inScope.sort((a, b) => b.date - a.date);

  const clearedSum = inScope.filter((e) => e.cleared).reduce((s, e) => s.plus(e.delta), ZERO);
  const allSum = inScope.reduce((s, e) => s.plus(e.delta), ZERO);

  const clearedBalance = opening.plus(clearedSum);
  const bookBalance = opening.plus(allSum);
  const difference = statementBalance == null ? null : statementBalance.minus(clearedBalance);

  return {
    opening,
    clearedBalance,
    bookBalance,
    difference,
    // Rounded to paise: a difference of 0.0000001 from repeated division is
    // agreement, and refusing to call it that would make the feature unusable.
    reconciled: difference != null && difference.abs().lt('0.005'),
    entries: inScope,
    clearedCount: inScope.filter((e) => e.cleared).length,
    unclearedCount: inScope.filter((e) => !e.cleared).length,
  };
}

/**
 * Entries that would each, on their own, explain the difference exactly.
 *
 * When a statement is out by one entry — the usual case — this names it
 * instead of leaving the user to scan the list. Nothing is auto-ticked: a
 * suggestion the user did not make is how a wrong reconciliation becomes
 * permanent.
 */
export function explainDifference(r: Reconciliation): ReconcileEntry[] {
  if (r.difference == null || r.reconciled) return [];
  return r.entries.filter((e) => !e.cleared && e.delta.minus(r.difference!).abs().lt('0.005'));
}
