// Double-entry ledger math — mirrors lib/domain/services/account_ledger.dart.
// Postings are debit-signed (debit +, credit −); each entry's postings sum to
// zero. An account's balance is its debit-signed opening balance plus the sum of
// its postings. Net worth is the debit-signed balance of asset + liability
// accounts plus market-priced holdings (PRD §16).
import Decimal from 'decimal.js';
import { D, ZERO } from '@/lib/money';
import type { Account, AccountType, Holding, Posting, TxnType } from '@/lib/types';

export const isDebitNormal = (t: AccountType): boolean =>
  t === 'asset' || t === 'expense';

export const isNetWorthType = (t: AccountType): boolean =>
  t === 'asset' || t === 'liability';

export const openingDebitSigned = (a: Account): Decimal =>
  isDebitNormal(a.type) ? D(a.openingBalance) : D(a.openingBalance).neg();

export interface EntryArgs {
  entryId: string;
  vaultId: string;
  amount: string; // positive magnitude
  type: TxnType;
  moneyAccountId: string; // cash / bank / credit-card account
  categoryAccountId: string; // income or expense contra account
}

/** Balanced two-leg postings for a simple transaction. Sum is always zero. */
export function postingsForEntry(args: EntryArgs): Posting[] {
  const mag = D(args.amount).abs();
  const debit = args.type === 'income' ? args.moneyAccountId : args.categoryAccountId;
  const credit = args.type === 'income' ? args.categoryAccountId : args.moneyAccountId;
  return [
    { id: `${args.entryId}:dr`, vaultId: args.vaultId, entryId: args.entryId, accountId: debit, amount: mag.toString() },
    { id: `${args.entryId}:cr`, vaultId: args.vaultId, entryId: args.entryId, accountId: credit, amount: mag.neg().toString() },
  ];
}

/** Whether a set of postings (typically one entry's) is balanced. */
export function isBalanced(postings: Posting[]): boolean {
  return postings.reduce((s, p) => s.plus(D(p.amount)), ZERO).isZero();
}

/** Whether every entry in the ledger sums to zero. */
export function allEntriesBalanced(postings: Posting[]): boolean {
  const byEntry = new Map<string, Decimal>();
  for (const p of postings) {
    byEntry.set(p.entryId, (byEntry.get(p.entryId) ?? ZERO).plus(D(p.amount)));
  }
  return [...byEntry.values()].every((s) => s.isZero());
}

/** Debit-signed balance per account: opening balance + Σ postings. */
export function accountBalances(accounts: Account[], postings: Posting[]): Map<string, Decimal> {
  const balances = new Map<string, Decimal>();
  for (const a of accounts) balances.set(a.id, openingDebitSigned(a));
  for (const p of postings) {
    balances.set(p.accountId, (balances.get(p.accountId) ?? ZERO).plus(D(p.amount)));
  }
  return balances;
}

/** Net worth from the chart of accounts alone (asset + liability balances). */
export function netWorthFromAccounts(accounts: Account[], postings: Posting[]): Decimal {
  const balances = accountBalances(accounts, postings);
  let nw = ZERO;
  for (const a of accounts) {
    if (isNetWorthType(a.type)) nw = nw.plus(balances.get(a.id) ?? ZERO);
  }
  return nw;
}

/** Market value of a holding: quantity × (lastPrice ?? avgCost). */
export function holdingMarketValue(h: Holding): Decimal {
  return D(h.quantity).times(D(h.lastPrice ?? h.avgCost));
}

/**
 * Full net worth: account-tracked cash/bank/credit/loan/manual assets plus
 * market-priced securities. Holdings are not mirrored as asset accounts, so
 * nothing is double-counted (PRD §16 invariant).
 */
export function netWorth(accounts: Account[], postings: Posting[], holdings: Holding[]): Decimal {
  const fromAccounts = netWorthFromAccounts(accounts, postings);
  const fromHoldings = holdings.reduce((s, h) => s.plus(holdingMarketValue(h)), ZERO);
  return fromAccounts.plus(fromHoldings);
}
