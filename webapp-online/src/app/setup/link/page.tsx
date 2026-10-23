'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import qrcode from 'qrcode-generator';
import { keys } from '@/lib/account';
import { Button, Card, ErrorText, Muted, Page, describe } from '@/components/ui';

/** Another device of an existing account: get the data key by pairing or with the phrase. */
export default function LinkDevice() {
  const router = useRouter();
  const [pairing, setPairing] = useState<{ link: string; expiresAt: Date; qr: string }>();
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const cancelled = useRef(false);

  // Stop polling when the page goes away. Set on every mount: React may mount,
  // unmount and mount again (Strict Mode), and a flag left true stops the wait.
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function pair() {
    setBusy('pair');
    setError(undefined);
    try {
      const start = await keys().startPairing(window.location.origin);
      const qr = qrcode(0, 'M');
      qr.addData(start.link);
      qr.make();
      setPairing({ ...start, qr: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
      if (await keys().waitForApproval(start.expiresAt, () => cancelled.current)) router.replace('/home/');
      else if (!cancelled.current) setError('The pairing link expired. Start again.');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function recover() {
    setBusy('recover');
    setError(undefined);
    try {
      await keys().recover(phrase);
      router.replace('/home/');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Page
      title="Link this device"
      lead="Your account already has a data key. Bring it to this device from one that has it, or with your recovery phrase."
    >
      <Card title="Use another signed-in device">
        {!pairing ? (
          <>
            <Muted>Shows a QR code and a link. Open it on a device that already has your data.</Muted>
            <Button disabled={!!busy} onClick={pair}>{busy === 'pair' ? 'Starting…' : 'Pair with another device'}</Button>
          </>
        ) : (
          <>
            <div className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: pairing.qr }} />
            <Muted>Scan with the other device’s camera, or open this link there:</Muted>
            <input readOnly value={pairing.link} onFocus={(e) => e.target.select()} data-testid="pairing-link"
              className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface)', color: 'var(--ink)' }} />
            <Button kind="quiet" onClick={() => navigator.clipboard?.writeText(pairing.link)}>Copy link</Button>
            <Muted>Waiting for approval… (expires {pairing.expiresAt.toLocaleTimeString()})</Muted>
          </>
        )}
      </Card>

      <Card title="Enter your recovery phrase">
        <textarea
          aria-label="Recovery phrase"
          rows={4}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="24 words, in order"
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--surface)', color: 'var(--ink)' }}
        />
        <Button kind="quiet" disabled={!!busy || phrase.trim().split(/\s+/).length < 24} onClick={recover}>
          {busy === 'recover' ? 'Opening your key (a few seconds)…' : 'Use recovery phrase'}
        </Button>
      </Card>

      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
