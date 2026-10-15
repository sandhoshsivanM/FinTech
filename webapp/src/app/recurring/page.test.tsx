// A bill's price changes without the bill stopping — a cheaper broadband
// plan, a fare hike — so a recurring rule has to be correctable in place.
// Deleting and re-adding would lose the schedule.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@/components/Confirm';
import type { Category, RecurringRule } from '@/lib/types';
import RecurringPage from './page';

type AppPatch = Partial<Parameters<typeof useApp.setState>[0]>;

const base: AppPatch = {
  txns: [], holdings: [], liabilities: [], accounts: [], postings: [],
  categories: [], budgets: [], goals: [], insurances: [], snapshots: [],
  recurring: [], dividends: [], fxRates: [], transfers: [],
  ghost: false, currencyCode: 'INR',
};

const cat: Category = { id: 'c-net', vaultId: 'v', name: 'Internet', kind: 'expense', icon: 'wifi' } as Category;
// A time of day on purpose: rules made before dates were parsed as local
// midnight carry one, and an edit that leaves the date alone must keep it.
const nextRun = new Date(2026, 10, 5, 5, 30).getTime();
const wifi: RecurringRule = {
  id: 'r-wifi', vaultId: 'v', amount: '650.00', type: 'expense', categoryId: 'c-net',
  merchant: 'Wi-Fi', frequency: 'monthly', nextRun, accountId: null,
};

/** Stands in for the persisted upsert: same id replaces, new id appends. */
const put = vi.fn(async (_type: string, value: RecurringRule) => {
  const rest = useApp.getState().recurring.filter((r) => r.id !== value.id);
  useApp.setState({ recurring: [...rest, value] });
});

beforeEach(() => {
  cleanup();
  put.mockClear();
  useApp.setState({ ...base, categories: [cat], recurring: [wifi], vaultId: 'v', put } as AppPatch);
});

const renderPage = () => render(<ConfirmProvider><RecurringPage /></ConfirmProvider>);

describe('Recurring — editing a rule', () => {
  test('changing the amount updates the same rule and keeps its schedule', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit recurring rule' }));

    expect(screen.getByText(/Edit recurring rule/)).toBeTruthy();
    expect(screen.getByText('Next run date')).toBeTruthy();
    const amount = screen.getByDisplayValue('650.00');
    fireEvent.change(amount, { target: { value: '590' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update rule' }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const saved = useApp.getState().recurring;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: 'r-wifi', amount: '590.00', merchant: 'Wi-Fi', categoryId: 'c-net', frequency: 'monthly', nextRun,
    });
    // Form closes back to the add state.
    await waitFor(() => expect(screen.getByText(/Add recurring rule/)).toBeTruthy());
  });

  test('cancelling an edit leaves the rule untouched', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit recurring rule' }));
    fireEvent.change(screen.getByDisplayValue('650.00'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(put).not.toHaveBeenCalled();
    expect(useApp.getState().recurring[0].amount).toBe('650.00');
    expect(screen.getByText(/Add recurring rule/)).toBeTruthy();
  });
});
