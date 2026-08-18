// Each check corresponds to a problem that actually occurred and was reported
// by nothing at the time.
import { describe, expect, test } from 'vitest';
import { runDiagnostics, worstLevel } from './diagnostics';
import { FX_STALE_DAYS } from './currency';
import type { Account, Category, FxRate, Holding, Posting, Txn } from '@/lib/types';

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

describe('receipts', () => {
  // Deleting a transaction used to leave its receipt in the vault forever, and
  // replacing one abandoned the old blob — both unreachable, both still riding
  // along in every backup.
  test('a receipt nothing points at is reported', () => {
    const cs = runDiagnostics({ ...base, txns: [txn('t1')], attachmentIds: ['att-1'] });
    const c = find(cs, 'attachment-links');
    expect(c.level).toBe('warn');
    expect(c.offenders).toEqual(['att-1']);
  });

  test('a transaction claiming a receipt that is gone is an error', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1', { attachmentRef: 'att-gone' })], attachmentIds: [],
    });
    const c = find(cs, 'attachment-links');
    expect(c.level).toBe('error');
    expect(c.offenders).toEqual(['t1']);
  });

  test('a matched pair passes', () => {
    const cs = runDiagnostics({
      ...base, txns: [txn('t1', { attachmentRef: 'att-1' })], attachmentIds: ['att-1'],
    });
    expect(find(cs, 'attachment-links').level).toBe('ok');
  });

  test('a vault with no receipts is not a fault', () => {
    expect(find(runDiagnostics({ ...base, attachmentIds: [] }), 'attachment-links').level).toBe('ok');
  });
});

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

describe('current exchange rates', () => {
  // A rate nobody has written down is not the same problem as one written down
  // a year ago, and neither is a problem at all for a vault that only holds
  // rupees. This check had no coverage until a restore was refused over it.
  const DAY = 86_400_000;
  const now = Date.UTC(2026, 7, 18);
  const rate = (code: string, asOf: number): FxRate =>
    ({ id: code, code, rateToInr: '88', asOf, source: 'manual' });
  const usd = holding('h1', { currency: 'USD' });

  test('a recorded, recent rate passes', () => {
    const cs = runDiagnostics({ ...base, holdings: [usd], fxRates: [rate('USD', now - DAY)], now });
    expect(find(cs, 'fx-current').level).toBe('ok');
  });

  test('a rate that was never recorded is an error, because the seed is a guess', () => {
    const cs = runDiagnostics({ ...base, holdings: [usd], fxRates: [], now });
    const c = find(cs, 'fx-current');
    expect(c.level).toBe('error');
    expect(c.offenders).toEqual(['USD']);
  });

  test('a rate older than the staleness window is a warning, not an error', () => {
    const cs = runDiagnostics({
      ...base, holdings: [usd], fxRates: [rate('USD', now - (FX_STALE_DAYS + 1) * DAY)], now,
    });
    const c = find(cs, 'fx-current');
    expect(c.level).toBe('warn');
    expect(c.offenders).toEqual(['USD']);
  });

  test('a rupees-only vault is never asked about exchange rates at all', () => {
    const cs = runDiagnostics({ ...base, holdings: [holding('h1')], fxRates: [], now });
    expect(cs.find((c) => c.id === 'fx-current')).toBeUndefined();
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
