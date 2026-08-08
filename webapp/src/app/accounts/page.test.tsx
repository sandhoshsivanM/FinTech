// The Accounts page over the real store slice + the real ledger math: balances
// must come out of postings, not out of a second sum written for the view.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@/components/Confirm';
import type { Account, Posting, Txn } from '@/lib/types';
import AccountsPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const PROFILE = 'p1';

const acct = (id: string, name: string, opening = '0', subtype = 'bank'): Account => ({
  id, vaultId: 'v', profileId: PROFILE, name, type: 'asset', subtype, openingBalance: opening,
});

const leg = (entryId: string, accountId: string, amount: string): Posting => ({
  id: `${entryId}:${amount.startsWith('-') ? 'cr' : 'dr'}`,
  vaultId: 'v', profileId: PROFILE, entryId, accountId, amount,
});

const txn = (id: string, accountId: string): Txn => ({
  id, vaultId: 'v', profileId: PROFILE, amount: '100', type: 'expense',
  categoryId: 'c1', date: 0, createdAt: 0, accountId,
});

function seed(over: Partial<Parameters<typeof useApp.setState>[0]> = {}) {
  useApp.setState({
    activeProfileId: PROFILE,
    vaultId: 'v',
    accounts: [acct('a-salary', 'HDFC Salary', '100000'), acct('a-fund', 'Emergency Fund', '20000')],
    postings: [],
    txns: [],
    transfers: [],
    ghost: false,
    currencyCode: 'INR',
    ...over,
  });
}

const renderPage = () => render(<ConfirmProvider><AccountsPage /></ConfirmProvider>);

describe('AccountsPage', () => {
  beforeEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = vi.fn();
    seed();
  });

  test('lists accounts with their ledger balance', () => {
    renderPage();
    expect(screen.getByText('HDFC Salary')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
  });

  test('a posting moves the balance away from the opening figure', () => {
    // 100000 opening − 25000 credit = 75000. If the page summed transactions
    // instead of reading postings, this would still show the opening balance.
    seed({ postings: [leg('tr1', 'a-salary', '-25000'), leg('tr1', 'a-fund', '25000')] });
    renderPage();
    const rowFor = (name: string) =>
      screen.getAllByRole('listitem').find((li) => within(li).queryByText(name))!;
    expect(within(rowFor('HDFC Salary')).getByText(/75,000/)).toBeInTheDocument();
    expect(within(rowFor('Emergency Fund')).getByText(/45,000/)).toBeInTheDocument();
  });

  test('the editor opens for the account whose pencil was clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Edit Emergency Fund' }));
    expect(screen.getByText('Edit Emergency Fund')).toBeInTheDocument();
    expect(screen.getByLabelText('Account name')).toHaveValue('Emergency Fund');
  });

  test('switching accounts re-seeds the form rather than reusing the first', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Edit Emergency Fund' }));
    await user.click(screen.getByRole('button', { name: 'Edit HDFC Salary' }));
    expect(screen.getByLabelText('Account name')).toHaveValue('HDFC Salary');
  });

  test('saving writes a positive opening balance, never a signed one', async () => {
    const user = userEvent.setup();
    const put = vi.fn(async () => {});
    seed(); useApp.setState({ put: put as never });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Add account' }));
    await user.type(screen.getByLabelText('Account name'), 'ICICI Spends');
    await user.type(screen.getByLabelText(/^Balance today/), '42000');
    // Two buttons now read "Add account" — the page action that opened the
    // form, and the form's own submit. Take the last in document order.
    const submits = screen.getAllByRole('button', { name: 'Add account' });
    await user.click(submits[submits.length - 1]);

    expect(put).toHaveBeenCalledWith('account', expect.objectContaining({
      name: 'ICICI Spends', type: 'asset', subtype: 'bank', openingBalance: '42000',
    }));
  });

  test('offers to move transactions still stranded on the built-in Cash account', async () => {
    seed({ txns: [txn('t1', `acct-cash-${PROFILE}`), txn('t2', `acct-cash-${PROFILE}`)] });
    const reassign = vi.fn(async () => 2);
    useApp.setState({ reassignTxnAccounts: reassign as never });
    renderPage();

    expect(screen.getByText(/2 transactions not on a real account/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Move transactions to'), 'a-salary');
    await user.click(screen.getByRole('button', { name: 'Move them' }));
    // The confirm dialog reuses the same label; its button is the later one.
    const buttons = await screen.findAllByRole('button', { name: 'Move them' });
    await user.click(buttons[buttons.length - 1]);

    expect(reassign).toHaveBeenCalledWith(`acct-cash-${PROFILE}`, 'a-salary');
  });

  test('no reassign prompt once everything is tagged', () => {
    seed({ txns: [txn('t1', 'a-salary')] });
    renderPage();
    expect(screen.queryByText(/not on a real account/)).not.toBeInTheDocument();
  });
});
