'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureReady, signOutEverywhereLocal } from '@/lib/account';
import { Button, Card, ErrorText, Muted, Page, describe } from '@/components/ui';

const SECTIONS = [
  { title: 'Accounts', body: 'Bank accounts, cards and cash, synced across your devices.' },
  { title: 'Cards', body: 'Due dates and savings from the cards you already have.' },
  { title: 'Connections', body: 'Your devices, and the banks you link.' },
];

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    ensureReady()
      .then((r) => (r === 'ready' ? setReady(true) : router.replace(r === 'signed-out' ? '/sign-in/' : '/setup/')))
      .catch((err) => setError(describe(err)));
  }, [router]);

  async function signOut() {
    await signOutEverywhereLocal().catch(() => undefined);
    router.replace('/sign-in/');
  }

  return (
    <Page title="Khazana Online">
      <div className="flex items-center justify-between">
        <Muted>
          {ready ? (
            <span data-testid="key-status">🔒 This device holds your data key. Everything is encrypted before it leaves it.</span>
          ) : 'Unlocking…'}
        </Muted>
        <Button kind="quiet" onClick={signOut}>Sign out</Button>
      </div>
      {SECTIONS.map((s) => (
        <Card key={s.title} title={s.title}>
          <Muted>{s.body}</Muted>
        </Card>
      ))}
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
