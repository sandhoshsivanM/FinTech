// SIPs: a due instalment is recorded only when the user says so, and Undo
// takes it back.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@khazana/screens/components/Confirm';
import type { Holding } from '@khazana/domain/types';
import type { SipInstalment, SipPlan } from '@khazana/domain/sip';
import SipsPage from '@khazana/screens/pages/sips';

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

type AppPatch = Partial<Parameters<typeof useApp.setState>[0]>;

const holding: Holding = { id: 'h', vaultId: 'v', symbol: 'PPFAS', name: 'Parag Parikh Flexi Cap', exchange: 'NSE', quantity: '100', avgCost: '80', lastPrice: '96.42', assetType: 'equity_mf' };
const plan: SipPlan = {
  id: 'sip', vaultId: 'v', holdingId: 'h', name: 'Parag Parikh Flexi Cap', assetType: 'equity_mf', amount: '8000',
  dayOfMonth: 23, startDate: '2026-11-01', stepUpPct: 0, remind: true, active: true, createdAt: 0,
};

const upsert = (type: string, value: { id: string }) => {
  const s = useApp.getState() as unknown as Record<string, { id: string }[]>;
  const key = type === 'sipInstalment' ? 'sipInstalments' : type === 'sipPlan' ? 'sipPlans' : type === 'holding' ? 'holdings' : 'lots';
  useApp.setState({ [key]: [...s[key].filter((x) => x.id !== value.id), value] } as AppPatch);
};
const put = vi.fn(async (type: string, value: { id: string }) => upsert(type, value));
const putMany = vi.fn(async (entries: { type: string; value: { id: string } }[]) => { for (const e of entries) upsert(e.type, e.value); });
const del = vi.fn(async (type: string, id: string) => {
  const s = useApp.getState() as unknown as Record<string, { id: string }[]>;
  const key = type === 'sipInstalment' ? 'sipInstalments' : type === 'sipPlan' ? 'sipPlans' : 'lots';
  useApp.setState({ [key]: s[key].filter((x) => x.id !== id) } as AppPatch);
});

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 23, 10));
  for (const f of [put, putMany, del]) f.mockClear();
  useApp.setState({
    holdings: [holding], lots: [], fxRates: [], sipPlans: [plan], sipInstalments: [] as SipInstalment[], allocationTargets: [],
    vaultId: 'v', activeProfileId: 'p1', ghost: false, currencyCode: 'INR', put, putMany, del,
  } as AppPatch);
});
afterEach(() => vi.useRealTimers());

const renderPage = () => render(<ConfirmProvider><SipsPage /></ConfirmProvider>);

describe('SIPs', () => {
  test('a due SIP is prefilled with its amount and the last NAV', () => {
    renderPage();
    expect(screen.getByLabelText(/Amount for Parag Parikh Flexi Cap/)).toHaveValue('8000');
    expect(screen.getByLabelText(/NAV for Parag Parikh Flexi Cap/)).toHaveValue('96.42');
  });

  test('Mark done records the units, Undo puts the holding back', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Mark done/ }));
    await vi.waitFor(() => expect(putMany).toHaveBeenCalledTimes(1));
    expect(useApp.getState().holdings[0].quantity).toBe('182.97');
    expect(await screen.findByText(/Recorded: 82.97 units/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark done/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() => expect(useApp.getState().sipInstalments).toHaveLength(0));
    expect(useApp.getState().holdings[0]).toMatchObject({ quantity: '100', avgCost: '80' });
    expect(await screen.findByRole('button', { name: /Mark done/ })).toBeInTheDocument();
  });

  test('Skipped records nothing in the holding', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Skipped' }));
    await vi.waitFor(() => expect(useApp.getState().sipInstalments).toHaveLength(1));
    expect(useApp.getState().sipInstalments[0]).toMatchObject({ status: 'skipped', amount: '0' });
    expect(useApp.getState().holdings[0].quantity).toBe('100');
    expect(await screen.findByText(/Skipped this month/)).toBeInTheDocument();
  });

  test('adding a SIP with a step-up', async () => {
    useApp.setState({ sipPlans: [] } as AppPatch);
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /Add SIP/ })[0]);
    fireEvent.change(screen.getByPlaceholderText('5000'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Yearly step-up' }));
    fireEvent.click(screen.getByRole('radio', { name: '15%' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save SIP' }));
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(useApp.getState().sipPlans[0]).toMatchObject({ holdingId: 'h', amount: '5000', stepUpPct: 15, active: true, assetType: 'equity_mf' });
  });
});

test('a month missed within the last five weeks still asks once', () => {
  useApp.setState({ sipPlans: [{ ...plan, startDate: '2026-01-23' }] } as AppPatch);
  renderPage();
  expect(screen.getAllByRole('button', { name: /Mark done/ })).toHaveLength(2);
});
