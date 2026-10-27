import type { Metadata, Viewport } from 'next';
import { Anek_Latin } from 'next/font/google';
import './globals.css';
import { ACCENTS } from '@khazana/domain/appearance';
import { Providers } from '@/components/Providers';
import { AppFrame } from '@/components/AppFrame';

// Anek Latin, as in the offline app and the Flutter app: a rupee sign drawn as
// part of the face, and narrow tabular digits that keep lakh and crore figures
// compact. `latin-ext` is required: the `latin` subset stops short of U+20B9.
// next/font self-hosts it at build time, so the page needs no third-party origin.
const sans = Anek_Latin({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
  axes: ['wdth'],
});

export const metadata: Metadata = {
  title: 'Khazana Online',
  description: 'Khazana with an account: your money on every device, end-to-end encrypted.',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// No-FOUC theme script: applies the stored theme and accent before first paint.
// Runs from <body> (a manual <head> breaks App Router hydration). The accent
// table MIRRORS ACCENTS in packages/domain-ts/src/appearance.ts and must be
// changed together with it, or the accent flashes on load.
const THEME_SCRIPT = "(function(){try{var g=function(k){return localStorage.getItem('khazana-'+k);};var t=g('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';var A=__ACCENTS__;var p=A[g('accent')];if(p){var v=d?p.d:p.l;r.style.setProperty('--accent',v[0]);r.style.setProperty('--accent-deep',v[1]);r.style.setProperty('--accent-glow',v[2]);if(v[3])r.style.setProperty('--accent-on',v[3]);}}catch(e){}})();";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable} style={{ '--font-display': 'var(--font-sans)' } as React.CSSProperties} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT.replace('__ACCENTS__', accentTable()) }} />
        {/* WCAG 2.4.1: the first Tab stop skips straight to the page content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
        >
          Skip to content
        </a>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}

/** The accent table for the inline script, generated from the one source so it cannot drift. */
function accentTable(): string {
  const rows = Object.entries(ACCENTS).map(([k, a]) => `${k}:{l:${JSON.stringify([...a.light, ...(a.on ? [a.on.light] : [])])},d:${JSON.stringify([...a.dark, ...(a.on ? [a.on.dark] : [])])}}`);
  return `{${rows.join(',')}}`;
}
