'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureReady, keys } from '@/lib/account';
import { ErrorText, Muted, Page, describe } from '@/components/ui';

/**
 * Decides what this device needs after signing in: nothing (go home), a new
 * account key (first device), or a link to the key it already has (pair or
 * recovery phrase).
 */
export default function Setup() {
  const router = useRouter();
  const [error, setError] = useState<string>();

  useEffect(() => {
    (async () => {
      const readiness = await ensureReady();
      if (readiness === 'signed-out') return router.replace('/sign-in/');
      if (readiness === 'ready') return router.replace('/home/');
      const status = await keys().status();
      router.replace(status.account_has_keys ? '/setup/link/' : '/setup/new/');
    })().catch((err) => setError(describe(err)));
  }, [router]);

  return (
    <Page title="Setting up this device">
      <Muted>Registering this device and checking for your data key…</Muted>
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
