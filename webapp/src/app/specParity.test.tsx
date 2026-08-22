// The design-spec rules that shipped unimplemented, pinned so they cannot
// silently regress. Each test names the annotation it enforces.
//
// Source: docs/design-spec/src/screens/*.js — the artboards the PDF is built
// from. The audit that produced this file compared all 28 routes; these five
// were the gaps.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@/components/Confirm';
import type { Budget, Category, Dividend, RecurringRule, Txn } from '@/lib/types';
import RecurringPage from './recurring/page';
import CalendarPage from './calendar/page';
import BudgetPage from './budget/page';
import DividendsPage from './dividends/page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

/** Recurring and Budget both open confirm dialogs, so they need the provider. */
const withConfirm = (ui: React.ReactElement) =>
  render(<ConfirmProvider>{ui}</ConfirmProvider>);

/** Typed through the store, so the empty arrays do not infer as `never[]`. */
type AppPatch = Partial<Parameters<typeof useApp.setState>[0]>;

const base: AppPatch = {
  txns: [], holdings: [], liabilities: [], accounts: [], postings: [],
  categories: [], budgets: [], goals: [], insurances: [], snapshots: [],
  recurring: [], dividends: [], fxRates: [], transfers: [],
  ghost: false, currencyCode: 'INR',
};
const seed = (over: AppPatch = {}) => useApp.setState({ ...base, ...over });

beforeEach(cleanup);

describe('Recurring — "annualised committed spend is the figure this screen exists to surface"', () => {
  const rule = (amount: string, type: 'expense' | 'income'): RecurringRule => ({
    id: `r-${amount}-${type}`, vaultId: 'v', categoryId: 'c', amount, type,
    frequency: 'monthly', nextRun: Date.now() + 86_400_000, name: 'Rule',
  } as RecurringRule);

  test('a monthly subscription is stated as its annual cost', () => {
    // The spec's own example: "A ₹649 subscription is invisible monthly and
    // ₹7,788 a year."
    seed({ recurring: [rule('649', 'expense')] });
    withConfirm(<RecurringPage />);
    expect(screen.getByText('Committed a year')).toBeInTheDocument();
    expect(screen.getByText(/7,788/)).toBeInTheDocument();
  });

  test('the same money is also offered as a ratio of recurring income', () => {
    seed({ recurring: [rule('30000', 'expense'), rule('100000', 'income')] });
    withConfirm(<RecurringPage />);
    expect(screen.getByText('Committed share')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  test('with no recurring income the share is undefined, not zero', () => {
    // A share of no income is not 0% — there is nothing to take a share of.
    seed({ recurring: [rule('30000', 'expense')] });
    withConfirm(<RecurringPage />);
    // Walk up to the StatStrip cell rather than assuming a fixed depth: the
    // label now sits inside a flex row alongside its (i) button.
    const cell = screen.getByText('Committed share').closest('.min-w-0')!;
    expect(within(cell as HTMLElement).getByText('—')).toBeInTheDocument();
  });
});

describe('Calendar — "cells carry both figures", "future days are dimmed, not hidden"', () => {
  const txn = (day: number, amount: string, type: 'income' | 'expense'): Txn => {
    const d = new Date();
    return {
      id: `t${day}${type}`, vaultId: 'v', amount, type, categoryId: 'c',
      date: new Date(d.getFullYear(), d.getMonth(), day, 12).getTime(),
      createdAt: Date.now(),
    };
  };

  test('a day with money shows the figure, not a coloured dot', () => {
    // A dot said only "something happened here", so a ₹200 coffee and a ₹2 L
    // transfer looked identical.
    seed({ txns: [txn(1, '5000', 'income'), txn(1, '1200', 'expense')] });
    const { container } = render(<CalendarPage />);
    expect(container.textContent).toMatch(/₹5\.0 K/);
    expect(container.textContent).toMatch(/₹1\.2 K/);
  });

  test('income and expense are both shown, never collapsed to a net', () => {
    // A single net per day would hide a heavy day that happened to balance.
    seed({ txns: [txn(2, '9000', 'income'), txn(2, '9000', 'expense')] });
    const { container } = render(<CalendarPage />);
    const cell = [...container.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('2'))!;
    expect(cell.textContent).toMatch(/₹9\.0 K[\s\S]*₹9\.0 K/);
  });

  test('a future day is dimmed to 42%, and still present', () => {
    seed({});
    const { container } = render(<CalendarPage />);
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (today.getDate() >= last) return; // no future day this month to assert on
    const cells = [...container.querySelectorAll('button')];
    const future = cells.find((b) => b.textContent?.startsWith(String(last)));
    expect(future).toBeTruthy();
    expect(future!.style.opacity).toBe('0.42');
  });

  test('a past day is not dimmed', () => {
    seed({});
    const { container } = render(<CalendarPage />);
    if (new Date().getDate() === 1) return; // nothing past to assert on
    const first = [...container.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('1'))!;
    expect(first.style.opacity).toBe('');
  });
});

describe('Budget — "envelope donut: spend by category against the total budgeted"', () => {
  const cat = (id: string, name: string): Category =>
    ({ id, vaultId: 'v', name, kind: 'expense' } as Category);
  const budget = (categoryId: string, limit: string): Budget =>
    ({ id: `b-${categoryId}`, vaultId: 'v', categoryId, amountLimit: limit,
      rolloverEnabled: false, alertThresholdPct: 80 } as Budget);
  const spend = (categoryId: string, amount: string): Txn => ({
    id: `t-${categoryId}`, vaultId: 'v', amount, type: 'expense', categoryId,
    date: Date.now(), createdAt: Date.now(),
  });

  test('the two readings — per-category and overall — sit on one screen', () => {
    seed({
      categories: [cat('c1', 'Food'), cat('c2', 'Travel')],
      budgets: [budget('c1', '10000'), budget('c2', '5000')],
      txns: [spend('c1', '4000'), spend('c2', '1000')],
    });
    withConfirm(<BudgetPage />);
    expect(screen.getByText('Envelopes')).toBeInTheDocument();
    // Both categories appear as slices in the donut's legend.
    const card = screen.getByText('Envelopes').closest('div')!.parentElement!;
    expect(within(card).getByText('Food')).toBeInTheDocument();
    expect(within(card).getByText('Travel')).toBeInTheDocument();
  });

  test('a category with no spend is not drawn as a zero slice', () => {
    seed({
      categories: [cat('c1', 'Food'), cat('c2', 'Travel')],
      budgets: [budget('c1', '10000'), budget('c2', '5000')],
      txns: [spend('c1', '4000')],
    });
    withConfirm(<BudgetPage />);
    const card = screen.getByText('Envelopes').closest('div')!.parentElement!;
    expect(within(card).queryByText('Travel')).not.toBeInTheDocument();
  });
});

describe('Dividends — "a forecast never borrows the success colour"', () => {
  const div = (id: string, received: boolean): Dividend => ({
    id, vaultId: 'v', symbol: 'ITC', kind: 'dividend', amount: '5000',
    payDate: Date.now(), received,
  } as Dividend);

  test('a received payout is green; an expected one is not', () => {
    // A number you might get and a number you have are not the same fact.
    seed({ dividends: [div('got', true), div('coming', false)] });
    const { container } = render(<DividendsPage />);
    const amounts = [...container.querySelectorAll('span')]
      .filter((s) => /^₹/.test(s.textContent ?? '') && s.className.includes('font-semibold'));
    const greens = amounts.filter((s) => s.className.includes('text-success'));
    expect(greens).toHaveLength(1);
    expect(amounts.length).toBeGreaterThan(greens.length);
  });
});
