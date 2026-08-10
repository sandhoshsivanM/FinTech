// A balance sheet from postings that already existed. The ledger has been
// producing one figure per account; this asks it a different question.
import { describe, expect, test } from 'vitest';
import { balanceSheet, cashFlow } from './statements';
import type { Account, Posting } from '@/lib/types';

const acct = (id: string, name: string, type: Account['type'], opening = '0'): Account =>
  ({ id, vaultId: 'v', name, type, subtype: type === 'asset' ? 'bank' : type, openingBalance: opening });

const leg = (id: string, entryId: string, accountId: string, amount: string): Posting =>
  ({ id, vaultId: 'v', entryId, accountId, amount });

describe('balance sheet', () => {
  const accounts = [
    acct('a-bank', 'HDFC Savings', 'asset', '100000'),
    acct('a-loan', 'Home Loan', 'liability'),
    acct('a-open', 'Opening Balances', 'equity'),
  ];

  test('assets and liabilities are shown as magnitudes, not debit signs', () => {
    // A liability sits negative in a debit-signed ledger; showing "−₹50,000"
    // under a heading that already says Liabilities is a double negative.
    const postings = [
      leg('p1', 'e1', 'a-loan', '-50000'),
      leg('p2', 'e1', 'a-bank', '50000'),
    ];
    const bs = balanceSheet(accounts, postings);
    expect(bs.totalLiabilities.toNumber()).toBe(50000);
    expect(bs.liabilities[0].amount.toNumber()).toBe(50000);
  });

  test('net worth is assets minus liabilities', () => {
    const bs = balanceSheet(accounts, [
      leg('p1', 'e1', 'a-loan', '-50000'),
      leg('p2', 'e1', 'a-bank', '50000'),
    ]);
    expect(bs.totalAssets.toNumber()).toBe(150000);
    expect(bs.netWorth.toNumber()).toBe(100000);
  });

  test('an opening balance balances on its own, funded by derived capital', () => {
    // An opening balance is money that predates the ledger. Its contra is
    // derived, because nothing in the app ever posts one — so requiring an
    // explicit equity leg would mean every real vault reads as broken.
    const bs = balanceSheet(accounts, []);
    expect(bs.balanced).toBe(true);
    expect(bs.openingCapital.toNumber()).toBe(100000);
    expect(bs.equity.find((l) => l.id === 'derived-opening')?.amount.toNumber()).toBe(100000);
  });

  test('an unbalanced entry is reported rather than hidden in a total', () => {
    const bs = balanceSheet(accounts, [leg('p1', 'e1', 'a-bank', '5000')]);
    // Money appeared with nothing on the other side; saying so beats printing
    // an authoritative-looking total that is wrong.
    expect(bs.balanced).toBe(false);
    expect(bs.discrepancy.toNumber()).toBe(5000);
  });

  test('a posting against an account outside the chart is named', () => {
    const bs = balanceSheet(accounts, [
      leg('p1', 'e1', 'a-bank', '5000'),
      leg('p2', 'e1', 'a-ghost', '-5000'),
    ]);
    expect(bs.balanced).toBe(false);
    expect(bs.unclassified.map((l) => l.id)).toEqual(['a-ghost']);
    expect(bs.unclassified[0].amount.toNumber()).toBe(-5000);
  });

  test('zero-balance accounts are left off but archived money is not', () => {
    // Archiving an account does not spend what is in it. Dropping it from the
    // statement would quietly delete real money from the totals.
    const withDead = [
      ...accounts,
      acct('a-old', 'Closed', 'asset'),
      { ...acct('a-arch', 'Archived', 'asset', '900'), archived: true },
    ];
    const bs = balanceSheet(withDead, []);
    expect(bs.assets.map((l) => l.label)).toEqual(['HDFC Savings', 'Archived']);
    expect(bs.totalAssets.toNumber()).toBe(100900);
    expect(bs.balanced).toBe(true);
  });
});

describe('balance sheet with income and expense', () => {
  // The case the original fixtures could not reach: every real vault has income
  // and expense accounts, and they are never closed into equity. Without a
  // retained-earnings line the sheet reported lifetime net income as a fault
  // and told the user their books were out by exactly what they had saved.
  const accounts = [
    acct('a-bank', 'HDFC Savings', 'asset'),
    acct('a-income', 'Income', 'income'),
    acct('a-food', 'Food', 'expense'),
    acct('a-open', 'Opening Balances', 'equity'),
  ];
  // Earn 85,000, spend 20,000 on food. Both entries balanced.
  const postings = [
    leg('p1', 'e1', 'a-bank', '85000'),
    leg('p2', 'e1', 'a-income', '-85000'),
    leg('p3', 'e2', 'a-food', '20000'),
    leg('p4', 'e2', 'a-bank', '-20000'),
  ];

  test('books balance even though income exceeds expense', () => {
    const bs = balanceSheet(accounts, postings);
    expect(bs.balanced).toBe(true);
    expect(bs.discrepancy.toNumber()).toBe(0);
  });

  test('the surplus appears as retained earnings, not as a discrepancy', () => {
    const bs = balanceSheet(accounts, postings);
    expect(bs.retainedEarnings.toNumber()).toBe(65000);
    expect(bs.equity.find((l) => l.id === 'derived-retained')?.amount.toNumber()).toBe(65000);
  });

  test('assets equal liabilities plus equity', () => {
    const bs = balanceSheet(accounts, postings);
    expect(bs.totalAssets.toNumber()).toBe(65000);
    expect(bs.totalAssets.toNumber()).toBe(bs.totalLiabilities.plus(bs.totalEquity).toNumber());
  });

  test('spending more than you earn is still balanced', () => {
    const overspent = [...postings, leg('p5', 'e3', 'a-food', '90000'), leg('p6', 'e3', 'a-bank', '-90000')];
    const bs = balanceSheet(accounts, overspent);
    expect(bs.balanced).toBe(true);
    expect(bs.retainedEarnings.toNumber()).toBe(-25000);
  });
});

describe('cash flow', () => {
  const accounts = [
    acct('a-income', 'Income', 'income'),
    acct('a-food', 'Food', 'expense'),
    acct('a-rent', 'Rent', 'expense'),
  ];
  const dates = new Map([['e1', 100], ['e2', 200], ['e3', 5000]]);

  test('splits income from expenses over the window', () => {
    const cf = cashFlow(accounts, [
      leg('p1', 'e1', 'a-income', '-85000'),
      leg('p2', 'e2', 'a-food', '450'),
      leg('p3', 'e2', 'a-rent', '20000'),
    ], dates, 0, 1000);

    expect(cf.totalIncome.toNumber()).toBe(85000);
    expect(cf.totalExpenses.toNumber()).toBe(20450);
    expect(cf.net.toNumber()).toBe(64550);
  });

  test('entries outside the window are excluded', () => {
    const cf = cashFlow(accounts, [
      leg('p1', 'e1', 'a-income', '-85000'),
      leg('p4', 'e3', 'a-income', '-999999'),
    ], dates, 0, 1000);
    expect(cf.totalIncome.toNumber()).toBe(85000);
  });

  test('a posting whose entry date is unknown is not guessed into the window', () => {
    const cf = cashFlow(accounts, [leg('p1', 'unknown', 'a-income', '-5000')], dates, 0, 1000);
    expect(cf.totalIncome.toNumber()).toBe(0);
  });
});
