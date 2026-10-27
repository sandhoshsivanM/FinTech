'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { gateway } from '@/lib/api';
import { LiveStatus, Page } from '@/components/ui';

/** Signed in: setup decides (it goes straight home when this device is ready). Otherwise sign-in. */
export default function Start() {
  const router = useRouter();
  useEffect(() => {
    gateway().isSignedIn().then((yes) => router.replace(yes ? '/setup/' : '/sign-in/'));
  }, [router]);
  return (
    <Page title="Khazana Online">
      <LiveStatus>Opening Khazana Online…</LiveStatus>
    </Page>
  );
}
