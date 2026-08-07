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
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
