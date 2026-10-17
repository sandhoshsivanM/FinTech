import { describe, expect, test } from 'vitest';
import { D } from '@/lib/money';
import type { Category, Goal, NetWorthSnapshot, Txn } from '@/lib/types';
import { forMonth } from './period';
import {
  dailySpend, goalProgress, incomeBySource, monthElapsed, monthEndSeries, monthlyFlow, paceStatus,
} from './dashboardCharts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const txn = (id: string, date: number, type: Txn['type'], amount: string, categoryId = 'c'): Txn =>
  ({ id, vaultId: 'v', amount, type, categoryId, date, createdAt: date });
const cat = (id: string, name: string): Category => ({ id, vaultId: 'v', name });
const now = at(2026, 10, 17, 21);
const oct = forMonth(now);

describe('incomeBySource', () => {
  test('groups income by category, largest first, and ignores other types and months', () => {
    const rows = incomeBySource([
      txn('a', at(2026, 10, 1), 'income', '120000', 'salary'),
      txn('b', at(2026, 10, 9), 'income', '18000', 'freelance'),
      txn('c', at(2026, 10, 12), 'income', '4000', 'dividends'),
      txn('d', at(2026, 9, 30), 'income', '999', 'salary'),
      txn('e', at(2026, 10, 3), 'expense', '500', 'salary'),
    ], [cat('salary', 'Salary'), cat('freelance', 'Freelance')], oct);
    expect(rows.map((r) => r.label)).toEqual(['Salary', 'Freelance', 'Other income']);
    expect(rows[0].amount.toString()).toBe('120000');
    expect(rows.reduce((s, r) => s + r.amount.toNumber(), 0)).toBe(142000);
  });
});

describe('monthlyFlow', () => {
  test('returns n calendar months oldest first, keeping investment apart from spending', () => {
    const rows = monthlyFlow([
      txn('a', at(2026, 10, 1), 'income', '142000'),
      txn('b', at(2026, 10, 2), 'expense', '96480'),
      txn('c', at(2026, 10, 5), 'investment', '25000'),
      txn('d', at(2026, 9, 1), 'income', '140500'),
      txn('e', at(2026, 3, 1), 'income', '1'), // before the window
    ], now, 6);
    expect(rows.map((r) => r.label)).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(rows[5].income.toString()).toBe('142000');
    expect(rows[5].expense.toString()).toBe('96480');
    expect(rows[5].invested.toString()).toBe('25000');
    expect(rows[4].income.toString()).toBe('140500');
    expect(rows[0].income.isZero()).toBe(true);
  });
});

describe('dailySpend', () => {
  test('one row per day, spending only, future days null', () => {
    const days = dailySpend([
      txn('a', at(2026, 10, 1, 9), 'expense', '32000'),
      txn('b', at(2026, 10, 1, 20), 'expense', '1200'),
      txn('c', at(2026, 10, 17), 'expense', '960'),
      txn('d', at(2026, 10, 17), 'income', '5000'),
      txn('e', at(2026, 10, 17), 'investment', '25000'),
    ], oct, now);
    expect(days).toHaveLength(31);
    expect(days[0].spent?.toString()).toBe('33200');
    expect(days[16].spent?.toString()).toBe('960');
    expect(days[1].spent?.isZero()).toBe(true);
    expect(days[17].spent).toBeNull();
  });

  test('a past month has no future days', () => {
    expect(dailySpend([], forMonth(at(2026, 9, 1)), now).every((d) => d.spent != null)).toBe(true);
  });
});

describe('monthElapsed and paceStatus', () => {
  test('share of the month gone', () => {
    expect(monthElapsed(oct, now)).toBeCloseTo(17 / 31);
    expect(monthElapsed(forMonth(at(2026, 9, 1)), now)).toBe(1);
    expect(monthElapsed(forMonth(at(2026, 11, 1)), now)).toBe(0);
  });

  test('over beats ahead, ahead needs more than the tolerance', () => {
    const e = 17 / 31;
    expect(paceStatus({ ratio: 1.24 }, e)).toBe('over');
    expect(paceStatus({ ratio: 0.83 }, e)).toBe('ahead');
    expect(paceStatus({ ratio: 0.6 }, e)).toBe('onTrack');
    expect(paceStatus({ ratio: 1 }, 1)).toBe('onTrack');
  });
});

describe('goalProgress', () => {
  const goal = (over: Partial<Goal>): Goal => ({
    id: 'g', vaultId: 'v', name: 'Goa trip', goalType: 'vacation', targetAmount: '60000', currentAmount: '42000', ...over,
  });

  test('fraction, months left and the monthly amount to finish on time', () => {
    const p = goalProgress(goal({ targetDate: at(2026, 12, 31) }), now);
    expect(p.fraction).toBeCloseTo(0.7);
    expect(p.monthsLeft).toBe(2);
    expect(p.perMonth?.toString()).toBe('9000');
  });

  test('no date means no monthly figure; a finished goal needs nothing more', () => {
    expect(goalProgress(goal({}), now).perMonth).toBeNull();
    const done = goalProgress(goal({ currentAmount: '70000', targetDate: at(2027, 1, 1) }), now);
    expect(done.fraction).toBe(1);
    expect(done.perMonth).toBeNull();
  });

  test('a target this month asks for the whole remainder now', () => {
    expect(goalProgress(goal({ targetDate: at(2026, 10, 30) }), now).perMonth?.toString()).toBe('18000');
  });
});

describe('monthEndSeries', () => {
  const snap = (date: number, netWorth: string): NetWorthSnapshot =>
    ({ id: String(date), vaultId: 'v', date, netWorth, cash: '0', investments: '0', liabilities: '0' });

  test('takes the last snapshot of each month, skips empty months and ends on the live figure', () => {
    const s = monthEndSeries([
      snap(at(2026, 8, 3), '100'), snap(at(2026, 8, 30), '110'),
      snap(at(2026, 9, 29), '130'),
      snap(at(2026, 10, 2), '999'), // this month: replaced by `current`
    ], 'netWorth', now, 6, D(150));
    expect(s.map(String)).toEqual(['110', '130', '150']);
  });
});
