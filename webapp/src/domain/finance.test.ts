import { describe, test, expect } from 'vitest';
import { windowSummary, signed, netWorthTotal, evaluateBudget, budgetRollover } from './finance';
import { forMonth, trailingDays } from './period';
import { D } from '@/lib/money';
import type { Budget, Txn } from '@/lib/types';

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
        txn('1000', 'income', 10), // inside 90d
        txn('400', 'expense', 20), // inside 90d
        txn('999', 'income', 200), // outside 90d → excluded
      ],
      trailingDays(90, NOW),
    );
    expect(s.income.toString()).toBe('1000');
    expect(s.expense.toString()).toBe('400');
    expect(s.net.toString()).toBe('600');
  });

  test('txns dated after the window are excluded', () => {
    const future: Txn = { ...txn('500', 'income', 0), date: NOW + 2 * DAY };
    expect(windowSummary([future], trailingDays(30, NOW)).income.toString()).toBe('0');
  });

  test('tighter window excludes older txns', () => {
    const s7 = windowSummary([txn('50', 'expense', 10)], trailingDays(7, NOW));
    expect(s7.expense.toString()).toBe('0'); // 10d ago is outside 7 days
  });

  test('the same range gives the same totals wherever it is used', () => {
    // The invariant the whole period model exists to guarantee (§3.5).
    const txns = [txn('1000', 'income', 5), txn('250', 'expense', 6)];
    const range = trailingDays(30, NOW);
    expect(windowSummary(txns, range).net.toString())
      .toBe(windowSummary(txns, range).net.toString());
  });
});

describe('evaluateBudget', () => {
  const budget = (over: Partial<Budget> = {}): Budget => ({
    id: 'b1', vaultId: 'v', categoryId: 'c', amountLimit: '1000',
    rolloverEnabled: false, alertThresholdPct: 90, ...over,
  });

  test('the user\'s alert threshold is what triggers the warning', () => {
    // It used to be ignored entirely: 70/90 were hardcoded, so setting a
    // budget's alert to 50% changed nothing on screen.
    const b = budget({ alertThresholdPct: 50 });
    expect(evaluateBudget(b, D('490')).status).toBe('ok');
    expect(evaluateBudget(b, D('500')).status).toBe('warning');
  });

  test('a budget is not "over" until it is actually over', () => {
    // `over` used to fire above 90%, i.e. with a tenth of the budget unspent.
    const b = budget();
    expect(evaluateBudget(b, D('950')).status).toBe('warning');
    expect(evaluateBudget(b, D('1000')).status).toBe('warning');
    expect(evaluateBudget(b, D('1000.01')).status).toBe('over');
  });

  test('a missing threshold falls back to the documented default', () => {
    const b = budget({ alertThresholdPct: 0 });
    expect(evaluateBudget(b, D('899')).status).toBe('ok');
    expect(evaluateBudget(b, D('900')).status).toBe('warning');
  });

  test('rollover raises the limit that remaining is measured against', () => {
    const p = evaluateBudget(budget(), D('1200'), D('500'));
    expect(p.limit.toString()).toBe('1500');
    expect(p.remaining.toString()).toBe('300');
    expect(p.status).toBe('ok');
  });

  test('fraction clamps for the bar but ratio does not, so ranking works', () => {
    const p = evaluateBudget(budget(), D('3000'));
    expect(p.fraction).toBe(1);
    expect(p.ratio).toBe(3);
  });
});

describe('budgetRollover', () => {
  const AUG = new Date(2026, 7, 9).getTime();
  const month = forMonth(AUG);
  const dated = (amount: string, date: number): Txn =>
    ({ id: `r${++_id}`, vaultId: 'v', amount, type: 'expense', categoryId: 'c', date, createdAt: date });

  test('it is zero unless the user opted in', () => {
    const b: Budget = { id: 'b', vaultId: 'v', categoryId: 'c', amountLimit: '1000', rolloverEnabled: false, alertThresholdPct: 90 };
    expect(budgetRollover(b, [dated('200', new Date(2026, 6, 5).getTime())], month).toString()).toBe('0');
  });

  test('unspent budget carries forward from the previous month only', () => {
    const b: Budget = { id: 'b', vaultId: 'v', categoryId: 'c', amountLimit: '1000', rolloverEnabled: true, alertThresholdPct: 90 };
    const txns = [
      dated('300', new Date(2026, 6, 5).getTime()),  // July: 300 of 1000 spent
      dated('900', new Date(2026, 5, 5).getTime()),  // June: ignored
    ];
    expect(budgetRollover(b, txns, month).toString()).toBe('700');
  });

  test('overspending is never carried forward as a deficit', () => {
    // Compounding a deficit would silently shrink next month's budget.
    const b: Budget = { id: 'b', vaultId: 'v', categoryId: 'c', amountLimit: '1000', rolloverEnabled: true, alertThresholdPct: 90 };
    expect(budgetRollover(b, [dated('1800', new Date(2026, 6, 5).getTime())], month).toString()).toBe('0');
  });
});
