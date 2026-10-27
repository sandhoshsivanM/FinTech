'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gateway } from '@/lib/api';
import { googleClientId, renderGoogleButton } from '@/lib/google';
import { passkeysSupported } from '@/lib/passkey';
import { Button, Card, ErrorText, LiveStatus, Muted, Page, describe } from '@/components/ui';

// The development provider exists only in local and test backends; a
// production build never shows it.
const devSignIn = process.env.NEXT_PUBLIC_DEV_SIGN_IN === 'true';

const BUSY_TEXT: Record<string, string> = {
  create: 'Waiting for your passkey…',
  'sign-in': 'Waiting for your passkey…',
  google: 'Signing in with Google…',
  dev: 'Signing in…',
};

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

  // Google's button, bound to this device's key (the token's nonce).
  const googleButton = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!googleClientId || !googleButton.current) return;
    const el = googleButton.current;
    gateway()
      .dpopThumbprint()
      .then((nonce) => renderGoogleButton(el, nonce, (idToken) => void run('google', () => gateway().signInWithGoogle(idToken))))
      .catch((err) => setError(describe(err)));
    // run is stable enough for a one-time render; re-rendering the button would reset Google's state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page
      title="Khazana Online"
      docTitle="Sign in"
      lead="Your money on every device, end-to-end encrypted. Want no account at all? Use the offline Khazana app instead."
    >
      <Card>
        <Button disabled={!!busy || !supported} onClick={() => run('create', () => gateway().signUpWithPasskey())}>
          Create account with a passkey
        </Button>
        <Button kind="quiet" disabled={!!busy || !supported} onClick={() => run('sign-in', () => gateway().signInWithPasskey())}>
          Sign in with a passkey
        </Button>
        {googleClientId && <div className="flex justify-center" ref={googleButton} data-testid="google-button" />}
        <LiveStatus>{busy ? BUSY_TEXT[busy] : ''}</LiveStatus>
        <Muted>
          {supported
            ? 'A passkey is Face ID, Touch ID or your device PIN. No password, no email.'
            : 'This browser doesn’t support passkeys. Try Safari, Chrome or Firefox.'}
        </Muted>
      </Card>

      {devSignIn && (
        <Card title="Development sign-in">
          <label className="flex flex-col gap-1 text-sm">
            Development subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--surface)', color: 'var(--ink)' }}
            />
          </label>
          <Button kind="quiet" disabled={!!busy || !subject.startsWith('dev:')} onClick={() => run('dev', () => gateway().signIn('dev', subject))}>
            Sign in (development)
          </Button>
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
