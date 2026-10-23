'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureReady, keys } from '@/lib/account';
import { Button, Card, ErrorText, Muted, Page, describe } from '@/components/ui';

type Target = Awaited<ReturnType<ReturnType<typeof keys>['inspectPairing']>>;

/**
 * Opened on a device that has the data key, from a pairing link. It checks the
 * new device's key against the fingerprint in the link (which never reached
 * the server) before sealing anything to it.
 */
export default function Pair() {
  const router = useRouter();
  const [target, setTarget] = useState<Target>();
  const [link, setLink] = useState<{ id: string; code: string; h: string }>();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const f = new URLSearchParams(window.location.hash.slice(1));
    const id = f.get('id'), code = f.get('code'), h = f.get('h');
    if (!id || !code || !h) return setError('This pairing link is incomplete. Copy the whole link from the new device.');
    setLink({ id, code, h });
    (async () => {
      const readiness = await ensureReady();
      if (readiness === 'signed-out') return setError('Sign in on this device first, then open the link again.');
      if (readiness !== 'ready') return setError('This device doesn’t have your data key yet, so it can’t share it.');
      setTarget(await keys().inspectPairing(id, h));
    })().catch((err) => setError(describe(err)));
  }, []);

  async function approve() {
    if (!link || !target) return;
    setBusy(true);
    try {
      await keys().approvePairing(link.id, link.code, target);
      setDone(true);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Approve a new device">
      {target && !done && (
        <Card>
          <p className="text-sm">
            <strong>{target.name}</strong> ({target.platform}) is asking for your data key.
          </p>
          <Muted>Its key matches this link. Approve only if you just started pairing on that device yourself.</Muted>
          <div className="flex gap-2">
            <Button kind="quiet" onClick={() => router.replace('/home/')}>Cancel</Button>
            <Button disabled={busy} onClick={approve}>{busy ? 'Approving…' : 'Approve'}</Button>
          </div>
        </Card>
      )}
      {done && (
        <Card>
          <p className="text-sm">Done. The new device is opening your data now.</p>
          <Button kind="quiet" onClick={() => router.replace('/home/')}>Back to Khazana Online</Button>
        </Card>
      )}
      {!target && !error && !done && <Muted>Checking the device asking to pair…</Muted>}
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
