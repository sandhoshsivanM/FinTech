'use client';
/**
 * Settings → "Bank SMS on this Mac", and the poller that runs while unlocked.
 *
 * Both render nothing outside the macOS desktop app.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { Button, GlassCard, SectionHeader, Toggle } from '@khazana/ui/ui';
import {
  FIRST_READ_DAYS, POLL_MS, macSmsAvailable, openFullDiskAccessSettings, pollMacSms,
  setMacSmsEnabled, useMacSms,
} from '@/lib/macSms';

/** Polls every minute and when the window regains focus. Mount inside the unlocked app only. */
export function MacSmsDriver() {
  const enabled = useMacSms((s) => s.enabled);
  const addCaptures = useApp((s) => s.addCaptures);
  useEffect(() => {
    if (!enabled || !macSmsAvailable()) return;
    const run = () => void pollMacSms(addCaptures);
    run();
    const id = setInterval(run, POLL_MS);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', run);
    };
  }, [enabled, addCaptures]);
  return null;
}

/**
 * Decided after mount: the page is prerendered without Tauri, so checking
 * during render would make the first client paint disagree with the HTML.
 */
export function MacSmsCard() {
  const [available, setAvailable] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a platform check that only exists on the client
  useEffect(() => setAvailable(macSmsAvailable()), []);
  if (!available) return null;
  return (
    <GlassCard>
      <SectionHeader title="Bank SMS on this Mac" />
      <MacSmsSection />
    </GlassCard>
  );
}

function MacSmsSection() {
  const { enabled, status, lastRunAt, lastAdded } = useMacSms();
  const addCaptures = useApp((s) => s.addCaptures);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          <p className="fs-14 font-medium text-ink">Read bank SMS from Messages</p>
          <p className="text-xs text-muted leading-relaxed mt-1">
            Bank alerts your iPhone forwards to this Mac go to{' '}
            <Link href="/capture" className="text-accent font-semibold">Review</Link>, where you approve
            each one. Only received SMS from bank sender IDs are read — never messages from a phone number
            or email address — and only the amount, merchant, date and reference are kept. The first read
            reaches back {FIRST_READ_DAYS} days.
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <Toggle on={enabled} onChange={setMacSmsEnabled} label="Read bank SMS from Messages" />
        </div>
      </div>

      {enabled && status === 'no_access' && (
        <div className="text-xs leading-relaxed rounded-[14px] border border-line p-3 space-y-2">
          <p className="text-danger font-medium">Khazana needs Full Disk Access to read Messages.</p>
          <p className="text-muted">
            In System Settings, open Privacy &amp; Security → Full Disk Access, switch on Khazana, then
            reopen the app. macOS asks for this for any app that reads Messages; it is the only way in.
          </p>
          <Button variant="secondary" onClick={() => void openFullDiskAccessSettings()}>Open System Settings</Button>
        </div>
      )}

      {enabled && status !== 'no_access' && (
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
          <span role="status">
            {status === 'reading' ? 'Reading…'
              : status === 'error' ? 'The last read failed. It will try again in a minute.'
              : lastRunAt ? `Checked ${new Date(lastRunAt).toLocaleTimeString()} · ${lastAdded} new`
              : 'Waiting for the first read.'}
          </span>
          <Button variant="ghost" onClick={() => void pollMacSms(addCaptures)} disabled={status === 'reading'}>
            Check now
          </Button>
        </div>
      )}

      <div className="text-xs text-muted leading-relaxed pt-3 border-t border-[var(--line)]">
        <b className="text-ink font-semibold">Setting it up.</b> On the iPhone: Settings → Apps → Messages →
        Text Message Forwarding, and switch on this Mac. Messages on the Mac must be signed in to the same
        Apple Account.
      </div>
    </div>
  );
}
