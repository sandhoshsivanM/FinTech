// Transfer mode on the add screen. The point of these is the boundary: a
// transfer must save as a Transfer record, never as a Txn, or every consumer
// that branches on income/expense will book it as spending.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import type { Account } from '@/lib/types';
import AddTransactionPage from './page';
import { ConfirmProvider } from '@/components/Confirm';

/** The page asks for confirmation on high-impact edits, so it needs the host. */
const renderPage = () => render(<ConfirmProvider><AddTransactionPage /></ConfirmProvider>);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const PROFILE = 'p1';
const acct = (id: string, name: string): Account => ({
  id, vaultId: 'v', profileId: PROFILE, name, type: 'asset', subtype: 'bank', openingBalance: '0',
});

let put: ReturnType<typeof vi.fn>;

function seed(accounts: Account[] = [acct('a1', 'HDFC Salary'), acct('a2', 'Emergency Fund')]) {
  put = vi.fn(async () => {});
  useApp.setState({
    activeProfileId: PROFILE,
    vaultId: 'v',
    accounts,
    categories: [{ id: 'c1', vaultId: 'v', name: 'Food', icon: 'Utensils' }],
    txns: [],
    transfers: [],
    ghost: false,
    currencyCode: 'INR',
    put: put as never,
  });
}

describe('add screen — transfers', () => {
  beforeEach(() => { cleanup(); seed(); });

  test('a transfer saves as a Transfer, not a transaction', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Transfer' }));
    await user.type(screen.getByLabelText('Amount'), '25000');
    await user.selectOptions(screen.getByLabelText('From account'), 'a1');
    await user.selectOptions(screen.getByLabelText(/^To account/), 'a2');
    await user.click(screen.getByRole('button', { name: 'Save Transfer' }));

    expect(put).toHaveBeenCalledTimes(1);
    const [type, record] = put.mock.calls[0];
    expect(type).toBe('transfer');
    expect(record).toMatchObject({ amount: '25000.00', fromAccountId: 'a1', toAccountId: 'a2' });
    // No category, no type: the fields that would let it be read as spending.
    expect(record).not.toHaveProperty('categoryId');
    expect(record).not.toHaveProperty('type');
  });

  test('will not save a transfer to the same account', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Transfer' }));
    await user.type(screen.getByLabelText('Amount'), '25000');
    await user.selectOptions(screen.getByLabelText('From account'), 'a1');
    await user.selectOptions(screen.getByLabelText(/^To account/), 'a1');

    expect(screen.getByRole('button', { name: 'Save Transfer' })).toBeDisabled();
    expect(screen.getByText('Pick a different account')).toBeInTheDocument();
  });

  test('a transfer needs both ends before it can be saved', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Transfer' }));
    await user.type(screen.getByLabelText('Amount'), '500');
    expect(screen.getByRole('button', { name: 'Save Transfer' })).toBeDisabled();
  });

  test('an expense records the account it moved', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Amount'), '1200');
    await user.selectOptions(screen.getByLabelText(/^Account/), 'a2');
    await user.click(screen.getByRole('button', { name: 'Food' }));
    await user.click(screen.getByRole('button', { name: 'Save Transaction' }));

    const [type, record] = put.mock.calls[0];
    expect(type).toBe('txn');
    expect(record).toMatchObject({ type: 'expense', accountId: 'a2', categoryId: 'c1' });
  });

  test('with no accounts yet, a transaction still falls back to Cash', async () => {
    seed([]);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Amount'), '300');
    await user.click(screen.getByRole('button', { name: 'Food' }));
    await user.click(screen.getByRole('button', { name: 'Save Transaction' }));

    expect(put.mock.calls[0][1]).toMatchObject({ accountId: `acct-cash-${PROFILE}` });
  });
});
