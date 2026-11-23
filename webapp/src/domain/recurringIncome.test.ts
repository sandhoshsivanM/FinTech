import { describe, expect, test } from 'vitest';
import type { Txn } from '@khazana/domain/types';
import { detectRecurringIncome, recurringIncomeById } from '@khazana/domain/recurringIncome';

// The twin of test/unit/recurring_income_test.dart.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const txn = (id: string, date: number, amount: string, merchant: string | null, type: Txn['type'] = 'income'): Txn =>
  ({ id, vaultId: 'v', amount, type, categoryId: 'c', date, createdAt: date, merchant });

describe('detectRecurringIncome', () => {
  test('a monthly salary is found, with its typical amount and day', () => {
    const found = detectRecurringIncome([
      txn('a', at(2026, 8, 1, 9), '85000', 'ACME TECH PVT LTD SALARY AUG26'),
      txn('b', at(2026, 9, 1, 9), '85000', 'Acme Tech Pvt Ltd Salary Sep26'),
      txn('c', at(2026, 10, 2, 9), '86500', 'acme tech pvt ltd salary oct26'),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('salary');
    expect(found[0].payerKey).toBe('acme tech pvt ltd salary');
    expect(found[0].typicalAmount.toString()).toBe('85000');
    expect(found[0].expectedDay).toBe(1);
    expect([...found[0].txnIds].sort()).toEqual(['a', 'b', 'c']);
  });

  test('one missed month still counts', () => {
    const found = detectRecurringIncome([
      txn('a', at(2026, 6, 5), '20000', 'rent from tenant'),
      txn('b', at(2026, 7, 5), '20000', 'rent from tenant'),
      txn('c', at(2026, 9, 5), '20000', 'rent from tenant'),
    ]);
    expect(found[0].kind).toBe('regular');
    expect(found[0].txnIds.size).toBe(3);
  });

  test('a three-month gap breaks the pattern', () => {
    expect(detectRecurringIncome([
      txn('a', at(2026, 3, 5), '20000', 'tenant'),
      txn('b', at(2026, 4, 5), '20000', 'tenant'),
      txn('c', at(2026, 7, 5), '20000', 'tenant'),
    ])).toEqual([]);
  });

  test('freelance income that varies is not regular', () => {
    expect(detectRecurringIncome([
      txn('a', at(2026, 8, 10), '12000', 'client co'),
      txn('b', at(2026, 9, 10), '30000', 'client co'),
      txn('c', at(2026, 10, 10), '7000', 'client co'),
    ])).toEqual([]);
  });

  test('a one-off bonus from the same payer is left out of the pattern', () => {
    const found = detectRecurringIncome([
      txn('a', at(2026, 8, 1), '85000', 'acme salary'),
      txn('b', at(2026, 9, 1), '85000', 'acme salary'),
      txn('bonus', at(2026, 9, 20), '150000', 'acme salary'),
      txn('c', at(2026, 10, 1), '85000', 'acme salary'),
    ]);
    expect([...found[0].txnIds].sort()).toEqual(['a', 'b', 'c']);
  });

  test('refunds, spending and unnamed credits are ignored', () => {
    expect(detectRecurringIncome([
      txn('r', at(2026, 9, 3), '499', 'amazon'),
      txn('s1', at(2026, 8, 1), '799', 'netflix', 'expense'),
      txn('s2', at(2026, 9, 1), '799', 'netflix', 'expense'),
      txn('s3', at(2026, 10, 1), '799', 'netflix', 'expense'),
      txn('n1', at(2026, 8, 1), '500', null),
      txn('n2', at(2026, 9, 1), '500', ''),
      txn('n3', at(2026, 10, 1), '500', '2026'),
    ])).toEqual([]);
  });

  test('ids map to their kind for the ledger chip', () => {
    const byId = recurringIncomeById(detectRecurringIncome([
      txn('a', at(2026, 8, 1), '100', 'pension'),
      txn('b', at(2026, 9, 1), '100', 'pension'),
      txn('c', at(2026, 10, 1), '100', 'pension'),
    ]));
    expect(Object.fromEntries(byId)).toEqual({ a: 'regular', b: 'regular', c: 'regular' });
  });
});
