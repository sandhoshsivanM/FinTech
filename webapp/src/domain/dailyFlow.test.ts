import { describe, expect, test } from 'vitest';
import type { Txn } from '@/lib/types';
import { dailyFlow } from './dailyFlow';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const txn = (id: string, date: number, type: Txn['type'], amount: string): Txn =>
  ({ id, vaultId: 'v', amount, type, categoryId: 'c', date, createdAt: date });

describe('dailyFlow', () => {
  const now = at(2026, 10, 13, 15);

  test('returns seven local days, oldest first, ending today', () => {
    const days = dailyFlow([], now);
    expect(days).toHaveLength(7);
    expect(days[0].day).toBe(new Date(2026, 9, 7).getTime());
    expect(days[6].day).toBe(new Date(2026, 9, 13).getTime());
  });

  test('sums income and spending into the right day', () => {
    const days = dailyFlow([
      txn('a', at(2026, 10, 13, 9), 'expense', '120'),
      txn('b', at(2026, 10, 13, 20), 'expense', '450.50'),
      txn('c', at(2026, 10, 12, 10), 'income', '90000'),
    ], now);
    expect(days[6].expense.toString()).toBe('570.5');
    expect(days[6].income.toString()).toBe('0');
    expect(days[5].income.toString()).toBe('90000');
  });

  test('an investment is neither income nor spending', () => {
    const days = dailyFlow([txn('i', at(2026, 10, 13), 'investment', '5000')], now);
    expect(days[6].income.isZero() && days[6].expense.isZero()).toBe(true);
  });

  test('a midnight-adjacent transaction stays on its own local day', () => {
    const days = dailyFlow([
      txn('late', new Date(2026, 9, 12, 23, 59).getTime(), 'expense', '10'),
      txn('early', new Date(2026, 9, 13, 0, 1).getTime(), 'expense', '20'),
    ], now);
    expect(days[5].expense.toString()).toBe('10');
    expect(days[6].expense.toString()).toBe('20');
  });

  test('older than the window is left out', () => {
    const days = dailyFlow([txn('old', at(2026, 10, 6), 'expense', '999')], now);
    expect(days.every((d) => d.expense.isZero())).toBe(true);
  });
});

import Decimal from 'decimal.js';
import { describeChange } from './dailyFlow';

describe('describeChange', () => {
  const d = (n: number) => new Decimal(n);
  test('a percentage up to double', () => {
    expect(describeChange(d(118), d(100))).toEqual({ up: true, text: '18%' });
    expect(describeChange(d(82), d(100))).toEqual({ up: false, text: '18%' });
  });
  test('a multiple beyond double, so 5145% reads as 52×', () => {
    expect(describeChange(d(187769), d(3580))).toEqual({ up: true, text: '52×' });
    expect(describeChange(d(250), d(100))).toEqual({ up: true, text: '2.5×' });
  });
  test('nothing to compare against', () => {
    expect(describeChange(d(10), d(0))).toBeNull();
  });
});
