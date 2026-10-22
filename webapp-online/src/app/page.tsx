'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { gateway } from '@/lib/api';

/** Sends you to your home if this browser is signed in, otherwise to sign-in. */
export default function Start() {
  const router = useRouter();
  useEffect(() => {
    gateway().isSignedIn().then((yes) => router.replace(yes ? '/home/' : '/sign-in/'));
  }, [router]);
  return null;
}
