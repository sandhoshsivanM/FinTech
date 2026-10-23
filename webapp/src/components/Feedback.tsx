'use client';
/**
 * "Help & feedback" — the Settings card and the small link on the Help page.
 *
 * Everything goes through the user's own mail app (a `mailto:` link) or their
 * clipboard, and only when they click. In the Tauri desktop app the webview has
 * no opener plugin, so a `mailto:` link would do nothing; there the address is
 * shown with a Copy button instead of a dead link.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Bug, Copy, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { FEEDBACK_EMAIL } from '@/lib/brand';
import { APP_VERSION, useApp } from '@/lib/store';
import { isTauri } from '@/lib/notify';
import { recentErrors } from '@/lib/errorLog';
import {
  feedbackMailto, problemMailto, problemReport, uaSummary, type FeedbackContext,
} from '@/lib/feedback';
import { GlassCard, SectionHeader, Button } from '@khazana/ui/ui';

const noopSubscribe = () => () => {};

/** True inside the desktop app. False during prerender, so hydration agrees. */
export function useIsTauri(): boolean {
  return useSyncExternalStore(noopSubscribe, isTauri, () => false);
}

/** The non-financial facts for a feedback message, read at the moment of use. */
export function currentFeedbackContext(themeChoice: string): FeedbackContext {
  const w = typeof window !== 'undefined' ? window : undefined;
  const resolved = typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined;
  return {
    version: APP_VERSION,
    channel: isTauri() ? 'desktop' : 'web',
    browser: uaSummary(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    viewport: w ? `${w.innerWidth}×${w.innerHeight}` : 'unknown',
    theme: resolved && resolved !== themeChoice ? `${themeChoice} (${resolved})` : themeChoice,
  };
}

/**
 * Copies inside the click handler (the user gesture the Clipboard API needs).
 * Returns false when the browser refuses, so the caller can fall back to
 * showing the text selected.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const linkBtn = clsx(
  'focus-ring inline-flex items-center justify-center gap-2 rounded-full h-9 px-4',
  'text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap',
  'btn-soft text-ink hover:border-line-strong transition-[border-color,transform] active:scale-[0.97]',
);

/**
 * A `mailto:` anchor whose href is rebuilt at click time, so a report always
 * carries the errors as of now. Before mount it holds the bare address, which
 * is what prerendered HTML can honestly say.
 */
function MailtoLink({ build, children, label }: {
  build: () => string; children: React.ReactNode; label: string;
}) {
  const [href, setHref] = useState(`mailto:${FEEDBACK_EMAIL}`);
  const buildRef = useRef(build);
  useEffect(() => { buildRef.current = build; });
  useEffect(() => { setHref(buildRef.current()); }, []);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const next = buildRef.current();
    e.currentTarget.href = next;
    setHref(next);
  };
  return (
    <a href={href} onClick={onClick} className={linkBtn} aria-label={label}>
      {children}
    </a>
  );
}

/** Address plus a Copy button: the desktop app's stand-in for a mailto link. */
function CopyAddress({ onCopied }: { onCopied: (ok: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[13px] font-medium text-ink select-all">{FEEDBACK_EMAIL}</span>
      <Button variant="soft" onClick={async () => onCopied(await copyText(FEEDBACK_EMAIL))}>
        <Copy size={15} /> Copy address
      </Button>
    </div>
  );
}

type Note = { kind: 'success' | 'error'; text: string };

/** The Settings → "Help & feedback" card. */
export function FeedbackCard() {
  const theme = useApp((s) => s.theme);
  const desktop = useIsTauri();
  const [note, setNote] = useState<Note | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  const ctx = () => currentFeedbackContext(theme);

  useEffect(() => {
    if (fallback && fallbackRef.current) {
      fallbackRef.current.focus();
      fallbackRef.current.select();
    }
  }, [fallback]);

  const copyReport = async () => {
    const report = problemReport(ctx(), recentErrors());
    if (await copyText(report)) {
      setFallback(null);
      setNote({ kind: 'success', text: `Problem report copied. Paste it into an email to ${FEEDBACK_EMAIL}.` });
    } else {
      setFallback(report);
      setNote({ kind: 'error', text: 'Copying was blocked. The report is selected below — press Ctrl+C or ⌘C.' });
    }
  };

  const addressCopied = (ok: boolean) =>
    setNote(ok
      ? { kind: 'success', text: 'Address copied.' }
      : { kind: 'error', text: `Copying was blocked. The address is ${FEEDBACK_EMAIL}.` });

  return (
    <GlassCard>
      <SectionHeader title="Help & feedback" info="settings.feedback" />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Send feedback</div>
            <div className="text-xs text-muted mt-0.5">
              {desktop
                ? 'Email us from your usual mail app. The app version helps, if you can include it.'
                : 'Opens your mail app with the app version and browser filled in. Nothing is sent until you press Send.'}
            </div>
          </div>
          {desktop ? (
            <CopyAddress onCopied={addressCopied} />
          ) : (
            <MailtoLink build={() => feedbackMailto(ctx())} label="Send feedback by email">
              <Mail size={15} /> Send feedback
            </MailtoLink>
          )}
        </div>

        <div className="pt-3 border-t border-[var(--glass-border)] flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Report a problem</div>
            <div className="text-xs text-muted mt-0.5">
              Includes recent error messages from this device, with numbers, emails and links stripped. Never your financial data — read it before you send.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!desktop && (
              <MailtoLink build={() => problemMailto(ctx(), recentErrors())} label="Report a problem by email">
                <Bug size={15} /> Report a problem
              </MailtoLink>
            )}
            <Button variant="soft" onClick={copyReport}>
              <Copy size={15} /> Copy problem report
            </Button>
          </div>
        </div>
      </div>

      {note && (
        <div
          role="status"
          className={clsx(
            'flex items-start gap-2 rounded-[var(--radius-panel)] px-3.5 py-2.5 text-sm mt-3',
            note.kind === 'success' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense',
          )}
        >
          {note.kind === 'success'
            ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span>{note.text}</span>
        </div>
      )}
      {fallback && (
        <textarea
          ref={fallbackRef}
          readOnly
          aria-label="Problem report"
          value={fallback}
          className="mt-3 w-full h-40 rounded-[var(--radius-panel)] border border-line bg-[var(--card-2)] p-3 font-mono text-[11.5px] text-ink-soft"
        />
      )}
    </GlassCard>
  );
}

/** The Help page's "Send feedback" link (or address + Copy on desktop). */
export function SendFeedbackLink() {
  const theme = useApp((s) => s.theme);
  const desktop = useIsTauri();
  const [copied, setCopied] = useState<boolean | null>(null);
  if (desktop) {
    return (
      <div className="grid gap-1.5">
        <CopyAddress onCopied={setCopied} />
        {copied !== null && (
          <span role="status" className="text-[12px] text-muted">
            {copied ? 'Address copied.' : 'Copying was blocked — select the address above.'}
          </span>
        )}
      </div>
    );
  }
  return (
    <MailtoLink build={() => feedbackMailto(currentFeedbackContext(theme))} label="Send feedback by email">
      <Mail size={15} /> Send feedback
    </MailtoLink>
  );
}
