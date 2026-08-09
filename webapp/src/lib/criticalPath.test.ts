/**
 * The critical path, end to end.
 *
 * Every bug that reached the user in a day of real use was an integration bug:
 * a worker handing back `undefined`, records filed under a profile id from
 * another vault, a money string Decimal rejected, an override no consumer read.
 * The unit tests were green throughout — the seams were never exercised.
 *
 * This walks one file from parse to valuation to reconciliation to backup and
 * back out into a *second* vault, asserting the money survives each hop. It
 * would have caught three of those five bugs.
 */
import { describe, expect, test } from 'vitest';
import { D } from './money';
import { parseDelimited } from './sheet';
import { parseTxnRows, planTxnImport, guessCategory } from './txnImport';
import { parseHoldingsRows, planImport } from './holdingsCsv';
import { deriveKey, encryptJson, decryptJson, bufToB64, b64ToBuf } from './crypto';
import { reconcile } from '@/domain/reconcile';
import { runDiagnostics } from '@/domain/diagnostics';
import { portfolioSummary } from '@/domain/portfolio';
import { postingsForEntry } from '@/domain/accountLedger';
import type { Account, Category, Posting, Txn } from './types';

const STATEMENT = [
  'Account Number,XXXXXXXX1234',
  '',
  'Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '02/05/2026,SALARY CREDIT ACME LTD,,85000.00,185000.00',
  '03/05/2026,UPI-SWIGGY ORDER,450.50,,184549.50',
  '04/05/2026,ACH C/ RELIANCE INDUSTRIES DIV,,1240.00,185789.50',
].join('\n');

const BROKER = [
  'Symbol,Qty,Avg Cost,LTP',
  'RELIANCE,10,2000,2200',
  'HDFC FD,1,100000,',
].join('\n');

const CATEGORIES: Category[] = [
  { id: 'c-food', vaultId: 'v', name: 'Food' },
  { id: 'c-salary', vaultId: 'v', name: 'Salary' },
  { id: 'c-invest', vaultId: 'v', name: 'Investment' },
  { id: 'c-other', vaultId: 'v', name: 'Other' },
];

const BANK: Account = {
  id: 'a-bank', vaultId: 'v', profileId: 'p1', name: 'HDFC Savings',
  type: 'asset', subtype: 'bank', openingBalance: '100000',
};

describe('critical path: statement → book → reconcile → backup → second vault', () => {
  test('a bank statement imports with the right direction, category and amounts', () => {
    const res = parseTxnRows(parseDelimited(STATEMENT));
    expect(res.error).toBeUndefined();
    expect(res.rows).toHaveLength(3);

    const [salary, swiggy, dividend] = res.rows;
    expect(salary.kind).toBe('income');
    expect(salary.amount).toBe('85000.00');
    expect(swiggy.kind).toBe('expense');
    expect(guessCategory(swiggy.description, swiggy.kind)).toBe('Food');
    // A dividend credit is investment income, not "Other".
    expect(guessCategory(dividend.description, dividend.kind)).toBe('Investment');
  });

  test('re-importing the same statement adds nothing', () => {
    // Exporting an overlapping range every month is the normal workflow, so a
    // second run must be a no-op rather than doubling the book.
    const rows = parseTxnRows(parseDelimited(STATEMENT)).rows;
    const asTxns: Txn[] = rows.map((r, i) => ({
      id: `t${i}`, vaultId: 'v', profileId: 'p1', amount: r.amount,
      type: r.kind === 'transfer' ? 'expense' : r.kind,
      categoryId: 'c-other', merchant: r.description, date: r.date, createdAt: 0,
      accountId: BANK.id,
    }));
    const again = planTxnImport(rows, asTxns);
    expect(again.fresh).toHaveLength(0);
    expect(again.duplicates).toHaveLength(3);
  });

  test('imported entries post to a balanced ledger and reconcile against the bank', () => {
    const rows = parseTxnRows(parseDelimited(STATEMENT)).rows;
    const txns: Txn[] = rows.map((r, i) => ({
      id: `t${i}`, vaultId: 'v', profileId: 'p1', amount: r.amount,
      type: r.kind === 'transfer' ? 'expense' : r.kind,
      categoryId: 'c-other', merchant: r.description, date: r.date, createdAt: 0,
      accountId: BANK.id,
    }));

    // Real ledger legs: the money account is debited for income and credited
    // for a spend, with the category account taking the other side.
    const postings: Posting[] = txns.flatMap((t) => postingsForEntry({
      entryId: t.id, vaultId: 'v', amount: t.amount, type: t.type,
      moneyAccountId: BANK.id, categoryAccountId: `acct-exp-p1-${t.categoryId}`,
    }));

    // Every entry balances — the invariant the whole ledger rests on.
    const checks = runDiagnostics({
      txns, transfers: [], postings, accounts: [BANK], categories: CATEGORIES,
      holdings: [], dividends: [],
    });
    expect(checks.find((c) => c.id === 'ledger-balanced')!.level).toBe('ok');

    // 100000 + 85000 − 450.50 + 1240 = 185789.50, which is the statement's own
    // closing balance from the file. Book and bank agree once all are ticked.
    const r = reconcile({
      account: BANK,
      txns: txns.map((t) => ({ ...t, cleared: true })),
      transfers: [], postings,
      asOf: new Date(2026, 4, 31).getTime(),
      statementBalance: D('185789.50'),
      describe: (e) => ('merchant' in e ? e.merchant ?? '' : ''),
    });
    expect(r.bookBalance.toFixed(2)).toBe('185789.50');
    expect(r.reconciled).toBe(true);
  });

  test('a broker file values equities by price and deposits by accrual', () => {
    const parsed = parseHoldingsRows(parseDelimited(BROKER));
    expect(parsed.rows).toHaveLength(2);

    const plan = planImport(parsed.rows, [], {
      vaultId: 'v', newId: (() => { let n = 0; return () => `h${n++}`; })(), now: 0,
    });
    const start = new Date(2026, 2, 15).getTime();
    const holdings = plan.records.map((h) =>
      h.symbol === 'HDFC FD'
        ? { ...h, assetType: 'fd' as const, couponRatePct: '7.1', payoutFrequency: 'cumulative' as const, firstPurchaseDate: start }
        : h);

    const oneYearOn = start + 365 * 86_400_000;
    const summary = portfolioSummary(holdings, oneYearOn);
    // RELIANCE 10×2200 = 22,000. FD 100,000 compounded a year ≈ 107,291.
    expect(Math.round(summary.current.toNumber())).toBe(22000 + 107291);
    // The bug this replaced: the FD used to contribute exactly its cost forever.
    expect(summary.current.toNumber()).toBeGreaterThan(22000 + 100000);
  });

  test('a backup restores into a different vault with the same PIN', async () => {
    // v1 backups were encrypted with the vault's own key, whose salt is random
    // per install — so the right PIN on a second device always failed.
    const payload = { v: 2, data: { txn: [{ id: 't1', amount: '1500.00' }] } };

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const exportKey = await deriveKey('2001', salt);
    const file = bufToB64(new TextEncoder().encode(JSON.stringify({
      v: 2, saltB64: bufToB64(salt.buffer), enc: await encryptJson(exportKey, payload),
    })).buffer);

    // Second device: different vault, no knowledge of the first one's salt.
    const outer = JSON.parse(new TextDecoder().decode(b64ToBuf(file)));
    const importKey = await deriveKey('2001', new Uint8Array(b64ToBuf(outer.saltB64)));
    expect(await decryptJson(importKey, outer.enc)).toEqual(payload);

    // ...and the wrong PIN still cannot open it.
    await expect(decryptJson(await deriveKey('9999', new Uint8Array(b64ToBuf(outer.saltB64))), outer.enc))
      .rejects.toBeTruthy();
  });

  test('a stray space in a stored amount does not take a screen down', () => {
    // The record that killed the Dividends page: Decimal rejects "1500.00 ",
    // and the message printed "1500.00", so the space was invisible.
    expect(D('1500.00 ').toNumber()).toBe(1500);

    const checks = runDiagnostics({
      txns: [{ id: 't1', vaultId: 'v', amount: '1500.00 ', type: 'expense', categoryId: 'c-other', date: 0, createdAt: 0 }],
      transfers: [], postings: [], accounts: [], categories: CATEGORIES, holdings: [], dividends: [],
    });
    // Read correctly, and reported so it can be cleaned.
    expect(checks.find((c) => c.id === 'money-values')!.offenders).toContain('txn:t1');
  });
});
