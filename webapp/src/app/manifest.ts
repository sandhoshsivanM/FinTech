import type { MetadataRoute } from 'next';

// Required for `output: export` (static) builds.
export const dynamic = 'force-static';

// PWA manifest — enables "Install" + standalone window. Served at
// /manifest.webmanifest by Next's App Router.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fintech OS — Private Wealth',
    short_name: 'Fintech OS',
    description: 'Offline-first, private personal finance & wealth management. Your data never leaves this device.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f7f6f3',
    theme_color: '#18191f',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
