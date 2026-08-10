import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppFrame } from '@/components/AppFrame';
import { APP_DESCRIPTION, APP_TITLE } from '@/lib/brand';

// One family, two roles. Display weight and tighter tracking carry the
// hierarchy instead of a second typeface — the same call Stripe, Linear and
// Vercel make, and it drops a font request from every page load.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  // Declared explicitly because these live in public/ rather than as
  // file-convention icons. Without this Next emits only the app/favicon.ico it
  // discovers, and apple-touch-icon.png plus the 16/32 favicons sat in the
  // repo referenced by nothing at all.
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

export const viewport: Viewport = {
  themeColor: '#07080B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // --font-display resolves to Inter too; globals.css keeps the variable so
    // `.font-display` and h1–h3 stay meaningful selectors.
    <html
      lang="en"
      className={`${inter.variable}`}
      style={{ '--font-display': 'var(--font-inter)' } as React.CSSProperties}
      suppressHydrationWarning
    >
      <body>
        {/* No-FOUC theme script. In <body> (not a manual <head>, which breaks
            App Router hydration) so it runs before paint without disrupting the
            document structure React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Keys must stay in sync with lib/store.ts (which owns the
              // khazana-* names and the ftos-* legacy fallback). `g` reads the
              // new key first, then the pre-rebrand one, so an existing user
              // never sees a theme flash after the rename.
              // The accent table `A` MIRRORS ACCENTS in lib/store.ts. It is
              // duplicated on purpose — this runs before any module loads — so
              // the two must be changed together or the accent flashes on load.
              "(function(){try{var g=function(k){return localStorage.getItem('khazana-'+k)||localStorage.getItem('ftos-'+k);};var t=g('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';var A={emerald:{l:['#15724A','#0F5A3A','#1F8A5B'],d:['#34C98A','#1F8A5B','#6FE0B0']},blue:{l:['#2F4C9C','#243B7A','#4F7CFF'],d:['#6E93FF','#4A6FE0','#A9C1FF']},violet:{l:['#584796','#443873','#8E7CC3'],d:['#A492DC','#7E6CB8','#C9BDEE']},amber:{l:['#8E4E20','#703D19','#C2610F'],d:['#D98A4E','#B4642A','#F0B183']},rose:{l:['#8C2F38','#6E252C','#C0392F'],d:['#E0707C','#B84B58','#F2A6AE']}};var p=A[g('accent')];if(p){var v=d?p.d:p.l;r.style.setProperty('--accent',v[0]);r.style.setProperty('--accent-deep',v[1]);r.style.setProperty('--accent-glow',v[2]);}}catch(e){}})();",
          }}
        />
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
