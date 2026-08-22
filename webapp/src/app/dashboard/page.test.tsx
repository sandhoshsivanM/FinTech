// The dashboard's honesty rules, all three of which were live defects.
//
// 1. An empty vault rendered ₹0.00 as net worth. Zero is a real answer — it is
//    what someone with a settled loan genuinely has — so it must not also be
//    what "you have not told us anything yet" looks like.
// 2. Liabilities were subtracted from the headline and left out of the
//    breakdown under it, so the parts did not add up to the whole.
// 3. The terms were never defined anywhere in the app.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import type { Holding, Liability, Txn } from '@/lib/types';
import DashboardPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const txn = (amount: string, type: 'income' | 'expense'): Txn => ({
  id: `t-${amount}-${type}`, vaultId: 'v', amount, type, categoryId: 'c',
  date: Date.now() - 2 * 86_400_000, createdAt: Date.now(),
});

const hold = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1', vaultId: 'v', symbol: 'ITC', exchange: 'NSE',
  quantity: '100', avgCost: '400', lastPrice: '450', assetType: 'equity_etf', ...over,
} as Holding);

const loan = (principal: string): Liability => ({
  id: 'l1', vaultId: 'v', name: 'Car loan', kind: 'loan', principal, aprPct: '9',
});

function seed(over: Partial<Parameters<typeof useApp.setState>[0]> = {}) {
  useApp.setState({
    txns: [], holdings: [], liabilities: [], accounts: [], postings: [],
    categories: [], budgets: [], goals: [], insurances: [], snapshots: [],
    recurring: [], dividends: [], fxRates: [],
    ghost: false, currencyCode: 'INR',
    ...over,
  });
}

beforeEach(cleanup);

describe('an empty vault', () => {
  test('offers somewhere to start instead of a total of zero', () => {
    seed();
    render(<DashboardPage />);
    expect(screen.getByText('Start here')).toBeInTheDocument();
    expect(screen.getByText('Add an account')).toBeInTheDocument();
    expect(screen.getByText('Add a holding')).toBeInTheDocument();
    expect(screen.getByText('Add a transaction')).toBeInTheDocument();
  });

  test('does not present ₹0.00 as a net worth', () => {
    seed();
    render(<DashboardPage />);
    // The "Net worth" section heading is what carries the figure. Its absence
    // is the point: there is no number to stand behind yet. Queried as a
    // heading because the trend card below carries the same words as a label.
    expect(screen.queryByRole('heading', { name: 'Net worth' })).not.toBeInTheDocument();
  });

  test('offers the sample data without a trip to Settings', () => {
    seed();
    render(<DashboardPage />);
    expect(screen.getByRole('button', { name: /load sample data/i })).toBeInTheDocument();
  });
});

describe('a vault with something in it', () => {
  test('shows net worth, and says what net worth means', () => {
    seed({ txns: [txn('100000', 'income')] });
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Net worth' })).toBeInTheDocument();
    expect(screen.getByText('What you own minus what you owe')).toBeInTheDocument();
  });

  test('liabilities appear in the breakdown, not only in the total', () => {
    // The regression this guards: the headline subtracted the loan while the
    // row of parts under it listed only assets, so the two disagreed on screen
    // with nothing to explain the gap.
    seed({ txns: [txn('100000', 'income')], liabilities: [loan('250000')] });
    render(<DashboardPage />);
    expect(screen.getByText('Liabilities')).toBeInTheDocument();
  });

  test('an untracked figure reads as absent, not as zero', () => {
    // Transactions but no holdings is an ordinary state. Three ₹0.00
    // investment figures read as money lost rather than money not entered.
    seed({ txns: [txn('100000', 'income')] });
    render(<DashboardPage />);
    expect(screen.getByText('No positions yet')).toBeInTheDocument();
    expect(screen.getByText('Needs a holding')).toBeInTheDocument();
  });

  test('a tracked figure shows its number', () => {
    seed({ txns: [txn('100000', 'income')], holdings: [hold()] });
    render(<DashboardPage />);
    expect(screen.queryByText('No positions yet')).not.toBeInTheDocument();
  });
});

describe('the terms explain themselves', () => {
  test('a jargon figure carries a definition, reachable by tap', async () => {
    seed({ txns: [txn('100000', 'income')], holdings: [hold()] });
    render(<DashboardPage />);

    const btn = screen.getByRole('button', { name: /what is unrealised profit & loss/i });
    // Closed by default — an explanation nobody asked for is clutter.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.click(btn);
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText(/you have not sold/i)).toBeInTheDocument();
    // Wired to the figure for a screen reader, not left as a floating control.
    expect(btn).toHaveAttribute('aria-describedby', tip.id);
  });

  test('escape closes it', async () => {
    seed({ txns: [txn('100000', 'income')] });
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole('button', { name: /what is cash/i }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
