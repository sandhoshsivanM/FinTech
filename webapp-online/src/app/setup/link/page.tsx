'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import qrcode from 'qrcode-generator';
import { keys } from '@/lib/account';
import { Button, Card, ErrorText, LiveStatus, Muted, Page, describe } from '@/components/ui';

const PHRASE_WORDS = 24;

/** Another device of an existing account: get the data key by pairing or with the phrase. */
export default function LinkDevice() {
  const router = useRouter();
  const [pairing, setPairing] = useState<{ link: string; expiresAt: Date; qr: string }>();
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [copied, setCopied] = useState<'yes' | 'no'>();
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
    setCopied(undefined);
    try {
      const start = await keys().startPairing(window.location.origin);
      const qr = qrcode(0, 'M');
      qr.addData(start.link);
      qr.make();
      setPairing({ ...start, qr: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) });
      if (await keys().waitForApproval(start.expiresAt, () => cancelled.current)) router.replace('/dashboard/');
      else if (!cancelled.current) {
        // Back to the start, so the user can request a new link without reloading the page.
        setPairing(undefined);
        setError('The pairing link expired. Start again to get a new one.');
      }
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }

  async function recover() {
    setBusy('recover');
    setError(undefined);
    try {
      await keys().recover(phrase);
      router.replace('/dashboard/');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(undefined);
    }
  }

  const wordsEntered = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;

  return (
    <Page
      title="Link this device"
      lead="Your account already has a data key. Bring it to this device from one that has it, or with your recovery phrase."
    >
      <Card title="Use another signed-in device">
        {!pairing ? (
          <>
            <Muted>Shows a QR code and a link. Open it on a device that already has your data.</Muted>
            <Button disabled={!!busy} onClick={pair}>Pair with another device</Button>
            <LiveStatus>{busy === 'pair' ? 'Starting…' : ''}</LiveStatus>
          </>
        ) : (
          <>
            {/* The QR code is a picture of the link below, so the link is the text alternative. */}
            <div role="img" aria-label="QR code of the pairing link. The same link is in the box below."
              className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: pairing.qr }} />
            <Muted>Scan with the other device’s camera, or open this link there:</Muted>
            <input readOnly aria-label="Pairing link" value={pairing.link} onFocus={(e) => e.target.select()} data-testid="pairing-link"
              className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--surface)', color: 'var(--ink)' }} />
            <Button kind="quiet" onClick={() => void copy(pairing.link)}>Copy link</Button>
            <LiveStatus>{copied === 'yes' ? 'Link copied.' : copied === 'no' ? 'Could not copy. Select the link above and copy it yourself.' : ''}</LiveStatus>
            <Muted>Waiting for approval… (expires {pairing.expiresAt.toLocaleTimeString()})</Muted>
          </>
        )}
      </Card>

      <Card title="Enter your recovery phrase">
        <textarea
          aria-label="Recovery phrase"
          aria-describedby="phrase-hint"
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
        <p id="phrase-hint" className="text-sm" style={{ color: 'var(--muted)' }}>
          {wordsEntered} of {PHRASE_WORDS} words entered. Separate them with spaces.
        </p>
        <Button kind="quiet" disabled={!!busy || wordsEntered < PHRASE_WORDS} onClick={recover}>Use recovery phrase</Button>
        <LiveStatus>{busy === 'recover' ? 'Opening your key (a few seconds)…' : ''}</LiveStatus>
      </Card>

      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
