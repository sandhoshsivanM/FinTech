'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { syncNow, useOnline } from '@/lib/store';

/**
 * Sync state in the top bar: "Synced · 10:42", "Syncing…", "Offline · 3 changes
 * saved". Tap to sync now. The words carry the state; the dot is decoration.
 */
export function SyncPill() {
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
    : status.kind === 'offline' ? `Offline · ${status.pending} saved`
    : status.kind === 'error' ? 'Sync problem · retry'
    : 'Not synced yet';
  const synced = status.kind === 'synced';
  const trouble = status.kind === 'offline' || status.kind === 'error';

  return (
    <>
      <button
        type="button"
        onClick={() => void syncNow()}
        data-testid="sync-status"
        title={status.kind === 'error' ? status.message : 'Sync now'}
        className={clsx(
          'focus-ring hidden min-[720px]:inline-flex items-center gap-2 h-8 px-3 rounded-full text-[11.5px] font-semibold whitespace-nowrap',
          synced && 'bg-success-soft text-success ring-1 ring-inset ring-[color-mix(in_srgb,var(--success)_26%,transparent)]',
          trouble && 'bg-warning-soft text-warning ring-1 ring-inset ring-[color-mix(in_srgb,var(--warning)_30%,transparent)]',
          !synced && !trouble && 'bg-fill text-muted ring-1 ring-inset ring-line',
        )}
      >
        <span aria-hidden="true" className={clsx('w-[7px] h-[7px] rounded-full bg-current', status.kind === 'syncing' && 'animate-pulse')} />
        {label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
