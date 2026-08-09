// Reconciliation replaces exporting to a spreadsheet and comparing two columns
// by eye. The arithmetic has to be exactly right or it is worse than nothing.
import { describe, expect, test } from 'vitest';
import { D } from '@/lib/money';
import { explainDifference, reconcile } from './reconcile';
import type { Account, Posting, Transfer, Txn } from '@/lib/types';

const ACCT: Account = {
  id: 'a1', vaultId: 'v', name: 'HDFC Savings', type: 'asset',
  subtype: 'bank', openingBalance: '100000',
};

const DAY = 86_400_000;
const T0 = new Date(2026, 7, 1).getTime();

const txn = (id: string, day: number, over: Partial<Txn> = {}): Txn => ({
  id, vaultId: 'v', amount: '500', type: 'expense', categoryId: 'c1',
  date: T0 + day * DAY, createdAt: 0, ...over,
});
/** Debit-signed leg against the bank account. */
const leg = (entryId: string, amount: string): Posting =>
  ({ id: `${entryId}:dr`, vaultId: 'v', entryId, accountId: 'a1', amount });

const run = (opts: {
  txns: Txn[]; postings: Posting[]; statement?: string; asOf?: number; transfers?: Transfer[];
}) => reconcile({
  account: ACCT,
  txns: opts.txns,
  transfers: opts.transfers ?? [],
  postings: opts.postings,
  asOf: opts.asOf ?? T0 + 30 * DAY,
  statementBalance: opts.statement != null ? D(opts.statement) : null,
  describe: () => 'entry',
});

describe('balances', () => {
  test('opening comes from the account, not from summing entries', () => {
    // An account opened with money in it has no transaction for that money.
    const r = run({ txns: [], postings: [] });
    expect(r.opening.toNumber()).toBe(100000);
    expect(r.bookBalance.toNumber()).toBe(100000);
  });

  test('book balance counts every entry; cleared balance counts only ticked ones', () => {
    const r = run({
      txns: [txn('t1', 1, { cleared: true }), txn('t2', 2)],
      postings: [leg('t1', '-500'), leg('t2', '-300')],
    });
    expect(r.bookBalance.toNumber()).toBe(99200);   // both
    expect(r.clearedBalance.toNumber()).toBe(99500); // only t1
    expect(r.clearedCount).toBe(1);
    expect(r.unclearedCount).toBe(1);
  });

  test('entries after the statement date are out of scope', () => {
    const r = run({
      txns: [txn('t1', 1), txn('t2', 40)],
      postings: [leg('t1', '-500'), leg('t2', '-999')],
      asOf: T0 + 30 * DAY,
    });
    expect(r.entries).toHaveLength(1);
    expect(r.bookBalance.toNumber()).toBe(99500);
  });

  test('an entry that does not touch this account is ignored', () => {
    const r = run({
      txns: [txn('t1', 1)],
      postings: [{ id: 'p', vaultId: 'v', entryId: 't1', accountId: 'other', amount: '-500' }],
    });
    expect(r.entries).toHaveLength(0);
  });
});

describe('the difference', () => {
  test('zero when every cleared entry agrees with the bank', () => {
    const r = run({
      txns: [txn('t1', 1, { cleared: true })],
      postings: [leg('t1', '-500')],
      statement: '99500',
    });
    expect(r.difference!.toNumber()).toBe(0);
    expect(r.reconciled).toBe(true);
  });

  test('non-zero when the bank has processed something the book has not ticked', () => {
    const r = run({
      txns: [txn('t1', 1, { cleared: true }), txn('t2', 2)],
      postings: [leg('t1', '-500'), leg('t2', '-1500')],
      statement: '98000',
    });
    // Bank 98000 vs cleared 99500 → −1500, exactly the unticked entry.
    expect(r.difference!.toNumber()).toBe(-1500);
    expect(r.reconciled).toBe(false);
  });

  test('rounding noise still counts as agreement', () => {
    // A difference of a thousandth of a paise is agreement; refusing to say so
    // would make the feature unusable.
    const r = run({
      txns: [txn('t1', 1, { cleared: true })],
      postings: [leg('t1', '-500')],
      statement: '99500.001',
    });
    expect(r.reconciled).toBe(true);
  });

  test('no statement typed means no difference claimed', () => {
    const r = run({ txns: [], postings: [] });
    expect(r.difference).toBeNull();
    expect(r.reconciled).toBe(false);
  });
});

describe('explainDifference', () => {
  test('names the single entry that accounts for the gap', () => {
    const r = run({
      txns: [txn('t1', 1, { cleared: true }), txn('t2', 2)],
      postings: [leg('t1', '-500'), leg('t2', '-1500')],
      statement: '98000',
    });
    const s = explainDifference(r);
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe('t2');
  });

  test('suggests nothing once reconciled', () => {
    const r = run({
      txns: [txn('t1', 1, { cleared: true })],
      postings: [leg('t1', '-500')],
      statement: '99500',
    });
    expect(explainDifference(r)).toHaveLength(0);
  });

  test('suggests nothing when no single entry explains the gap', () => {
    // Two entries summing to the difference is a guess, not an explanation.
    const r = run({
      txns: [txn('t1', 1), txn('t2', 2)],
      postings: [leg('t1', '-500'), leg('t2', '-300')],
      statement: '99200',
    });
    expect(explainDifference(r)).toHaveLength(0);
  });

  test('never ticks anything itself', () => {
    const r = run({
      txns: [txn('t1', 1), txn('t2', 2)],
      postings: [leg('t1', '-500'), leg('t2', '-1500')],
      statement: '99500',
    });
    // A suggestion the user did not make is how a wrong reconciliation becomes
    // permanent, so entries stay untouched.
    expect(r.entries.every((e) => !e.cleared)).toBe(true);
  });
});
