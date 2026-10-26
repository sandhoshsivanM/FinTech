// The review inbox: a capture becomes a transaction only through Approve, and
// an iPhone Shortcut's `#sms=` hand-off is read once and wiped from the URL.
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { useApp } from '@/lib/store';
import type { Category, PendingCapture } from '@khazana/domain/types';
import CapturePage from './page';

type AppPatch = Partial<Parameters<typeof useApp.setState>[0]>;

const cat: Category = { id: 'c-food', vaultId: 'v', name: 'Food' };
const swiggy: PendingCapture = {
  id: 'cap-1', vaultId: 'v', amount: '450', type: 'expense', merchant: 'swiggy',
  occurredAt: new Date(2026, 9, 26, 13).getTime(), source: 'sms', uncategorized: false,
  fingerprint: 'f1', capturedAt: 0, status: 'pending', categoryId: 'c-food', reasons: [],
};
const unknown: PendingCapture = { ...swiggy, id: 'cap-2', fingerprint: 'f2', merchant: null, categoryId: null, reasons: ['no_merchant', 'no_category'] };
const decided: PendingCapture = { ...swiggy, id: 'cap-3', fingerprint: 'f3', status: 'rejected' };

const approveCaptures = vi.fn(async () => {});
const rejectCapture = vi.fn(async () => {});
const addCaptures = vi.fn(async () => ['added' as const]);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/capture');
  useApp.setState({
    pendingCaptures: [swiggy, unknown, decided], categories: [cat], accounts: [],
    currencyCode: 'INR', ghost: false, approveCaptures, rejectCapture, addCaptures,
  } as AppPatch);
});

describe('Review inbox', () => {
  test('shows pending captures only, with their reasons', () => {
    render(<CapturePage />);
    expect(screen.getByText(/2 bank messages waiting/)).toBeTruthy();
    expect(screen.getByText('No merchant in the message')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Approve$/ })).toHaveLength(2);
  });

  test('approve is unavailable until a category is chosen', () => {
    render(<CapturePage />);
    const [ready, needsCategory] = screen.getAllByRole('button', { name: /^Approve$/ }) as HTMLButtonElement[];
    expect(ready.disabled).toBe(false);
    expect(needsCategory.disabled).toBe(true);
  });

  test('an edited amount is sent with the approval', async () => {
    render(<CapturePage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ })[0]);
    fireEvent.change(screen.getByDisplayValue('450'), { target: { value: '420' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Approve$/ })[0]);
    await waitFor(() => expect(approveCaptures).toHaveBeenCalledTimes(1));
    expect(approveCaptures).toHaveBeenCalledWith([
      { id: 'cap-1', edits: expect.objectContaining({ amount: '420', categoryId: 'c-food' }) },
    ]);
  });

  test('reject decides it without writing a transaction', () => {
    render(<CapturePage />);
    fireEvent.click(screen.getAllByRole('button', { name: /Reject/ })[0]);
    expect(rejectCapture).toHaveBeenCalledWith('cap-1');
    expect(approveCaptures).not.toHaveBeenCalled();
  });

  test('a Shortcut hand-off is read once and removed from the address bar', async () => {
    const sms = 'Rs 99 debited from a/c XX1 to UBER';
    window.history.replaceState(null, '', `/capture#sms=${encodeURIComponent(sms)}`);
    render(<CapturePage />);
    await waitFor(() => expect(addCaptures).toHaveBeenCalledWith([{ text: sms, source: 'sms' }]));
    expect(window.location.hash).toBe('');
    expect(await screen.findByText('1 added for review.')).toBeTruthy();
  });
});
