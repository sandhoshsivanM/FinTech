import { describe, expect, test } from 'vitest';
import type { NetWorthSnapshot, Txn } from '@khazana/domain/types';
import { custom, forMonth } from '@khazana/domain/period';
import { changeStats, lastWeeks, portfolioSkyline, spendSkyline, spendStats } from '@khazana/domain/skyline';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const txn = (id: string, date: number, type: Txn['type'], amount: string): Txn =>
  ({ id, vaultId: 'v', amount, type, categoryId: 'c', date, createdAt: date });
const snap = (date: number, investments: string): NetWorthSnapshot =>
  ({ id: String(date), vaultId: 'v', date, netWorth: '0', cash: '0', investments, liabilities: '0' });
const today = at(2026, 11, 25); // a Wednesday

describe('lastWeeks', () => {
  test('ends on the Saturday of this week and starts on a Sunday', () => {
    const r = lastWeeks(today, 26);
    expect(new Date(r.start).getDay()).toBe(0);
    expect(new Date(r.end).getDay()).toBe(6);
    expect(new Date(r.end).getDate()).toBe(28);
    expect(Math.round((r.end + 1 - r.start) / 86_400_000)).toBe(26 * 7);
  });
});

describe('spendSkyline', () => {
  test('whole weeks, Sunday first; spending only; days to come are null', () => {
    const sky = spendSkyline([
      txn('a', at(2026, 11, 1, 9), 'expense', '18000'),
      txn('b', at(2026, 11, 1, 20), 'expense', '250.50'),
      txn('c', at(2026, 11, 2), 'income', '90000'),
      txn('d', at(2026, 11, 3), 'investment', '5000'),
      txn('e', at(2026, 11, 26), 'expense', '99'), // tomorrow
    ], lastWeeks(today, 4), today);
    expect(sky.weeks).toBe(4);
    expect(sky.cells).toHaveLength(28);
    const nov1 = sky.cells.find((c) => c.day === at(2026, 11, 1, 0))!;
    expect(nov1.weekday).toBe(0);
    expect(nov1.amount?.toString()).toBe('18250.5');
    expect(nov1.count).toBe(2);
    expect(sky.cells.find((c) => c.day === at(2026, 11, 2, 0))!.amount?.isZero()).toBe(true);
    expect(sky.cells.find((c) => c.day === at(2026, 11, 26, 0))!.amount).toBeNull();
  });

  test('a month that starts mid-week pads to whole weeks with nulls', () => {
    const feb = forMonth(at(2028, 2, 10)); // leap year; 1 Feb 2028 is a Tuesday
    const sky = spendSkyline([txn('a', at(2028, 2, 29), 'expense', '10')], feb, at(2028, 3, 15));
    const live = sky.cells.filter((c) => c.amount != null);
    expect(live).toHaveLength(29);
    expect(sky.cells[0].amount).toBeNull(); // Sunday 30 Jan
    expect(sky.cells.find((c) => c.day === at(2028, 2, 29, 0))!.amount?.toString()).toBe('10');
  });

  test('stats reconcile with the cells', () => {
    const sky = spendSkyline([
      txn('a', at(2026, 11, 20), 'expense', '100'),
      txn('b', at(2026, 11, 23), 'expense', '300'),
    ], custom(at(2026, 11, 19), at(2026, 11, 25)), today);
    const s = spendStats(sky);
    expect(s.total.toString()).toBe('400');
    expect(s.pastDays).toBe(7);
    expect(s.quietDays).toBe(5);
    expect(s.longestQuiet).toBe(2); // 21–22 Nov, and 24–25 Nov
    expect(s.busiest?.day).toBe(at(2026, 11, 23, 0));
  });
});

describe('portfolioSkyline', () => {
  test('change is measured from the previous reading, with the day it was taken', () => {
    const sky = portfolioSkyline([
      snap(at(2026, 11, 18, 9), '100000'),
      snap(at(2026, 11, 20, 9), '101500'),
      snap(at(2026, 11, 20, 21), '101000'), // later reading that day wins
      snap(at(2026, 11, 21, 9), '99000'),
    ], custom(at(2026, 11, 19), at(2026, 11, 25)), today);
    const day = (d: number) => sky.cells.find((c) => c.day === at(2026, 11, d, 0))!;
    expect(day(19).amount).toBeNull();
    expect(day(20).amount?.toString()).toBe('1000');
    expect(day(20).since).toBe(at(2026, 11, 18, 0));
    expect(day(21).amount?.toString()).toBe('-2000');
    const s = changeStats(sky);
    expect(s.net.toString()).toBe('-1000');
    expect(s.upDays).toBe(1);
    expect(s.downDays).toBe(1);
    expect(s.worst?.day).toBe(at(2026, 11, 21, 0));
  });
});
