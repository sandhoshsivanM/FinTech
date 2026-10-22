'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, gateway } from '@/lib/api';

// The development provider exists only in local and test backends; a
// production build never shows it.
const devSignIn = process.env.NEXT_PUBLIC_DEV_SIGN_IN === 'true';

export default function SignIn() {
  const router = useRouter();
  const [subject, setSubject] = useState('dev:me');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function signInDev(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await gateway().signIn('dev', subject);
      router.replace('/home/');
    } catch (err) {
      setError(err instanceof ApiError ? `Sign-in refused (${err.message}).` : 'The server could not be reached.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Khazana Online</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Your money on every device, end-to-end encrypted. Want no account at all? Use the offline Khazana app instead.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <button disabled className="rounded-full px-4 py-3 text-sm opacity-50" style={{ background: 'var(--card)' }}>
          Continue with Google (coming soon)
        </button>
        <button disabled className="rounded-full px-4 py-3 text-sm opacity-50" style={{ background: 'var(--card)' }}>
          Sign in with a passkey (coming soon)
        </button>
      </div>

      {devSignIn && (
        <form onSubmit={signInDev} className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: 'var(--card)' }}>
          <label htmlFor="subject" className="text-sm font-medium">Development sign-in</label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--surface)', color: 'var(--ink)' }}
          />
          <button
            type="submit"
            disabled={busy || !subject.startsWith('dev:')}
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-data-rose)' }}>{error}</p>}
    </section>
  );
}
