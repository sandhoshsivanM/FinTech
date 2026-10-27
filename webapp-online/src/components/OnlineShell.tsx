'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Download, LogOut, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { BrandMark, WordMark } from '@khazana/screens/components/BrandMark';
import { NotificationsMenu } from '@khazana/screens/components/NotificationsMenu';
import { IconBtn, ShellFrame } from '@khazana/screens/components/ShellFrame';
import { Tour } from '@khazana/screens/components/Tour';
import { useApp } from '@khazana/screens/store';
import { signOutEverywhereLocal } from '@/lib/account';
import { ONLINE_NAV_GROUPS, ONLINE_TITLES } from '@/lib/onlineNav';
import { syncNow } from '@/lib/store';
import { SyncPill } from './SyncPill';

/** Online's wording for the two tour steps that would otherwise promise things only the offline vault can. */
const TOUR_OVERRIDES = {
  '[data-tour="nav-settings"]': { body: 'Appearance (themes & accents), profiles, display currency, your devices, sign out, and exporting your data.' },
  '[data-tour="ghost"]': { body: 'One tap hides every amount on screen. Everything is encrypted on this device before it syncs.' },
};

/** Fetches what other devices wrote, then re-reads the books and records today's snapshot. */
function SyncButton() {
  const captureSnapshot = useApp((s) => s.captureSnapshot);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await syncNow();
      await captureSnapshot();
    } finally {
      setTimeout(() => setBusy(false), 450);
    }
  };
  return (
    <IconBtn label={busy ? 'Syncing…' : 'Sync now and record today’s snapshot'} onClick={() => void run()} className="hidden min-[1180px]:grid">
      <RefreshCw size={17} className={busy ? 'animate-spin' : undefined} />
    </IconBtn>
  );
}

/** Opens the full-data export in Settings. */
function ExportLink() {
  return (
    <Link
      href="/settings"
      title="Export your data (Settings)"
      aria-label="Export your data (Settings)"
      className="focus-ring hidden min-[1180px]:grid w-9 h-9 shrink-0 place-items-center rounded-[var(--radius-card)] text-ink-soft hover:bg-fill hover:text-ink transition-colors duration-150"
    >
      <Download size={17} />
    </Link>
  );
}

async function signOut() {
  await signOutEverywhereLocal().catch(() => undefined);
  window.location.replace('/sign-in/');
}

/**
 * Khazana Online's shell: the shared frame with the sync pill, Devices & pairing
 * and Sign out plugged in. No PIN, lock or backup: the account and the end-to-end
 * keys take their place.
 */
export function OnlineShell({ children }: { children: ReactNode }) {
  return (
    <ShellFrame
      appName="Khazana Online"
      Mark={BrandMark}
      Word={WordMark}
      footerNote="End-to-end encrypted"
      navGroups={ONLINE_NAV_GROUPS}
      titles={ONLINE_TITLES}
      actions={(
        <>
          <SyncPill />
          <SyncButton />
          <ExportLink />
          <NotificationsMenu />
        </>
      )}
      end={<IconBtn label="Sign out" onClick={() => void signOut()}><LogOut size={16} /></IconBtn>}
      profileMenuExtra={(close) => (
        <>
          <Link
            href="/settings/devices"
            onClick={close}
            className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-card)] text-[13px] font-medium text-ink-soft hover:bg-fill transition-colors"
          >
            <MonitorSmartphone size={15} /> Devices &amp; pairing
          </Link>
          <button
            type="button"
            onClick={() => { close(); void signOut(); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-card)] text-[13px] font-medium text-ink-soft hover:bg-fill transition-colors text-left"
          >
            <LogOut size={15} /> Sign out
          </button>
        </>
      )}
      overlays={<Tour overrides={TOUR_OVERRIDES} />}
    >
      {children}
    </ShellFrame>
  );
}
