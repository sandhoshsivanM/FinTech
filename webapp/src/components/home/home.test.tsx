import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import type { Account, Txn } from '@khazana/domain/types';
import { WalletStack, walletAccounts } from '@khazana/screens/components/home/WalletStack';
import { LatestTransactions } from '@khazana/screens/components/home/LatestTransactions';
import { BalanceHero } from '@khazana/screens/components/home/BalanceHero';
import { WeekFlowCard } from '@khazana/screens/components/home/WeekFlowCard';
import { InsightCard } from '@khazana/screens/components/home/InsightCard';
import { MonthTiles } from '@khazana/screens/components/home/MonthTiles';
import { BudgetRingCard } from '@khazana/screens/components/home/BudgetRingCard';
import { shiftMonths } from '@khazana/domain/period';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>
  ),
}));

const acct = (id: string, subtype: string, over: Partial<Account> = {}): Account => ({
  id, vaultId: 'v', name: `${subtype} ${id}`, type: subtype === 'credit_card' ? 'liability' : 'asset',
  subtype, openingBalance: '1000', ...over,
});

const txn = (id: string, date: number, over: Partial<Txn> = {}): Txn => ({
  id, vaultId: 'v', amount: '250', type: 'expense', categoryId: 'food', date, createdAt: date, ...over,
});

function seed(over: Partial<Parameters<typeof useApp.setState>[0]> = {}) {
  useApp.setState({
    txns: [], accounts: [], postings: [], categories: [], budgets: [],
    ghost: false, currencyCode: 'INR', ...over,
  });
}

beforeEach(cleanup);

describe('wallet stack', () => {
  test('carries bank, cash and credit cards, not loans or archived accounts', () => {
    const list = walletAccounts([
      acct('a', 'bank'), acct('b', 'cash'), acct('c', 'credit_card'),
      acct('d', 'loan', { type: 'liability' }), acct('e', 'bank', { archived: true }),
    ]);
    expect(list.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('renders nothing without accounts', () => {
    seed();
    const { container } = render(<WalletStack />);
    expect(container).toBeEmptyDOMElement();
  });

  test('dots switch the front card without a swipe', async () => {
    seed({ accounts: [acct('a', 'bank'), acct('b', 'cash')] });
    render(<WalletStack />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  test('masks balances in ghost mode', () => {
    seed({ accounts: [acct('a', 'bank')], ghost: true });
    render(<WalletStack />);
    const card = screen.getByTestId('wallet-card');
    expect(within(card).getByText('••••••')).toBeInTheDocument();
    expect(within(card).queryByText(/1,000/)).not.toBeInTheDocument();
  });
});

describe('latest transactions', () => {
  test('lists the newest five, newest first', () => {
    const base = Date.UTC(2026, 0, 10);
    seed({
      categories: [{ id: 'food', vaultId: 'v', name: 'Food', icon: 'Utensils' }],
      txns: Array.from({ length: 7 }, (_, i) => txn(`t${i}`, base + i * 86_400_000, { merchant: `Shop ${i}` })),
    });
    render(<LatestTransactions />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('Shop 6');
    expect(items[4]).toHaveTextContent('Shop 2');
  });
});

describe('balance hero', () => {
  test('the eye toggles ghost mode', async () => {
    seed({ accounts: [acct('a', 'bank')] });
    render(<BalanceHero />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
    expect(useApp.getState().ghost).toBe(true);
    expect(screen.getByRole('button', { name: 'Show amounts' })).toBeInTheDocument();
  });
});

describe('last 7 days', () => {
  test('defaults to today, and a tap shows that day in exact figures', async () => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const yesterday = today.getTime() - 86_400_000;
    seed({
      txns: [
        txn('t1', today.getTime(), { amount: '1240', type: 'expense' }),
        txn('t2', yesterday, { amount: '90000', type: 'income' }),
      ],
    });
    render(<WeekFlowCard />);
    const group = await screen.findByRole('group', { name: 'Income and spending per day' });
    const days = within(group).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[6]).toHaveAttribute('aria-pressed', 'true');
    const readout = () => document.querySelector('[aria-live="polite"]')!;
    expect(readout()).toHaveTextContent('Out ₹1,240.00');

    await userEvent.click(days[5]);
    expect(days[5]).toHaveAttribute('aria-pressed', 'true');
    expect(readout()).toHaveTextContent('In ₹90,000.00');
  });

  test('ghost mode masks every figure', async () => {
    seed({ ghost: true, txns: [txn('t1', Date.now(), { amount: '1240', type: 'expense' })] });
    render(<WeekFlowCard />);
    await screen.findAllByRole('button');
    expect(screen.queryByText(/1,240/)).not.toBeInTheDocument();
  });
});

describe('insights', () => {
  const dayAgo = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() - n * 86_400_000; };

  test('compares this week with last, and the dashes switch insight', async () => {
    seed({
      categories: [{ id: 'food', vaultId: 'v', name: 'Food', icon: 'Utensils' }],
      txns: [
        txn('a', dayAgo(1), { amount: '118', type: 'expense' }),
        txn('b', dayAgo(9), { amount: '100', type: 'expense' }),
      ],
    });
    render(<InsightCard />);
    expect(await screen.findByText('18%')).toBeInTheDocument();
    expect(screen.getByText('More spent than last week.')).toBeInTheDocument();
    const dashes = screen.getAllByRole('button', { name: /Insight \d of/ });
    await userEvent.click(dashes[dashes.length - 1]);
    expect(screen.getByText(/went on Food/)).toBeInTheDocument();
  });

  test('ghost mode masks the amounts', async () => {
    seed({
      ghost: true,
      txns: [
        txn('a', dayAgo(1), { amount: '118', type: 'expense' }),
        txn('b', dayAgo(9), { amount: '100', type: 'expense' }),
      ],
    });
    render(<InsightCard />);
    await screen.findByText('18%');
    expect(screen.queryByText(/₹118/)).not.toBeInTheDocument();
  });
});

describe('a past month picked on the dashboard', () => {
  const lastMonth = () => shiftMonths(Date.now(), -1);
  const inLastMonth = () => lastMonth().start + 5 * 86_400_000;
  const recent = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() - 86_400_000; };
  const longName = (ms: number) => new Date(ms).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  test('insights speak about that month and leave out "this week"', async () => {
    seed({
      categories: [{ id: 'food', vaultId: 'v', name: 'Food', icon: 'Utensils' }],
      txns: [
        txn('a', recent(), { amount: '118' }),
        txn('b', recent() - 8 * 86_400_000, { amount: '100' }),
        txn('c', inLastMonth(), { amount: '900' }),
      ],
    });
    render(<InsightCard month={lastMonth()} />);
    expect(await screen.findByText(new RegExp(`Of ${longName(lastMonth().start)}’s spending went on Food`))).toBeInTheDocument();
    expect(screen.queryByText(/than last week/)).not.toBeInTheDocument();
  });

  test('month tiles total that month, not this one', async () => {
    seed({ txns: [txn('a', inLastMonth(), { amount: '900' }), txn('b', recent(), { amount: '50' })] });
    render(<MonthTiles month={lastMonth()} />);
    expect(await screen.findByText('₹900.00')).toBeInTheDocument();
  });

  test('the budget card names the month instead of "this month"', async () => {
    seed({
      categories: [{ id: 'food', vaultId: 'v', name: 'Food', icon: 'Utensils' }],
      budgets: [{ id: 'b1', vaultId: 'v', categoryId: 'food', amountLimit: '1000', rolloverEnabled: false, alertThresholdPct: 90 }],
      txns: [txn('a', inLastMonth(), { amount: '400' })],
    });
    render(<BudgetRingCard month={lastMonth()} />);
    expect(await screen.findByText(`Budget · ${longName(lastMonth().start)}`)).toBeInTheDocument();
    expect(screen.getByText('40% used')).toBeInTheDocument();
  });
});
