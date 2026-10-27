import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Khazana Online',
  description: 'Khazana with an account: your money on every device, end-to-end encrypted.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        {/* WCAG 2.4.1: the first Tab stop skips straight to the page content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-fg)' }}
        >
          Skip to content
        </a>
        <main id="main" tabIndex={-1} className="mx-auto min-h-screen max-w-xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
