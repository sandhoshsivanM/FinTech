// The restore flow. The v2 backup format is only useful if the screen actually
// collects the PIN and hands it to importBackup — the first version of this UI
// put the PIN box in the Export section only, so a phone restore had no PIN to
// send and failed with "This backup needs the PIN it was exported with."
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApp } from '@/lib/store';
import { BackupError } from '@/lib/backupError';
import { ConfirmProvider } from '@/components/Confirm';
import SettingsPage from './page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const importBackup = vi.fn();
const exportBackup = vi.fn(async () => 'BACKUP');

function seed() {
  importBackup.mockReset();
  exportBackup.mockClear();
  useApp.setState({
    activeProfileId: 'p1', vaultId: 'v', status: 'unlocked',
    txns: [], holdings: [], accounts: [], categories: [], postings: [],
    transfers: [], dividends: [], snapshots: [], profiles: [{ id: 'p1', vaultId: 'v', name: 'Personal', kind: 'self', createdAt: 0 }],
    ghost: false, currencyCode: 'INR',
    importBackup, exportBackup,
  } as unknown as Parameters<typeof useApp.setState>[0]);
}

/** Drives the hidden restore file input. */
async function choose(user: ReturnType<typeof userEvent.setup>, body: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File([body], 'khazana-backup.ftos'));
}

beforeEach(() => { cleanup(); seed(); });

describe('Restore from backup', () => {
  test('offers a PIN box in the Restore section itself', () => {
    render(<ConfirmProvider><SettingsPage /></ConfirmProvider>);
    expect(screen.getByLabelText('Backup PIN', { selector: '#restore-pin' })).toBeInTheDocument();
  });

  test('passes the typed PIN to importBackup', async () => {
    importBackup.mockResolvedValue(42);
    const user = userEvent.setup();
    render(<ConfirmProvider><SettingsPage /></ConfirmProvider>);

    await user.type(screen.getByLabelText('Backup PIN', { selector: '#restore-pin' }), '2001');
    await choose(user, 'FILE');

    await waitFor(() => expect(importBackup).toHaveBeenCalledWith('FILE', '2001'));
  });

  test('a PIN-less attempt says where to type it, and retries without re-picking the file', async () => {
    importBackup.mockRejectedValueOnce(new BackupError('needs-pin', 'needs pin'));
    const user = userEvent.setup();
    render(<ConfirmProvider><SettingsPage /></ConfirmProvider>);

    await choose(user, 'FILE');
    await waitFor(() => expect(screen.getByText(/Type the PIN it was exported with/i)).toBeInTheDocument());

    // The file is retained, so the fix is: type the PIN, press Restore.
    importBackup.mockResolvedValueOnce(7);
    await user.type(screen.getByLabelText('Backup PIN', { selector: '#restore-pin' }), '2001');
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(importBackup).toHaveBeenLastCalledWith('FILE', '2001'));
    await waitFor(() => expect(screen.getByText(/Restored 7 records/)).toBeInTheDocument());
  });

  test('a wrong PIN keeps the file so it can be corrected', async () => {
    importBackup.mockRejectedValue(new BackupError('wrong-pin', 'That PIN does not open this backup.'));
    const user = userEvent.setup();
    render(<ConfirmProvider><SettingsPage /></ConfirmProvider>);

    await user.type(screen.getByLabelText('Backup PIN', { selector: '#restore-pin' }), '9999');
    await choose(user, 'FILE');

    await waitFor(() => expect(screen.getByText(/does not open this backup/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  test('the export PIN box is separate from the restore one', () => {
    render(<ConfirmProvider><SettingsPage /></ConfirmProvider>);
    const exportPin = document.querySelector('#backup-pin');
    const restorePin = document.querySelector('#restore-pin');
    expect(exportPin).toBeTruthy();
    expect(restorePin).toBeTruthy();
    expect(exportPin).not.toBe(restorePin);
  });
});
