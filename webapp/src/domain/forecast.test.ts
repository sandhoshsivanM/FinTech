/**
 * The intelligence layer (§9).
 *
 * The contract these tests defend: every figure is derived from records that
 * exist, and when an input is missing the answer is "not enough data" rather
 * than a plausible-looking number. A fabricated spending allowance is worse
 * than none, because it will be spent against.
 */
import { describe, expect, test } from 'vitest';
import { D, ZERO } from '@/lib/money';
import {
  cashFlowForecast, committedBefore, monthlyReview, netWorthProjection, safeToSpend, whatIf,
} from './forecast';
import type { Liability, RecurringRule, Txn } from '@/lib/types';

const NOW = new Date(2026, 7, 9, 12, 0).getTime(); // 9 Aug 2026, 22 days left
const DAY = 86_400_000;

let seq = 0;
const txn = (amount: string, type: Txn['type'], date: number, categoryId = 'c-food'): Txn => ({
  id: `t${seq++}`, vaultId: 'v', amount, type, categoryId, date, createdAt: date,
});

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: `r${seq++}`, vaultId: 'v', amount: '1000', type: 'expense', categoryId: 'c-bills',
  frequency: 'monthly', nextRun: NOW + 5 * DAY, merchant: 'Broadband', ...over,
} as RecurringRule);

/** Three completed months of salary, so history-based rules have something. */
const salaryHistory = (): Txn[] => [
  txn('100000', 'income', new Date(2026, 4, 5).getTime(), 'c-salary'),
  txn('100000', 'income', new Date(2026, 5, 5).getTime(), 'c-salary'),
  txn('100000', 'income', new Date(2026, 6, 5).getTime(), 'c-salary'),
];

describe('safe-to-spend refuses to invent a number', () => {
  test('with no recorded income it reports the gap, not a figure', () => {
    const r = safeToSpend([], [], D('50000'), null, NOW);
    expect(r.perDay).toBeNull();
    expect(r.gap).toBe('no-income');
  });

  test('on the last day it offers one day, never divides by zero', () => {
    const endOfMonth = new Date(2026, 7, 31, 23, 59).getTime();
    const r = safeToSpend(salaryHistory(), [], D('50000'), null, endOfMonth);
    expect(r.inputs.daysRemaining).toBe(1);
    expect(r.perDay!.toString()).toBe('50000');
  });

  test('it always returns the inputs it used, answer or not', () => {
    // §9: the screen must be able to show the calculation, not just its result.
    const r = safeToSpend([], [], D('50000'), null, NOW);
    expect(r.inputs.availableCash.toString()).toBe('50000');
    expect(r.inputs.daysRemaining).toBeGreaterThan(0);
    expect(r.inputs.period.label).toContain('August 2026');
  });
});

describe('safe-to-spend arithmetic', () => {
  test('committed obligations are subtracted before anything is offered', () => {
    const r = safeToSpend(salaryHistory(), [rule({ amount: '8000' })], D('30000'), null, NOW);
    expect(r.inputs.committed.toString()).toBe('8000');
    expect(r.total!.toString()).toBe('22000');
  });

  test('the budget is a ceiling when it is tighter than the cash', () => {
    const r = safeToSpend(salaryHistory(), [], D('50000'), D('9000'), NOW);
    expect(r.total!.toString()).toBe('9000');
  });

  test('the cash is the ceiling when it is tighter than the budget', () => {
    // Never offer money that is not there, however generous the budget.
    const r = safeToSpend(salaryHistory(), [], D('4000'), D('40000'), NOW);
    expect(r.total!.toString()).toBe('4000');
  });

  test('an overspent position offers zero, never a negative allowance', () => {
    const r = safeToSpend(salaryHistory(), [rule({ amount: '60000' })], D('10000'), null, NOW);
    expect(r.total!.toString()).toBe('0');
    expect(r.perDay!.toString()).toBe('0');
  });

  test('income rules are not counted as commitments', () => {
    expect(committedBefore([rule({ type: 'income', amount: '99999' })], NOW + 30 * DAY, NOW).toString())
      .toBe('0');
  });
});

describe('cash-flow forecast', () => {
  test('with under two completed months it declines to estimate spending', () => {
    const f = cashFlowForecast([], [], D('10000'), NOW);
    expect(f.monthlyDiscretionary).toBeNull();
    expect(f.basedOnMonths).toBeLessThan(2);
  });

  test('it uses the median of completed months, so one outlier cannot skew it', () => {
    const history = [
      txn('5000', 'expense', new Date(2026, 4, 10).getTime()),
      txn('5000', 'expense', new Date(2026, 5, 10).getTime()),
      txn('500000', 'expense', new Date(2026, 6, 10).getTime()), // a house deposit
    ];
    const f = cashFlowForecast(history, [], D('10000'), NOW);
    expect(f.monthlyDiscretionary!.toString()).toBe('5000');
  });

  test('the current, partial month is excluded from the history', () => {
    // Averaging it in makes spending look lower every time you check early.
    const f = cashFlowForecast([txn('90000', 'expense', NOW - DAY)], [], D('10000'), NOW);
    expect(f.monthlyDiscretionary).toBeNull();
  });

  test('scheduled income and expense flow into the projected balance', () => {
    const f = cashFlowForecast(
      [],
      [rule({ type: 'income', amount: '50000', nextRun: new Date(2026, 8, 1).getTime() }),
        rule({ type: 'expense', amount: '20000', nextRun: new Date(2026, 8, 5).getTime() })],
      D('10000'), NOW, 1,
    );
    expect(f.months[0].scheduledIncome.toString()).toBe('50000');
    expect(f.months[0].scheduledExpense.toString()).toBe('20000');
    expect(f.months[0].closingCash.toString()).toBe('40000');
  });

  test('a month projected below zero is flagged', () => {
    const f = cashFlowForecast(
      [], [rule({ amount: '50000', nextRun: new Date(2026, 8, 5).getTime() })], D('10000'), NOW, 1,
    );
    expect(f.months[0].shortfall).toBe(true);
  });

  test('it projects the number of months asked for', () => {
    expect(cashFlowForecast([], [], D('0'), NOW, 6).months).toHaveLength(6);
  });
});

describe('monthly review', () => {
  test('it compares like for like, not a part month against a whole one', () => {
    // On the 9th, only the first 9 days of July may be compared, or the review
    // congratulates you every month for spending less than a full month.
    const july = [
      txn('1000', 'expense', new Date(2026, 6, 3).getTime()),
      txn('9000', 'expense', new Date(2026, 6, 25).getTime()), // outside the window
    ];
    const august = [txn('1200', 'expense', new Date(2026, 7, 3).getTime())];
    const r = monthlyReview([...july, ...august], NOW);
    const spending = r.changes.find((c) => c.key === 'expense')!;
    expect(spending.previous.toString()).toBe('1000');
    expect(spending.current.toString()).toBe('1200');
  });

  test('a zero baseline reports no percentage rather than infinity', () => {
    const r = monthlyReview([txn('500', 'expense', new Date(2026, 7, 2).getTime())], NOW);
    expect(r.changes.find((c) => c.key === 'expense')!.changePct).toBeNull();
  });

  test('it names the categories that moved, biggest first', () => {
    const r = monthlyReview([
      txn('200', 'expense', new Date(2026, 6, 2).getTime(), 'c-food'),
      txn('5000', 'expense', new Date(2026, 7, 2).getTime(), 'c-food'),
      txn('100', 'expense', new Date(2026, 7, 2).getTime(), 'c-transport'),
    ], NOW);
    expect(r.categoryMoves[0].categoryId).toBe('c-food');
    expect(r.categoryMoves[0].delta.toString()).toBe('4800');
  });

  test('investing is tracked separately from spending', () => {
    const r = monthlyReview([
      { ...txn('10000', 'expense', new Date(2026, 7, 2).getTime()), type: 'investment' } as Txn,
    ], NOW);
    expect(r.changes.find((c) => c.key === 'expense')!.current.toString()).toBe('0');
    expect(r.changes.find((c) => c.key === 'invested')!.current.toString()).toBe('10000');
  });
});

describe('net-worth projection is a projection, not a prediction', () => {
  test('it returns the assumptions it used', () => {
    const p = netWorthProjection([], D('100000'), D('50000'), NOW, 12);
    expect(p.growthPct).toBe(8);
    expect(p.points).toHaveLength(12);
    expect(typeof p.basedOnMonths).toBe('number');
  });

  test('with no history it assumes no surplus rather than inventing one', () => {
    const p = netWorthProjection([], D('100000'), ZERO, NOW, 1);
    expect(p.monthlySurplus.toString()).toBe('0');
    expect(p.points[0].value.toString()).toBe('100000');
  });

  test('growth applies only to invested assets, because cash does not compound', () => {
    const noInvestments = netWorthProjection([], D('100000'), ZERO, NOW, 1);
    const withInvestments = netWorthProjection([], D('100000'), D('100000'), NOW, 1);
    expect(noInvestments.points[0].value.toString()).toBe('100000');
    expect(withInvestments.points[0].value.gt(D('100000'))).toBe(true);
  });

  test('a surplus derived from history compounds forward', () => {
    const history = [
      ...salaryHistory(),
      txn('40000', 'expense', new Date(2026, 5, 10).getTime()),
      txn('40000', 'expense', new Date(2026, 6, 10).getTime()),
    ];
    const p = netWorthProjection(history, D('0'), ZERO, NOW, 2);
    expect(p.monthlySurplus.gt(0)).toBe(true);
    expect(p.points[1].value.gt(p.points[0].value)).toBe(true);
  });
});

describe('what-if', () => {
  const loan: Liability = {
    id: 'l1', vaultId: 'v', name: 'Car loan', kind: 'loan',
    principal: '300000', aprPct: '10', termMonths: 36,
  };

  test('paying more clears the debt sooner', () => {
    const base = whatIf([loan], [], D('0'), ZERO, ZERO, NOW);
    const faster = whatIf([loan], [], D('0'), ZERO, D('10000'), NOW);
    expect(faster.debtFreeMonths!).toBeLessThan(base.debtFreeMonths!);
  });

  test('paying more costs less interest', () => {
    const base = whatIf([loan], [], D('0'), ZERO, ZERO, NOW);
    const faster = whatIf([loan], [], D('0'), ZERO, D('10000'), NOW);
    expect(faster.totalInterest.lt(base.totalInterest)).toBe(true);
  });

  test('a debt that cannot be cleared inside the horizon reports null, not a guess', () => {
    const huge: Liability = { ...loan, principal: '50000000', aprPct: '18', termMonths: null };
    expect(whatIf([huge], [], D('0'), ZERO, ZERO, NOW, 12).debtFreeMonths).toBeNull();
  });

  test('no liabilities means debt-free immediately', () => {
    expect(whatIf([], [], D('0'), ZERO, ZERO, NOW).debtFreeMonths).toBe(1);
  });
});
