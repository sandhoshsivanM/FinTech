'use client';

import { syncNow, useOnline } from '@/lib/store';

/** "Synced · just now", "Syncing…", or "Offline: changes saved, will sync". Tap to sync now. */
export function SyncChip() {
  const { status } = useOnline();
  const label =
    status.kind === 'syncing' ? 'Syncing…'
    : status.kind === 'synced' ? `Synced · ${status.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : status.kind === 'offline' ? `Offline · ${status.pending} change${status.pending === 1 ? '' : 's'} saved, will sync`
    : status.kind === 'error' ? 'Sync problem · tap to retry'
    : 'Not synced yet';
  const dot = status.kind === 'synced' ? 'var(--color-data-green)' : status.kind === 'error' ? 'var(--color-data-rose)' : 'var(--color-data-amber)';
  return (
    <button onClick={() => void syncNow()} data-testid="sync-status" title={status.kind === 'error' ? status.message : undefined}
      className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </button>
  );
}
