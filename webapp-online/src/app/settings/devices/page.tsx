'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { gateway } from '@/lib/api';
import { Devices, ago, platformLabel, MAX_NAME, type Device } from '@/lib/devices';
import { useReady } from '@/lib/useReady';
import { Button, Card, ErrorText, Muted, Page, describe } from '@/components/ui';

export default function DevicesPage() {
  const { ready, error } = useReady();
  const api = useMemo(() => new Devices(gateway()), []);
  const [devices, setDevices] = useState<Device[]>();
  const [renaming, setRenaming] = useState<string>();
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const load = useCallback(() => api.list().then(setDevices).catch((e) => setProblem(describe(e))), [api]);
  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setProblem(undefined);
    try {
      await work();
      await load();
    } catch (e) {
      setProblem(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Devices" lead="Every device signed in to this account. Each holds its own copy of your data key.">
      <Link href="/settings/" className="text-sm underline">Back to settings</Link>
      {ready && devices === undefined && !problem && <Muted>Loading devices…</Muted>}
      {devices?.map((d) => (
        <Card key={d.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium" data-testid={`device-${d.id}`}>
              {d.name}
              {d.current && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--surface)' }}>This device</span>
              )}
            </p>
            <Muted>{platformLabel(d.platform)}{d.app_version ? ` · ${d.app_version}` : ''}</Muted>
          </div>
          <Muted>Added {new Date(d.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} · Last seen {d.current ? 'now' : ago(d.last_seen_at)}</Muted>

          {renaming === d.id ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await api.rename(d.id, name);
                  setRenaming(undefined);
                });
              }}
            >
              <input aria-label="Device name" required maxLength={MAX_NAME} value={name} onChange={(e) => setName(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--ink)' }} />
              <div className="flex gap-2">
                <Button kind="quiet" type="button" onClick={() => setRenaming(undefined)}>Cancel</Button>
                <Button type="submit" disabled={busy}>Save name</Button>
              </div>
            </form>
          ) : confirming === d.id ? (
            <div className="flex flex-col gap-2">
              <Muted>
                {d.current
                  ? 'This signs you out here and removes this device’s copy of your data key.'
                  : 'It is signed out at once and loses its copy of your data key. You will be asked for your passkey.'}
              </Muted>
              <div className="flex gap-2">
                <Button kind="quiet" onClick={() => setConfirming(undefined)}>Keep</Button>
                <Button
                  disabled={busy}
                  onClick={() => act(async () => {
                    await api.remove(d.id);
                    setConfirming(undefined);
                    if (d.current) window.location.replace('/sign-in/');
                  })}
                >
                  Confirm with passkey and remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button kind="quiet" onClick={() => { setRenaming(d.id); setName(d.name); setConfirming(undefined); }}>Rename</Button>
              <Button kind="quiet" onClick={() => { setConfirming(d.id); setRenaming(undefined); }}>Remove</Button>
            </div>
          )}
        </Card>
      ))}
      <Muted>
        Removing a device ends its sign-in and deletes its copy of the data key, so it cannot reach your account again.
        It may still hold data it already downloaded; the data key itself is not changed.
      </Muted>
      <ErrorText>{problem ?? error}</ErrorText>
    </Page>
  );
}
