'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gateway } from '@/lib/api';
import { passkeysSupported } from '@/lib/passkey';
import { Button, Card, ErrorText, Muted, Page, describe } from '@/components/ui';

// The development provider exists only in local and test backends; a
// production build never shows it.
const devSignIn = process.env.NEXT_PUBLIC_DEV_SIGN_IN === 'true';

export default function SignIn() {
  const router = useRouter();
  const [subject, setSubject] = useState('dev:me');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(undefined);
    try {
      await action();
      router.replace('/setup/');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(undefined);
    }
  }

  const supported = typeof window === 'undefined' || passkeysSupported();

  return (
    <Page
      title="Khazana Online"
      lead="Your money on every device, end-to-end encrypted. Want no account at all? Use the offline Khazana app instead."
    >
      <Card>
        <Button disabled={!!busy || !supported} onClick={() => run('create', () => gateway().signUpWithPasskey())}>
          {busy === 'create' ? 'Waiting for your passkey…' : 'Create account with a passkey'}
        </Button>
        <Button kind="quiet" disabled={!!busy || !supported} onClick={() => run('sign-in', () => gateway().signInWithPasskey())}>
          {busy === 'sign-in' ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
        </Button>
        <Muted>
          {supported
            ? 'A passkey is Face ID, Touch ID or your device PIN. No password, no email.'
            : 'This browser doesn’t support passkeys. Try Safari, Chrome or Firefox.'}
        </Muted>
      </Card>

      {devSignIn && (
        <Card title="Development sign-in">
          <input
            aria-label="Development subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--surface)', color: 'var(--ink)' }}
          />
          <Button kind="quiet" disabled={!!busy || !subject.startsWith('dev:')} onClick={() => run('dev', () => gateway().signIn('dev', subject))}>
            Sign in (development)
          </Button>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
