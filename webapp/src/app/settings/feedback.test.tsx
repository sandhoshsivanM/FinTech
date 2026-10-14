// Settings → Help & feedback. Mail goes through the user's own mail app; the
// desktop webview cannot open mailto:, so there it shows the address instead.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import { ConfirmProvider } from '@/components/Confirm';
import { FEEDBACK_EMAIL } from '@/lib/brand';
import { clearErrorLog, recordError } from '@/lib/errorLog';
import SettingsPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

function seed() {
  useApp.setState({
    activeProfileId: 'p1', vaultId: 'v', status: 'unlocked',
    txns: [], holdings: [], accounts: [], categories: [], postings: [],
    transfers: [], dividends: [], snapshots: [], profiles: [{ id: 'p1', vaultId: 'v', name: 'Personal', kind: 'self', createdAt: 0 }],
    ghost: false, currencyCode: 'INR', theme: 'system',
  } as unknown as Parameters<typeof useApp.setState>[0]);
}

const renderPage = () => render(<ConfirmProvider><SettingsPage /></ConfirmProvider>);

beforeEach(() => { cleanup(); seed(); clearErrorLog(); });
afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('Help & feedback card', () => {
  test('renders with its info hint and both mail links', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Help & feedback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /What is help & feedback\?/i })).toBeInTheDocument();

    const send = screen.getByRole('link', { name: 'Send feedback by email' });
    await waitFor(() => expect(send.getAttribute('href')).toContain('subject='));
    const href = send.getAttribute('href')!;
    expect(href.startsWith(`mailto:${FEEDBACK_EMAIL}?`)).toBe(true);
    expect(decodeURIComponent(href)).toContain('Khazana feedback — 1.0.0 (web)');

    expect(screen.getByRole('link', { name: 'Report a problem by email' })).toBeInTheDocument();
  });

  test('Copy problem report copies sanitized recent errors', async () => {
    recordError({ message: 'Failed on 1,20,000 for me@x.com' }, { route: '/budget', version: '1.0.0' });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Copy problem report/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('Failed on [amount] for [email]');
    expect(text).toContain('/budget');
    expect(text).not.toContain('1,20,000');
    expect(await screen.findByText(/Problem report copied/)).toBeInTheDocument();
  });

  test('falls back to a selected textarea when the clipboard is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));
    renderPage();
    await user.click(screen.getByRole('button', { name: /Copy problem report/ }));
    const box = await screen.findByRole('textbox', { name: 'Problem report' });
    expect((box as HTMLTextAreaElement).value).toContain('About this device');
    expect(document.activeElement).toBe(box);
  });

  test('desktop app shows the address and a Copy button instead of mailto links', () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    renderPage();
    expect(screen.queryByRole('link', { name: 'Send feedback by email' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Report a problem by email' })).not.toBeInTheDocument();
    expect(screen.getByText(FEEDBACK_EMAIL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy address/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy problem report/ })).toBeInTheDocument();
  });
});
