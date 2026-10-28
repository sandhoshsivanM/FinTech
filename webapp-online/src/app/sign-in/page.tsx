'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gateway } from '@/lib/api';
import { googleClientId, renderGoogleButton } from '@/lib/google';
import { passkeysSupported } from '@/lib/passkey';
import { isCode, isValidIndianMobile, nationalNumber, phoneProblem, toE164 } from '@/lib/phoneSignIn';
import { rememberSignIn } from '@/lib/signInMethod';
import { Button, Card, ErrorText, LiveStatus, Muted, Page, describe } from '@/components/ui';

// The development provider exists only in local and test backends; a
// production build never shows it.
const devSignIn = process.env.NEXT_PUBLIC_DEV_SIGN_IN === 'true';

const BUSY_TEXT: Record<string, string> = {
  create: 'Waiting for your passkey…',
  'sign-in': 'Waiting for your passkey…',
  google: 'Signing in with Google…',
  dev: 'Signing in…',
  'phone-send': 'Sending the code…',
  'phone-verify': 'Checking the code…',
};

type CodeStage = { challengeId: string; demoCode?: string; resendAt: number };

export default function SignIn() {
  const router = useRouter();
  const [subject, setSubject] = useState('dev:me');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  // Mobile number: the number, then the texted code.
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<CodeStage>();
  const [now, setNow] = useState(() => Date.now());
  const codeField = useRef<HTMLInputElement>(null);
  const digits = nationalNumber(phone);

  async function run(label: string, action: () => Promise<unknown>, method: 'phone' | 'other' = 'other') {
    setBusy(label);
    setError(undefined);
    try {
      await action();
      rememberSignIn(method);
      router.replace('/setup/');
    } catch (err) {
      setError(label.startsWith('phone') ? phoneProblem(err, describe) : describe(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function sendCode() {
    setBusy('phone-send');
    setError(undefined);
    try {
      const c = await gateway().startPhoneSignIn(toE164(digits));
      setStage({ challengeId: c.challenge_id, demoCode: c.demo_code, resendAt: Date.now() + c.resend_after * 1000 });
      setCode('');
    } catch (err) {
      setError(phoneProblem(err, describe));
    } finally {
      setBusy(undefined);
    }
  }

  // The resend countdown ticks once a second, only while a code is waiting.
  useEffect(() => {
    if (!stage) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stage]);

  // The field that led here is gone; move focus to the code field.
  useEffect(() => {
    if (stage) codeField.current?.focus();
  }, [stage?.challengeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resendIn = stage ? Math.max(0, Math.ceil((stage.resendAt - now) / 1000)) : 0;

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
      <Card title="Continue with mobile number">
        {!stage ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (isValidIndianMobile(digits)) void sendCode();
              else setError('Enter a valid 10-digit Indian mobile number.');
            }}
          >
            <label className="flex flex-col gap-1 text-sm" htmlFor="phone">
              Mobile number
            </label>
            <div className="flex items-center gap-2">
              <span className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--ink)' }} aria-hidden="true">+91</span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                aria-describedby="phone-hint"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--surface)', color: 'var(--ink)' }}
              />
            </div>
            <p id="phone-hint" className="text-sm" style={{ color: 'var(--muted)' }}>
              We text you a 6-digit code. Your money data is never opened by a text: that needs your recovery phrase or another device.
            </p>
            <Button type="submit" disabled={!!busy}>Send code</Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isCode(code)) return setError('Enter the 6-digit code.');
              void run('phone-verify', () => gateway().signInWithPhone(stage.challengeId, code), 'phone');
            }}
          >
            <p className="text-sm">We sent a 6-digit code to +91 {digits}.</p>
            {stage.demoCode && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>
                Demo code: <strong data-testid="demo-code">{stage.demoCode}</strong>
                <span className="block" style={{ color: 'var(--muted)' }}>This demo shows the code here instead of texting it.</span>
              </p>
            )}
            <label className="text-sm" htmlFor="otp">6-digit code</label>
            <input
              id="otp"
              ref={codeField}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="rounded-lg px-3 py-2 text-sm tracking-widest"
              style={{ background: 'var(--surface)', color: 'var(--ink)' }}
            />
            <Button type="submit" disabled={!!busy}>Sign in</Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button kind="quiet" disabled={!!busy || resendIn > 0} onClick={() => void sendCode()}>Resend code</Button>
              <Button kind="quiet" disabled={!!busy} onClick={() => { setStage(undefined); setError(undefined); }}>Change number</Button>
            </div>
            {resendIn > 0 && <Muted>You can ask for a new code in {resendIn} s.</Muted>}
          </form>
        )}
      </Card>

      <Card title="Other ways to sign in">
        <Button kind="quiet" disabled={!!busy || !supported} onClick={() => run('create', () => gateway().signUpWithPasskey())}>
          Create account with a passkey
        </Button>
        <Button kind="quiet" disabled={!!busy || !supported} onClick={() => run('sign-in', () => gateway().signInWithPasskey())}>
          Sign in with a passkey
        </Button>
        {googleClientId && <div className="flex justify-center" ref={googleButton} data-testid="google-button" />}
        <Muted>
          {supported
            ? 'A passkey is Face ID, Touch ID or your device PIN. No password, no email, and it can’t be intercepted like a text message.'
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

      <LiveStatus>{busy ? BUSY_TEXT[busy] : ''}</LiveStatus>
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
