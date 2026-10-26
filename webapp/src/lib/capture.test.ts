import { describe, expect, test } from 'vitest';
import type { Category, PendingCapture, Txn } from '@khazana/domain/types';
import {
  DECIDED_TTL_MS, approvalRecords, isPendingCapture, planCaptures, rejectionRecord,
  splitMessages, staleCaptureIds, suggestCategory,
} from './capture';

const NOW = new Date(2026, 9, 26, 15, 30).getTime(); // local 26 Oct 2026, 15:30
const HDFC = 'Rs.1,234.56 debited from a/c XX1234 at AMAZON on 05-Jan-2026. Avl Bal Rs.45,000.00';
const UPI = 'Rs 450.00 sent from A/c XX9876 to SWIGGY on 26-10-26. UPI Ref 123456789012';
const OTP = 'Your OTP for login is 123456. Do not share it with anyone.';

const cats: Category[] = [
  { id: 'c-shop', vaultId: 'v', name: 'Shopping' },
  { id: 'c-food', vaultId: 'v', name: 'Food' },
  { id: 'c-gift', vaultId: 'v', name: 'Gifts' },
];
const txn = (o: Partial<Txn>): Txn =>
  ({ id: 't', vaultId: 'v', amount: '1', type: 'expense', categoryId: 'c-shop', date: NOW, createdAt: NOW, ...o });

let n = 0;
const ctx = (o: Partial<Parameters<typeof planCaptures>[1]> = {}) => ({
  vaultId: 'v', now: NOW, existing: [], txns: [], categories: cats, newId: () => `cap-${++n}`, ...o,
});

describe('planCaptures', () => {
  test('a bank SMS becomes a pending draft carrying parsed values only', async () => {
    const { captures, outcomes } = await planCaptures([{ text: HDFC, source: 'sms' }], ctx());
    expect(outcomes).toEqual(['added']);
    const c = captures[0];
    expect(c).toMatchObject({
      amount: '1234.56', type: 'expense', merchant: 'amazon', status: 'pending',
      categoryId: 'c-shop', accountLast4: '1234', source: 'sms',
    });
    expect(c.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // The privacy boundary: no field holds the message.
    expect(JSON.stringify(c)).not.toMatch(/debited|Avl Bal/i);
  });

  test('a message dated another day lands at local noon of that day', async () => {
    const { captures } = await planCaptures([{ text: HDFC, source: 'sms' }], ctx());
    expect(captures[0].occurredAt).toBe(new Date(2026, 0, 5, 12).getTime());
  });

  test('a message dated today keeps its arrival time', async () => {
    const { captures } = await planCaptures([{ text: UPI, source: 'sms', receivedAt: NOW }], ctx());
    expect(captures[0].occurredAt).toBe(NOW);
  });

  test('an OTP is not a transaction and writes nothing', async () => {
    const { captures, outcomes } = await planCaptures([{ text: OTP, source: 'sms' }], ctx());
    expect(captures).toEqual([]);
    expect(outcomes).toEqual(['not_a_transaction']);
  });

  test('the same message twice in one paste is captured once', async () => {
    const { captures, outcomes } = await planCaptures(
      [{ text: HDFC, source: 'sms' }, { text: HDFC, source: 'sms' }], ctx());
    expect(captures).toHaveLength(1);
    expect(outcomes).toEqual(['added', 'duplicate']);
  });

  test('a rejected message does not come back', async () => {
    const first = await planCaptures([{ text: HDFC, source: 'sms' }], ctx());
    const rejected = rejectionRecord(first.captures[0], NOW);
    const again = await planCaptures([{ text: HDFC, source: 'sms' }], ctx({ existing: [rejected] }));
    expect(again.outcomes).toEqual(['duplicate']);
  });

  test('a spend already in the ledger is queued but flagged', async () => {
    const recorded = txn({ amount: '450', date: NOW - 60_000 });
    const { captures } = await planCaptures([{ text: UPI, source: 'sms' }], ctx({ txns: [recorded] }));
    expect(captures[0].reasons).toContain('possible_duplicate');
  });
});

describe('suggestCategory', () => {
  test('the category this merchant was filed under last time wins over the keyword guess', () => {
    const txns = [
      txn({ merchant: 'Amazon', categoryId: 'c-shop', date: 1 }),
      txn({ merchant: 'amazon', categoryId: 'c-gift', date: 2 }),
    ];
    expect(suggestCategory('amazon', 'expense', txns, cats)).toBe('c-gift');
  });

  test('falls back to the keyword guess, then to nothing', () => {
    expect(suggestCategory('swiggy', 'expense', [], cats)).toBe('c-food');
    expect(suggestCategory('ravi kumar', 'expense', [], cats)).toBeNull();
  });

  test('ignores a past category that has since been deleted', () => {
    const txns = [txn({ merchant: 'amazon', categoryId: 'gone' })];
    expect(suggestCategory('amazon', 'expense', txns, cats)).toBe('c-shop');
  });
});

describe('approvalRecords', () => {
  const pending = async () => (await planCaptures([{ text: HDFC, source: 'sms' }], ctx())).captures[0];

  test('approving as captured writes the transaction and links it', async () => {
    const c = await pending();
    const { txn: t, capture } = approvalRecords(c, {}, { now: NOW, txnId: 'tx1' });
    expect(t).toMatchObject({ id: 'tx1', amount: '1234.56', type: 'expense', categoryId: 'c-shop', merchant: 'amazon' });
    expect(capture).toMatchObject({ status: 'approved', postedTxnId: 'tx1', decidedAt: NOW, finalAmount: null });
    expect(isPendingCapture(capture)).toBe(false);
  });

  test('a corrected amount is edited_approved and keeps the parsed figure', async () => {
    const c = await pending();
    const { txn: t, capture } = approvalRecords(c, { amount: '1200' }, { now: NOW, txnId: 'tx1' });
    expect(t.amount).toBe('1200');
    expect(capture).toMatchObject({ status: 'edited_approved', amount: '1234.56', finalAmount: '1200' });
  });

  test('choosing a different category is not an edit', async () => {
    const c = await pending();
    expect(approvalRecords(c, { categoryId: 'c-gift' }, { now: NOW, txnId: 'x' }).capture.status).toBe('approved');
  });

  test('refuses without a category, and refuses a zero amount', async () => {
    const c = { ...(await pending()), categoryId: null };
    expect(() => approvalRecords(c, {}, { now: NOW, txnId: 'x' })).toThrow(/category/);
    expect(() => approvalRecords(c, { categoryId: 'c-shop', amount: '0' }, { now: NOW, txnId: 'x' })).toThrow(/amount/);
  });
});

describe('housekeeping', () => {
  test('splitMessages separates pasted alerts on blank lines', () => {
    expect(splitMessages(`${HDFC}\n\n  \n${UPI}\n`)).toEqual([HDFC, UPI]);
    expect(splitMessages('line one\nline two')).toEqual(['line one\nline two']);
  });

  test('decided captures expire after the dedup window; pending ones never do', () => {
    const base = { vaultId: 'v', amount: '1', type: 'expense', occurredAt: 0, source: 'sms', uncategorized: false, fingerprint: 'f', capturedAt: 0 } as const;
    const old: PendingCapture = { ...base, id: 'old', status: 'rejected', decidedAt: NOW - DECIDED_TTL_MS - 1 };
    const recent: PendingCapture = { ...base, id: 'recent', status: 'approved', decidedAt: NOW - 1000 };
    const waiting: PendingCapture = { ...base, id: 'waiting' };
    expect(staleCaptureIds([old, recent, waiting], NOW)).toEqual(['old']);
  });
});
