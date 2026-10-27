'use client';

import { useEffect, useState } from 'react';
import { syncNow, useOnline } from '@/lib/store';

/** "Synced · just now", "Syncing…", or "Offline: changes saved, will sync". Tap to sync now. */
export function SyncChip() {
  const { status } = useOnline();
  const [announcement, setAnnouncement] = useState('');

  // Announce outcomes only. "Syncing…" comes and goes on every change and would be noise.
  useEffect(() => {
    if (status.kind === 'synced') setAnnouncement('Synced');
    else if (status.kind === 'offline') setAnnouncement(`Offline. ${status.pending} change${status.pending === 1 ? '' : 's'} saved, will sync.`);
    else if (status.kind === 'error') setAnnouncement(`Sync problem: ${status.message.replace(/\.$/, '')}. Tap to retry.`);
  }, [status]);

  const label =
    status.kind === 'syncing' ? 'Syncing…'
    : status.kind === 'synced' ? `Synced · ${status.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : status.kind === 'offline' ? `Offline · ${status.pending} change${status.pending === 1 ? '' : 's'} saved, will sync`
    : status.kind === 'error' ? 'Sync problem · tap to retry'
    : 'Not synced yet';
  const dot = status.kind === 'synced' ? 'var(--color-data-green)' : status.kind === 'error' ? 'var(--color-data-rose)' : 'var(--color-data-amber)';
  return (
    <>
      <button onClick={() => void syncNow()} data-testid="sync-status"
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {label}
      </button>
      {/* The chip's colour dot is decorative; the words carry the state. Outcomes are read out here. */}
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
      {status.kind === 'error' && <span className="text-xs" style={{ color: 'var(--muted)' }}>{status.message}</span>}
    </>
  );
}
