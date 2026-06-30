import { describe, test, expect } from 'vitest';
import { aggregateByDay } from './calendarLedger';
import type { Txn, TxnType } from '@/lib/types';

// Parity fixtures shared with test/unit/calendar_aggregator_test.dart. Times are
// pinned to local noon so day keys are deterministic across engines.
const txn = (
  id: string, amount: string, type: TxnType, date: number, attach?: string,
): Txn => ({
  id, vaultId: 'v', amount, type, categoryId: 'c', date, createdAt: date,
  attachmentRef: attach ?? null,
});

const D10 = new Date(2026, 5, 10, 12).getTime();
const D11 = new Date(2026, 5, 11, 12).getTime();

describe('calendarLedger', () => {
  test('groups by local day, sums income/expense, keeps net as Decimal', () => {
    const m = aggregateByDay([
      txn('a', '100', 'expense', D10, 'r1'),
      txn('b', '500', 'income', D10),
      txn('c', '50', 'expense', D11),
    ]);

    expect(m.size).toBe(2);
    expect([...m.keys()]).toEqual(['2026-06-10', '2026-06-11']);

    const day10 = m.get('2026-06-10')!;
    expect(day10.income.toString()).toBe('500');
    expect(day10.expense.toString()).toBe('100');
    expect(day10.net.toString()).toBe('400');
    expect(day10.txnIds).toEqual(['a', 'b']);
    expect(day10.hasAttachment).toBe(true);

    const day11 = m.get('2026-06-11')!;
    expect(day11.income.toString()).toBe('0');
    expect(day11.net.toString()).toBe('-50');
    expect(day11.hasAttachment).toBe(false);
  });

  test('empty input → empty map', () => {
    expect(aggregateByDay([]).size).toBe(0);
  });
});
