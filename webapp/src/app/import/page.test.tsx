// The Import screen over the real store slice. The parsers have their own unit
// tests; what matters here is that the screen never writes without a preview,
// and that what it previews is what the parser actually produced.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import type { Account, Category, Txn } from '@/lib/types';
import { ConfirmProvider } from '@/components/Confirm';
import ImportPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const PROFILE = 'p1';

const acct = (id: string, name: string): Account => ({
  id, vaultId: 'v', profileId: PROFILE, name, type: 'asset', subtype: 'bank', openingBalance: '0',
});

const cat = (id: string, name: string): Category => ({ id, vaultId: 'v', name });

// Typed to the store's own put signature so the call assertions below can read
// the record that was written rather than casting an untyped tuple.
const put = vi.fn<(type: string, value: { id: string } & Record<string, unknown>) => Promise<void>>(
  async () => {},
);
/** Every import run is recorded so it can be undone; assertions below check it. */
const recordBatch = vi.fn(async () => 'batch-1');

function seed(over: Record<string, unknown> = {}) {
  put.mockClear();
  recordBatch.mockClear();
  useApp.setState({
    activeProfileId: PROFILE,
    vaultId: 'v',
    accounts: [acct('a1', 'HDFC Savings')],
    categories: [cat('c1', 'Food'), cat('c2', 'Salary'), cat('c3', 'Other')],
    txns: [],
    holdings: [],
    postings: [],
    transfers: [],
    ghost: false,
    currencyCode: 'INR',
    importBatches: [],
    recordImportBatch: recordBatch,
    undoImportBatch: vi.fn(async () => 0),
    put,
    ...over,
  } as unknown as Parameters<typeof useApp.setState>[0]);
}

/**
 * The summary banners interleave <b> counts with prose, so the sentence spans
 * several elements and getByText cannot see it. Asserting on the flattened
 * document text checks what the user actually reads.
 */
async function expectText(s: string) {
  await waitFor(() =>
    expect(document.body.textContent?.replace(/\s+/g, ' ')).toContain(s),
  );
}

/** Drives the hidden file input the drop zone wraps. */
async function upload(user: ReturnType<typeof userEvent.setup>, name: string, body: string) {
  const file = new File([body], name, { type: 'text/csv' });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, file);
}

beforeEach(() => { cleanup(); seed(); });

describe('Import — structure', () => {
  test('offers both halves of the import flow', () => {
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('Income & Expenses')).toBeInTheDocument();
  });

  test('assets tab lists brokers and explains how to export', () => {
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    expect(screen.getByText('Select Broker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zerodha/ })).toBeInTheDocument();
    expect(screen.getByText(/How to export from Zerodha/i)).toBeInTheDocument();
  });

  test('selecting a broker swaps the instructions', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByRole('button', { name: /Groww/ }));
    expect(screen.getByText(/How to export from Groww/i)).toBeInTheDocument();
  });

  test('money tab groups banks by country', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('Qatar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HDFC Bank/ })).toBeInTheDocument();
  });
});

describe('Import — transactions', () => {
  const STATEMENT = [
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '02/05/2026,SALARY CREDIT ACME,,85000.00',
    '03/05/2026,UPI-SWIGGY ORDER,450.50,',
  ].join('\n');

  test('previews before writing anything', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 'statement.csv', STATEMENT);

    await expectText('2 new transactions ready');
    // The whole point of the preview: nothing is persisted yet.
    expect(put).not.toHaveBeenCalled();
  });

  test('preview shows the parsed direction and auto-detected category', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 'statement.csv', STATEMENT);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Income')).toBeInTheDocument();
    expect(within(table).getByText('Expense')).toBeInTheDocument();
    // SWIGGY → Food, from the narration alone.
    expect(within(table).getByText('Food')).toBeInTheDocument();
  });

  test('confirming writes one record per fresh row', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 'statement.csv', STATEMENT);
    await user.click(await screen.findByRole('button', { name: /Import 2 transactions/ }));

    expect(put).toHaveBeenCalledTimes(2);
    const kinds = put.mock.calls.map(([, rec]) => rec.type);
    expect(kinds).toContain('income');
    expect(kinds).toContain('expense');
  });

  test('rows already in the book are excluded from the count', async () => {
    const existing: Txn = {
      id: 't1', vaultId: 'v', profileId: PROFILE, amount: '450.50', type: 'expense',
      categoryId: 'c1', merchant: 'UPI-SWIGGY ORDER',
      date: new Date(2026, 4, 3).getTime(), createdAt: 0,
    };
    seed({ txns: [existing] });

    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 'statement.csv', STATEMENT);

    await expectText('1 new transaction ready');
    await expectText('already in your book');
  });

  test('an unreadable file explains itself instead of failing silently', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 'junk.csv', 'Foo,Bar\n1,2');

    expect(await screen.findByText(/Could not find a header row/i)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});

describe('Import — holdings', () => {
  const BROKER = 'Symbol,Qty,Avg Cost,LTP\nINFY,10,1400,1500\nTCS,5,3500,3600';

  test('previews positions without writing', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await upload(user, 'holdings.csv', BROKER);

    await expectText('2 rows ready');
    expect(put).not.toHaveBeenCalled();
  });

  test('confirming writes each position', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await upload(user, 'holdings.csv', BROKER);
    await user.click(await screen.findByRole('button', { name: /Import 2 rows/ }));

    expect(put).toHaveBeenCalledTimes(2);
    const symbols = put.mock.calls.map(([, rec]) => rec.symbol);
    expect(symbols).toEqual(expect.arrayContaining(['INFY', 'TCS']));
  });
});

describe('Import — Append vs Update by Name', () => {
  const BROKER = 'Symbol,Qty,Avg Cost,LTP\nINFY,10,1400,1500';
  const existingInfy = {
    id: 'h1', vaultId: 'v', profileId: PROFILE, symbol: 'INFY', exchange: 'NSE',
    quantity: '5', avgCost: '1200', assetType: 'equity_etf' as const,
  };

  test('Update by Name reuses the existing position id', async () => {
    seed({ holdings: [existingInfy] });
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await upload(user, 'h.csv', BROKER);
    await expectText('matched to existing positions');
    await user.click(await screen.findByRole('button', { name: /Import 1 row/ }));

    expect(put).toHaveBeenCalledTimes(1);
    // Same id → the broker export updates the position instead of doubling it.
    expect(put.mock.calls[0][1].id).toBe('h1');
  });

  test('Append adds a new position even when the name matches', async () => {
    seed({ holdings: [existingInfy] });
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByRole('button', { name: 'Append' }));
    await upload(user, 'h.csv', BROKER);
    await expectText('all will be added as new positions');
    await user.click(await screen.findByRole('button', { name: /Import 1 row/ }));

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].id).not.toBe('h1');
  });
});

describe('Import — dividends from a bank statement', () => {
  const held = {
    id: 'h1', vaultId: 'v', profileId: PROFILE, symbol: 'RELIANCE', exchange: 'NSE',
    quantity: '10', avgCost: '2000', assetType: 'equity_etf' as const,
    name: 'Reliance Industries',
  };
  const STMT = [
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '02/05/2026,ACH C/ RELIANCE INDUSTRIES LTD DIV,,1240.00',
  ].join('\n');

  test('writes both the income transaction and the dividend record', async () => {
    seed({ holdings: [held] });
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 's.csv', STMT);
    await user.click(await screen.findByRole('button', { name: /Import 1 transaction/ }));

    const types = put.mock.calls.map(([store]) => store);
    expect(types).toContain('txn');
    expect(types).toContain('dividend');

    const div = put.mock.calls.find(([store]) => store === 'dividend')![1];
    expect(div.symbol).toBe('RELIANCE');
    expect(div.kind).toBe('dividend');
    expect(div.amount).toBe('1240.00');
    expect(div.received).toBe(true);
  });

  test('a dividend for an unheld company writes only the transaction', async () => {
    seed({ holdings: [] });
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 's.csv', STMT);
    await user.click(await screen.findByRole('button', { name: /Import 1 transaction/ }));

    const types = put.mock.calls.map(([store]) => store);
    expect(types).toContain('txn');
    // Never attach a payout to a position that does not exist.
    expect(types).not.toContain('dividend');
  });

  test('an ordinary salary credit creates no dividend record', async () => {
    seed({ holdings: [held] });
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 's.csv', 'Date,Narration,Withdrawal Amt.,Deposit Amt.\n02/05/2026,SALARY CREDIT,,85000.00');
    await user.click(await screen.findByRole('button', { name: /Import 1 transaction/ }));

    expect(put.mock.calls.map(([store]) => store)).not.toContain('dividend');
  });
});

describe('Import — undo', () => {
  const BROKER = 'Symbol,Qty,Avg Cost,LTP\nINFY,10,1400,1500\nTCS,5,3500,3600';
  const STATEMENT = [
    'Date,Narration,Withdrawal Amt.,Deposit Amt.',
    '02/05/2026,SALARY CREDIT,,85000.00',
    '03/05/2026,UPI-SWIGGY,450.50,',
  ].join('\n');

  test('a holdings import records exactly the ids it created', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await upload(user, 'holdings.csv', BROKER);
    await user.click(await screen.findByRole('button', { name: /Import 2 rows/ }));

    expect(recordBatch).toHaveBeenCalledTimes(1);
    const batch = recordBatch.mock.calls[0][0] as {
      kind: string; filename: string; created: { type: string; id: string }[]; updatedCount: number;
    };
    expect(batch.kind).toBe('holdings');
    expect(batch.filename).toBe('holdings.csv');
    expect(batch.created).toHaveLength(2);
    expect(batch.created.every((c) => c.type === 'holding')).toBe(true);
  });

  test('an update is counted but not listed as created — it cannot be rewound', async () => {
    // The prior value was never captured, so undo must not claim to restore it.
    seed({
      holdings: [{
        id: 'h-existing', vaultId: 'v', profileId: PROFILE, symbol: 'INFY',
        exchange: 'NSE', quantity: '5', avgCost: '1200', assetType: 'equity_etf',
      }],
    });
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await upload(user, 'holdings.csv', BROKER);
    await user.click(await screen.findByRole('button', { name: /Import 2 rows/ }));

    const batch = recordBatch.mock.calls[0][0] as { created: { id: string }[]; updatedCount: number };
    expect(batch.updatedCount).toBe(1);
    expect(batch.created).toHaveLength(1);
    expect(batch.created.some((c) => c.id === 'h-existing')).toBe(false);
  });

  test('a transaction import records every record it wrote', async () => {
    const user = userEvent.setup();
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    await user.click(screen.getByText('Income & Expenses'));
    await upload(user, 'statement.csv', STATEMENT);
    await user.click(await screen.findByRole('button', { name: /Import 2 transactions/ }));

    const batch = recordBatch.mock.calls[0][0] as { kind: string; created: { type: string }[] };
    expect(batch.kind).toBe('transactions');
    expect(batch.created).toHaveLength(2);
  });

  test('history lists past runs with an undo control', () => {
    seed({
      importBatches: [{
        id: 'b1', vaultId: 'v', profileId: PROFILE, at: new Date(2026, 7, 9).getTime(),
        filename: 'hdfc-may.csv', kind: 'transactions',
        created: [{ type: 'txn', id: 't1' }], updatedCount: 0,
      }],
    });
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    expect(screen.getByText('hdfc-may.csv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument();
  });

  test('an already-undone run is marked, not offered again', () => {
    seed({
      importBatches: [{
        id: 'b1', vaultId: 'v', profileId: PROFILE, at: Date.now(),
        filename: 'old.csv', kind: 'holdings',
        created: [], updatedCount: 0, undone: true,
      }],
    });
    render(<ConfirmProvider><ImportPage /></ConfirmProvider>);
    expect(screen.getByText('Undone')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
