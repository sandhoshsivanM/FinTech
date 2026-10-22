'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, gateway } from '@/lib/api';

type DeviceStatus = { device_id: string; has_key: boolean; account_has_keys: boolean; key_version: number | null };

const SECTIONS = [
  { title: 'Accounts', body: 'Bank accounts, cards and cash, synced across your devices.' },
  { title: 'Cards', body: 'Due dates and savings from the cards you already have.' },
  { title: 'Connections', body: 'Your devices, and the banks you link.' },
];

export default function Home() {
  const router = useRouter();
  const [device, setDevice] = useState<string>('Checking this device…');

  useEffect(() => {
    gateway()
      .call<DeviceStatus>('GET', '/v1/devices/me')
      .then((d) =>
        setDevice(d.has_key
          ? 'This browser is registered and holds your data key.'
          : 'This browser is registered. It gets your data key when you pair it with another device.'),
      )
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) setDevice('This browser is signed in but not registered as a device yet.');
        else if (err instanceof ApiError && err.status === 401) router.replace('/sign-in/');
        else setDevice('The server could not be reached.');
      });
  }, [router]);

  async function signOut() {
    await gateway().signOut().catch(() => undefined);
    router.replace('/sign-in/');
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Khazana Online</h1>
        <button onClick={signOut} className="rounded-full px-3 py-1.5 text-sm" style={{ background: 'var(--card)' }}>
          Sign out
        </button>
      </header>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{device}</p>
      {SECTIONS.map((s) => (
        <article key={s.title} className="rounded-2xl p-4" style={{ background: 'var(--card)' }}>
          <h2 className="font-medium">{s.title}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{s.body}</p>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted-soft)' }}>Coming in the next slice.</p>
        </article>
      ))}
    </section>
  );
}
