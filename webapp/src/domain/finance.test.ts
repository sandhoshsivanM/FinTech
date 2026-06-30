import { describe, test, expect } from 'vitest';
import { windowSummary, signed, netWorthTotal } from './finance';
import type { Txn } from '@/lib/types';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
let _id = 0;
const txn = (amount: string, type: 'income' | 'expense', daysAgo: number): Txn => ({
  id: `t${++_id}`, vaultId: 'v', amount, type, categoryId: 'c',
  date: NOW - daysAgo * DAY, createdAt: NOW,
});

describe('signed', () => {
  test('income is positive, expense negative', () => {
    expect(signed(txn('100', 'income', 0)).toString()).toBe('100');
    expect(signed(txn('100', 'expense', 0)).toString()).toBe('-100');
  });
});

describe('netWorthTotal', () => {
  test('sum of signed amounts across all txns', () => {
    const total = netWorthTotal([
      txn('1000', 'income', 1),
      txn('300', 'expense', 2),
      txn('200', 'expense', 3),
    ]);
    expect(total.toString()).toBe('500');
  });
});

describe('windowSummary', () => {
  test('only counts txns inside the window', () => {
    const s = windowSummary(
      [
        txn('1000', 'income', 10), // inside 3M
        txn('400', 'expense', 20), // inside 3M
        txn('999', 'income', 200), // outside 3M (90d) → excluded
      ],
      '3M',
      NOW,
    );
    expect(s.income.toString()).toBe('1000');
    expect(s.expense.toString()).toBe('400');
    expect(s.net.toString()).toBe('600');
  });

  test('future-dated txns are excluded', () => {
    const future: Txn = { ...txn('500', 'income', 0), date: NOW + DAY };
    const s = windowSummary([future], '1M', NOW);
    expect(s.income.toString()).toBe('0');
  });

  test('tighter window excludes older txns', () => {
    const s7 = windowSummary([txn('50', 'expense', 10)], '7D', NOW);
    expect(s7.expense.toString()).toBe('0'); // 10d ago is outside 7D
  });
});
