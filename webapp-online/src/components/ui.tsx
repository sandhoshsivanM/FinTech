// The few building blocks the online-only pages share (sign-in, setup, pairing, cards, devices),
// built on the same Zentra components as the shared screens so the whole app reads as one.
import { useEffect, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { GlassCard, PageIntro, buttonClass } from '@khazana/ui/ui';

const APP_NAME = 'Khazana Online';

/**
 * Each page sets its own document title, so tabs, history and screen readers say where you are (WCAG 2.4.2).
 * docTitle defaults to the heading; pass it when the heading is the brand name.
 */
export function Page({ title, docTitle = title, lead, children }: { title: string; docTitle?: string; lead?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = docTitle === APP_NAME ? APP_NAME : `${docTitle} · ${APP_NAME}`;
  }, [docTitle]);
  return (
    <section className="online-plain flex flex-col gap-5">
      <PageIntro title={title} subtitle={lead} />
      {children}
    </section>
  );
}

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <GlassCard className="flex flex-col gap-3">
      {title && <h2 className="text-[16px] font-medium tracking-[-0.01em]">{title}</h2>}
      {children}
    </GlassCard>
  );
}

export function Button({
  kind = 'primary',
  type = 'button',
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'quiet'; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} type={type} {...props} className={buttonClass(kind === 'primary' ? 'primary' : 'soft', props.className)} />
  );
}

export const Muted = ({ children }: { children: ReactNode }) => (
  <p className="text-sm" style={{ color: 'var(--muted)' }}>{children}</p>
);

/**
 * A status line that screen readers announce when its text changes (WCAG 4.1.3).
 * Keep it mounted: a live region that is added with its text is often not announced.
 */
export const LiveStatus = ({ children }: { children?: ReactNode }) => (
  <p role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--muted)' }}>{children}</p>
);

/**
 * A failure, announced at once. The text is the dark ink colour; the rose bar is decorative.
 * Rose text on the page is only 3.3:1, too low for small text, so the colour carries the bar, not the words.
 */
export const ErrorText = ({ children }: { children?: ReactNode }) =>
  children ? (
    <div role="alert" className="flex items-start gap-2 text-sm">
      <span aria-hidden="true" className="mt-0.5 h-4 w-1 shrink-0 rounded-full" style={{ background: 'var(--danger)' }} />
      <p style={{ color: 'var(--ink)' }}>{children}</p>
    </div>
  ) : null;

/** A user-facing sentence for anything a page's action threw. */
export function describe(err: unknown): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'The passkey prompt was closed or timed out. Try again.';
  if (err instanceof Error && err.constructor.name === 'PasskeyCancelled') return 'The passkey prompt was closed. Try again.';
  if (err instanceof Error && 'status' in err) return `The server refused that (${(err as Error & { status: number }).status}${'code' in err && err.code ? ` ${err.code}` : ''}).`;
  if (err instanceof TypeError) return 'The server could not be reached. Check your connection.';
  return err instanceof Error ? err.message : 'Something went wrong.';
}
