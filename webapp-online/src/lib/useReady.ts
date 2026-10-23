'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureReady } from './account';
import { startSync } from './store';

/** For pages that show data: signed in, key unlocked, sync started; otherwise sent where they belong. */
export function useReady(): { ready: boolean; error?: string } {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    ensureReady()
      .then(async (r) => {
        if (r !== 'ready') return router.replace(r === 'signed-out' ? '/sign-in/' : '/setup/');
        await startSync();
        setReady(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [router]);
  return { ready, error };
}
