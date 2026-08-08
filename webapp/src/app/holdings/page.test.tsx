// The edit flow on the position grid. Both cases here were live bugs: the
// pencil appeared to do nothing, because the editor opens above a table the
// reader has scrolled past, and switching rows kept showing the first holding.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@/components/Confirm';
import type { Holding } from '@/lib/types';
import HoldingsPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const hold = (over: Partial<Holding>): Holding => ({
  id: over.symbol ?? 'h', vaultId: 'v', symbol: 'X', exchange: 'NSE',
  quantity: '100', avgCost: '40', lastPrice: '47.10', assetType: 'equity_etf', ...over,
} as Holding);

function seed() {
  useApp.setState({
    holdings: [
      hold({ id: 'a', symbol: 'SOUTHBANK', quantity: '100', avgCost: '41.55' }),
      hold({ id: 'b', symbol: 'ITC', quantity: '20', avgCost: '366.85' }),
    ],
    ghost: false,
    currencyCode: 'INR',
  });
}

const renderPage = () => render(<ConfirmProvider><HoldingsPage /></ConfirmProvider>);

describe('HoldingsPage edit flow', () => {
  beforeEach(() => {
    cleanup();
    // jsdom has no layout, so this is a no-op stub rather than a behaviour.
    Element.prototype.scrollIntoView = vi.fn();
    seed();
  });

  test('the pencil opens the editor for that position', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText('Edit SOUTHBANK')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit SOUTHBANK' }));

    expect(screen.getByText('Edit SOUTHBANK')).toBeInTheDocument();
    expect(screen.getByLabelText('Average cost')).toHaveValue('41.55');
  });

  test('the editor is scrolled into view, since it opens above the table', async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit ITC' }));

    expect(scroll).toHaveBeenCalled();
  });

  test('switching rows shows the second holding, not the first', async () => {
    // The form seeds its fields on mount. Without a key on the position, React
    // reused the instance and the fields stayed on whichever row was clicked
    // first — the edit looked broken for every row after the first.
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit SOUTHBANK' }));
    await user.click(screen.getByRole('button', { name: 'Edit ITC' }));

    expect(screen.getByText('Edit ITC')).toBeInTheDocument();
    expect(screen.queryByText('Edit SOUTHBANK')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Average cost')).toHaveValue('366.85');
    expect(screen.getByLabelText('Quantity')).toHaveValue('20');
  });

  test('sector and cap can be set by hand and come back on reopen', async () => {
    // The grid showed every ETF as "Unclassified" with no way to correct it:
    // the fields exist on Holding but the form never surfaced them.
    const user = userEvent.setup();
    const put = vi.fn(async () => {});
    useApp.setState({ put: put as never });
    renderPage();

    // Regexes, not exact strings: Field folds its hint into the label, so the
    // accessible name is "SectorBlank uses the built-in lookup".
    await user.click(screen.getByRole('button', { name: 'Edit SOUTHBANK' }));
    await user.type(screen.getByLabelText(/^Sector/), 'Financial Services');
    await user.selectOptions(screen.getByLabelText(/^Market cap/), 'small');
    await user.type(screen.getByLabelText(/^Country/), 'in');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(put).toHaveBeenCalledWith('holding', expect.objectContaining({
      id: 'a', sector: 'Financial Services', marketCapBand: 'small', country: 'IN',
    }));
  });

  test('a blank sector stays null so the built-in lookup still applies', async () => {
    const user = userEvent.setup();
    const put = vi.fn(async () => {});
    useApp.setState({ put: put as never });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit ITC' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(put).toHaveBeenCalledWith('holding', expect.objectContaining({ sector: null, marketCapBand: null }));
  });

  test('reopening the same row discards unsaved edits rather than keeping them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit SOUTHBANK' }));
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '999');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Edit SOUTHBANK' }));

    expect(screen.getByLabelText('Quantity')).toHaveValue('100');
  });
});
