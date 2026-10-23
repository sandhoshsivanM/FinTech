// The few building blocks the online app's pages share, on the shared tokens.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Page({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {lead && <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: 'var(--card)' }}>
      {title && <h2 className="font-medium">{title}</h2>}
      {children}
    </article>
  );
}

export function Button({ kind = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'quiet' }) {
  const style = kind === 'primary'
    ? { background: 'var(--primary)', color: 'var(--primary-fg)' }
    : { background: 'var(--surface)', color: 'var(--ink)' };
  return <button {...props} className={`rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${props.className ?? ''}`} style={style} />;
}

export const Muted = ({ children }: { children: ReactNode }) => (
  <p className="text-sm" style={{ color: 'var(--muted)' }}>{children}</p>
);

export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <p role="alert" className="text-sm" style={{ color: 'var(--color-data-rose)' }}>{children}</p> : null;

/** A user-facing sentence for anything a page's action threw. */
export function describe(err: unknown): string {
  if (err instanceof Error && err.name === 'NotAllowedError') return 'The passkey prompt was closed or timed out. Try again.';
  if (err instanceof Error && err.constructor.name === 'PasskeyCancelled') return 'The passkey prompt was closed. Try again.';
  if (err instanceof Error && 'status' in err) return `The server refused that (${(err as Error & { status: number }).status}${'code' in err && err.code ? ` ${err.code}` : ''}).`;
  if (err instanceof TypeError) return 'The server could not be reached. Check your connection.';
  return err instanceof Error ? err.message : 'Something went wrong.';
}
