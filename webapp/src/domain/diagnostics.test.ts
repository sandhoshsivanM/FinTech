// Each check corresponds to a problem that actually occurred and was reported
// by nothing at the time.
import { describe, expect, test } from 'vitest';
import { runDiagnostics, worstLevel } from './diagnostics';
import type { Account, Category, Holding, Posting, Txn } from '@/lib/types';

const base = {
  txns: [] as Txn[], transfers: [], postings: [] as Posting[],
  accounts: [] as Account[], categories: [] as Category[],
  holdings: [] as Holding[], dividends: [],
};

const txn = (id: string, over: Partial<Txn> = {}): Txn => ({
  id, vaultId: 'v', amount: '100', type: 'expense', categoryId: 'c1',
  date: 0, createdAt: 0, ...over,
});
const leg = (id: string, entryId: string, accountId: string, amount: string): Posting =>
  ({ id, vaultId: 'v', entryId, accountId, amount });
const acct = (id: string): Account =>
  ({ id, vaultId: 'v', name: id, type: 'asset', subtype: 'bank', openingBalance: '0' });
const holding = (id: string, over: Partial<Holding> = {}): Holding => ({
  id, vaultId: 'v', symbol: 'INFY', exchange: 'NSE', quantity: '10', avgCost: '100',
  lastPrice: '120', assetType: 'equity_etf', firstPurchaseDate: 0, ...over,
});

const find = (cs: ReturnType<typeof runDiagnostics>, id: string) => cs.find((c) => c.id === id)!;

describe('balance sheet', () => {
  // The Reports card used to print "the books are out by X — Diagnostics will
  // name it" while Diagnostics had no such check. Now it does, and X is a real
  // fault rather than the user's lifetime savings.
  const income = (id: string): Account =>
    ({ id, vaultId: 'v', name: id, type: 'income', subtype: 'income', openingBalance: '0' });

  test('earning more than you spend is not a fault', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1')], accounts: [acct('a1'), income('a-inc')],
      postings: [leg('p1', 't1', 'a1', '85000'), leg('p2', 't1', 'a-inc', '-85000')],
    });
    expect(find(cs, 'balance-sheet').level).toBe('ok');
  });

  test('an unbalanced entry is reported here too', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1')], accounts: [acct('a1'), income('a-inc')],
      postings: [leg('p1', 't1', 'a1', '85000'), leg('p2', 't1', 'a-inc', '-84000')],
    });
    const c = find(cs, 'balance-sheet');
    expect(c.level).toBe('error');
    expect(c.detail).toContain('1000');
  });

  test('a posting against an unknown account names that account', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1')], accounts: [acct('a1')],
      postings: [leg('p1', 't1', 'a1', '500'), leg('p2', 't1', 'a-gone', '-500')],
    });
    const c = find(cs, 'balance-sheet');
    expect(c.level).toBe('error');
    expect(c.offenders).toContain('a-gone');
  });
});

describe('ledger integrity', () => {
  test('balanced postings pass', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1')], accounts: [acct('a1'), acct('a2')],
      postings: [leg('p1', 't1', 'a1', '100'), leg('p2', 't1', 'a2', '-100')],
      categories: [{ id: 'c1', vaultId: 'v', name: 'Food' }],
    });
    expect(find(cs, 'ledger-balanced').level).toBe('ok');
  });

  test('an entry whose postings do not sum to zero is an error', () => {
    // Account balances and net worth would disagree and neither is trustworthy.
    const cs = runDiagnostics({
      ...base, txns: [txn('t1')], accounts: [acct('a1'), acct('a2')],
      postings: [leg('p1', 't1', 'a1', '100'), leg('p2', 't1', 'a2', '-90')],
    });
    const c = find(cs, 'ledger-balanced');
    expect(c.level).toBe('error');
    expect(c.offenders).toContain('t1');
  });

  test('an entry with no postings is flagged as missing from balances', () => {
    const cs = runDiagnostics({ ...base, txns: [txn('t1')] });
    const c = find(cs, 'ledger-coverage');
    expect(c.level).toBe('warn');
    expect(c.offenders).toContain('t1');
  });

  test('a posting pointing at a deleted account is an error', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1')], accounts: [acct('a1')],
      postings: [leg('p1', 't1', 'a1', '100'), leg('p2', 't1', 'GONE', '-100')],
    });
    const c = find(cs, 'posting-accounts');
    expect(c.level).toBe('error');
    expect(c.offenders).toContain('p2');
  });
});

describe('stored amounts', () => {
  test('a value carrying a stray space is reported', () => {
    // The exact record that took the Dividends screen down.
    const cs = runDiagnostics({ ...base, txns: [txn('t1', { amount: '72.00 ' })] });
    const c = find(cs, 'money-values');
    expect(c.level).toBe('warn');
    expect(c.offenders).toContain('txn:t1');
  });

  test('clean values pass', () => {
    const cs = runDiagnostics({ ...base, txns: [txn('t1', { amount: '72.00' })] });
    expect(find(cs, 'money-values').level).toBe('ok');
  });
});

describe('portfolio completeness', () => {
  test('a deposit with no interest rate is flagged — that is the zero-return bug', () => {
    const cs = runDiagnostics({ ...base, holdings: [holding('h1', { assetType: 'fd', couponRatePct: null })] });
    const c = find(cs, 'fixed-income-rates');
    expect(c.level).toBe('warn');
    expect(c.offenders).toContain('h1');
  });

  test('a stock is never asked for an interest rate', () => {
    const cs = runDiagnostics({ ...base, holdings: [holding('h1')] });
    expect(find(cs, 'fixed-income-rates').level).toBe('ok');
  });

  test('an unpriced holding is reported as understating value', () => {
    const cs = runDiagnostics({ ...base, holdings: [holding('h1', { lastPrice: null })] });
    expect(find(cs, 'holding-prices').offenders).toContain('h1');
  });

  test('a holding with no purchase date blocks the tax split', () => {
    const cs = runDiagnostics({ ...base, holdings: [holding('h1', { firstPurchaseDate: null })] });
    expect(find(cs, 'holding-dates').level).toBe('warn');
  });
});

describe('references', () => {
  test('a transaction pointing at a deleted category is reported', () => {
    const cs = runDiagnostics({ ...base, txns: [txn('t1', { categoryId: 'gone' })] });
    const c = find(cs, 'txn-categories');
    expect(c.level).toBe('warn');
    expect(c.offenders).toContain('t1');
  });
});

describe('worstLevel', () => {
  test('an error outranks a warning', () => {
    expect(worstLevel([{ id: 'a', label: '', level: 'warn', detail: '' },
                       { id: 'b', label: '', level: 'error', detail: '' }])).toBe('error');
  });
  test('an empty vault is all clear, not broken', () => {
    expect(worstLevel(runDiagnostics(base))).toBe('ok');
  });
});
