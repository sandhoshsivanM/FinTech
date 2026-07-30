import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppFrame } from '@/components/AppFrame';
import { APP_DESCRIPTION, APP_TITLE } from '@/lib/brand';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
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
              "(function(){try{var g=function(k){return localStorage.getItem('khazana-'+k)||localStorage.getItem('ftos-'+k);};var t=g('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';var A={emerald:{l:['#1f8a5b','#15724a','#34c98a'],d:['#34c98a','#1f8a5b','#5ee0a8']},blue:{l:['#2563eb','#1d4ed8','#60a5fa'],d:['#5b8cff','#3b6ae0','#93b4ff']},violet:{l:['#6d5bd0','#5a48b8','#9d8df0'],d:['#9d8df0','#7c6ae0','#c2b6ff']},amber:{l:['#b07d12','#8a610b','#e0a93a'],d:['#e0a93a','#b07d12','#f2c869']},rose:{l:['#c0392f','#9d2b22','#e06a5a'],d:['#f06a4d','#c0392f','#ff9582']}};var p=A[g('accent')];if(p){var v=d?p.d:p.l;r.style.setProperty('--accent',v[0]);r.style.setProperty('--accent-deep',v[1]);r.style.setProperty('--accent-glow',v[2]);}}catch(e){}})();",
          }}
        />
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
