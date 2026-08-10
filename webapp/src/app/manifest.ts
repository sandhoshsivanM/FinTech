import type { MetadataRoute } from 'next';

import { APP_NAME, APP_TITLE } from '@/lib/brand';

// Required for `output: export` (static) builds.
export const dynamic = 'force-static';

// PWA manifest — enables "Install" + standalone window. Served at
// /manifest.webmanifest by Next's App Router.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_TITLE,
    short_name: APP_NAME,
    description: 'Offline-first, private personal finance & wealth management. Your data never leaves this device.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#07080B',
    theme_color: '#07080B',
    categories: ['finance', 'productivity'],
    // PNG entries are what Android Chrome's install criteria actually look for.
    // The brand mark is a render, so there is no SVG to offer alongside them —
    // the flat vector that used to be listed here was a different drawing of
    // the logo, and pointing the manifest at it meant the installed app wore a
    // mark the rest of the product did not.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
