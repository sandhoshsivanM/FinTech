'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The root route exists only to hand over to the dashboard.
 *
 * It MUST be a client-side hop. The server `redirect()` this replaced compiles,
 * under `output: "export"`, into a `NEXT_REDIRECT` marker baked into
 * `index.html` — which is not a redirect at all once there is no server. In the
 * browser it degraded to a full navigation to a path with no file behind it;
 * inside the Tauri window, where the asset protocol has no directory-index
 * fallback, it opened the macOS app on WebKit's "This page couldn't load".
 *
 * `router.replace` keeps the whole hop inside the already-loaded SPA, so no
 * asset lookup happens and the same build works from a file:// URL, a static
 * host, and the desktop shell alike.
 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Deliberately blank rather than a spinner: the hop takes one frame, and a
  // flash of loading chrome reads as slower than nothing at all.
  return null;
}
