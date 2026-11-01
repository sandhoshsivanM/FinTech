'use client';
import { useState } from 'react';
import { Download, Lock, RefreshCw } from 'lucide-react';
import { inDemo, useApp } from '@/lib/store';
import { DemoSessionBar } from './DemoSessionBar';
import { BrandMark, WordMark } from './BrandMark';
import { usePriceRefresh, refreshMessage } from '@/lib/quotes/usePriceRefresh';
import { useLivePrices } from '@/lib/quotes/useLivePrices';
import { quotesAvailable } from '@/lib/quotes/yahoo';
import { useNotificationDriver } from '@/lib/useNotificationDriver';
import { NotificationsMenu } from '@khazana/screens/components/NotificationsMenu';
import { IconBtn, ShellFrame } from '@khazana/screens/components/ShellFrame';
import { Tour } from '@khazana/screens/components/Tour';
import { APP_NAME } from '@/lib/brand';
import type { ReactNode } from 'react';

/**
 * Fetches live prices, re-reads the vault, and records today's net-worth
 * snapshot.
 *
 * The fetch runs first and is allowed to fail: the reload and the snapshot are
 * local and must happen whether or not Yahoo answered. The label states what
 * this build will actually do, because the browser build cannot fetch at all
 * (see `lib/quotes/yahoo.ts`) and promising otherwise is a claim the user only
 * disproves by watching nothing change.
 */
function RefreshButton() {
  const reload = useApp((s) => s.reload);
  const captureSnapshot = useApp((s) => s.captureSnapshot);
  const { refresh } = usePriceRefresh();
  const [live] = useLivePrices();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const canFetch = live && quotesAvailable();

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      setNote(refreshMessage(await refresh()));
      await reload();
      await captureSnapshot();
    } finally {
      // Hold the spinner briefly even on a fast reload, so the click has a
      // visible result rather than appearing to do nothing.
      setTimeout(() => setBusy(false), 450);
    }
  };

  return (
    <IconBtn
      label={busy ? 'Refreshing…' : note ?? (canFetch
        ? 'Refresh — fetch live prices and record today’s snapshot'
        : 'Refresh — reload the vault and record today\u2019s snapshot')}
      onClick={() => void run()}
      className="hidden min-[1180px]:grid"
    >
      <RefreshCw size={17} className={busy ? 'animate-spin' : undefined} />
    </IconBtn>
  );
}

/** Downloads the encrypted .ftos backup — the same file Settings produces. */
function ExportButton() {
  const exportBackup = useApp((s) => s.exportBackup);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const b64 = await exportBackup();
      const url = URL.createObjectURL(new Blob([b64], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `khazana-backup-${new Date().toISOString().slice(0, 10)}.ftos`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <IconBtn label="Export an encrypted backup" onClick={() => void run()} className="hidden min-[1180px]:grid">
      <Download size={17} className={busy ? 'opacity-40' : undefined} />
    </IconBtn>
  );
}


/**
 * The offline app's shell: the shared frame (packages/screens-ts ShellFrame)
 * with the vault-only controls plugged in: price refresh, encrypted-backup
 * export, the notification driver, Lock, and the guided tour.
 */
export function Shell({ children }: { children: ReactNode }) {
  const lock = useApp((s) => s.lock);
  return (
    <ShellFrame
      appName={APP_NAME}
      Mark={BrandMark}
      Word={WordMark}
      footerNote="Encrypted on this device"
      actions={(
        <>
          {/* Only in a "Try demo" tab: labels the sample vault and offers the way out. */}
          {inDemo() && <DemoSessionBar compact />}
          <RefreshButton />
          <ExportButton />
          <NotificationsMenu useDriver={useNotificationDriver} />
        </>
      )}
      end={<IconBtn label="Lock vault" onClick={lock}><Lock size={16} /></IconBtn>}
      overlays={<Tour />}
    >
      {children}
    </ShellFrame>
  );
}
