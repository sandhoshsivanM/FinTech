'use client';

import { useEffect, useState } from 'react';
import { gateway } from '@/lib/api';
import { closePasskeyOffer, notePasskeyAdded, passkeyOfferOpen } from '@/lib/signInMethod';
import { passkeysSupported } from '@/lib/passkey';
import { Button, Card, ErrorText, LiveStatus, Muted, describe } from './ui';

/**
 * After signing in with a mobile number: offer a passkey, which is quicker
 * next time and is what approves removing a device. The server allows adding
 * one only within minutes of signing in, so the offer lapses with that window.
 */
export function PasskeyOffer() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setOpen(passkeyOfferOpen() && passkeysSupported());
  }, []);

  if (!open && !done) return null;

  async function add() {
    setBusy(true);
    setError(undefined);
    try {
      await gateway().addPasskey();
      notePasskeyAdded();
      setDone(true);
      setOpen(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'reauthentication_required'
          ? 'That took too long. Sign out and sign in again, then add the passkey.'
          : describe(err),
      );
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    closePasskeyOffer();
    setOpen(false);
  }

  return (
    <div className="mb-4">
      <Card title={done ? 'Passkey added' : 'Add a passkey for faster sign-in'}>
        {done ? (
          <Muted>Next time you can sign in with Face ID, Touch ID or your device PIN, and it can approve removing a device.</Muted>
        ) : (
          <>
            <Muted>
              You signed in with a mobile number. A passkey is quicker, can’t be intercepted like a text message, and is needed to remove a device.
            </Muted>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void add()}>Add a passkey</Button>
              <Button kind="quiet" disabled={busy} onClick={dismiss}>Not now</Button>
            </div>
          </>
        )}
        <LiveStatus>{busy ? 'Waiting for your passkey…' : ''}</LiveStatus>
        <ErrorText>{error}</ErrorText>
      </Card>
    </div>
  );
}
