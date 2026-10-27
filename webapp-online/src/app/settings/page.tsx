'use client';

import Link from 'next/link';
import { useReady } from '@/lib/useReady';
import { Card, ErrorText, Muted, Page } from '@/components/ui';

export default function Settings() {
  const { ready, error } = useReady();
  return (
    <Page title="Settings">
      <Link href="/home/" className="text-sm underline">Back to accounts</Link>
      {ready && (
        <>
          <Card title="Devices">
            <Muted>See where your account is signed in, rename a device, or sign one out.</Muted>
            <Link href="/settings/devices/" className="text-sm font-medium underline">Manage devices</Link>
          </Card>
          <Card title="Connections">
            <Muted>Coming later. Linking a bank or a card issuer is not available yet.</Muted>
          </Card>
        </>
      )}
      {!ready && !error && <Muted>Unlocking your data…</Muted>}
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
