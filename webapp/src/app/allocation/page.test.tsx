// Target vs Actual: the table, and the rule that targets save only at 100%.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@khazana/screens/components/Confirm';
import type { Holding } from '@khazana/domain/types';
import AllocationPage from '@khazana/screens/pages/allocation';

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

type AppPatch = Partial<Parameters<typeof useApp.setState>[0]>;

const h = (id: string, assetType: Holding['assetType'], value: string): Holding =>
  ({ id, vaultId: 'v', symbol: id.toUpperCase(), exchange: 'NSE', quantity: '1', avgCost: value, lastPrice: value, assetType });

const holdings = [
  h('eq', 'equity_mf', '620000'), h('debt', 'debt_mf', '140000'),
  h('dg', 'digital_gold', '45000'), h('ag', 'silver', '20000'),
  h('ppf', 'ppf_epf', '80000'), h('cash', 'cash', '75000'), h('btc', 'crypto', '20000'),
];

const put = vi.fn(async (_t: string, value: unknown) => { useApp.setState({ allocationTargets: [value] } as AppPatch); });

beforeEach(() => {
  cleanup();
  put.mockClear();
  useApp.setState({
    holdings, fxRates: [], lots: [], sipPlans: [], sipInstalments: [], allocationTargets: [],
    vaultId: 'v', activeProfileId: 'p1', ghost: false, currencyCode: 'INR', put,
  } as AppPatch);
});

const renderPage = () => render(<ConfirmProvider><AllocationPage /></ConfirmProvider>);

describe('Allocation', () => {
  test('with targets set: gaps, actions and the under-target banner', () => {
    useApp.setState({ allocationTargets: [{ id: 'alloc:p1', vaultId: 'v', profileId: 'p1', targets: { equity: 60, debt: 20, gold: 10, retirement: 5, cash: 5 }, tolerance: 2, updatedAt: 0 }] } as AppPatch);
    renderPage();
    const table = screen.getByRole('table', { name: 'Target vs Actual' });
    const debt = within(table).getByRole('row', { name: /Debt/ });
    expect(debt.textContent).toMatch(/14%/);
    expect(debt.textContent).toMatch(/Add ₹60,000/);
    const gold = within(table).getByRole('row', { name: /Gold & commodities/ });
    expect(gold.textContent).toMatch(/6\.5%/);
    expect(gold.textContent).toMatch(/Add ₹35,000/);
    expect(within(table).getByRole('row', { name: /Retirement/ }).textContent).toMatch(/Over by ₹30,000/);
    expect(within(table).getByRole('row', { name: /Equity/ }).textContent).toMatch(/On track/);
    expect(screen.getByText(/2 categories are under target/)).toBeInTheDocument();
  });

  test('a group expands into its asset types', () => {
    useApp.setState({ allocationTargets: [{ id: 'a', vaultId: 'v', targets: { equity: 100 }, tolerance: 2, updatedAt: 0 }] } as AppPatch);
    renderPage();
    const btn = screen.getByRole('button', { name: /Gold & commodities/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('rowheader', { name: /Digital Gold/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Silver/ })).toBeInTheDocument();
  });

  test('first-time targets start from today and save only when they total 100', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Set targets/ }));
    const save = screen.getByRole('button', { name: 'Save targets' });
    expect(save).toBeEnabled();
    expect(screen.getByRole('status').textContent).toMatch(/Total 100%/);

    fireEvent.click(screen.getByRole('button', { name: 'Raise Debt' }));
    expect(screen.getByRole('status').textContent).toMatch(/Total 101%/);
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Lower Equity' }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const rec = put.mock.calls[0][1] as { id: string; targets: Record<string, number> };
    expect(rec.id).toBe('alloc:p1');
    expect(Object.values(rec.targets).reduce((a, b) => a + b, 0)).toBe(100);
    expect(rec.targets.debt).toBe(15);
  });
});
