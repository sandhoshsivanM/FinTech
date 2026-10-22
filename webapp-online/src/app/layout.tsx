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
        <main className="mx-auto min-h-screen max-w-xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
