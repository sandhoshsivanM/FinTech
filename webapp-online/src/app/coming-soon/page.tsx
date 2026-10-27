'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Muted, Page } from '@/components/ui';

function Soon() {
  const what = useSearchParams().get('what') === 'offers' ? 'Offers' : 'Credit report';
  return (
    <Page title={what} lead="Coming soon.">
      <Card>
        <Muted>{what} is still being built. Your cards and everything else work as they do today.</Muted>
        <Link href="/cards/" className="text-sm font-medium underline">Back to my cards</Link>
      </Card>
    </Page>
  );
}

export default function ComingSoon() {
  return <Suspense><Soon /></Suspense>;
}
