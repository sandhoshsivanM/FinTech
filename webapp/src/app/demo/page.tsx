'use client';

import { useEffect } from 'react';
import { DEMO_SESSION_KEY, demoSessionSet } from '@/lib/demoSession';

/**
 * `/demo/` — the "Try demo" entry point linked from the README and the PIN
 * screen. It only marks this tab as a demo and loads `/`.
 *
 * A full page load, not `router.replace`: the database is chosen when `db.ts`
 * first loads (see `dbName`), and in this tab it has already loaded on the real
 * name. Reloading is what moves the whole app onto the demo database, and what
 * guarantees nothing from the real vault is still held in memory.
 *
 * AppFrame renders this route without the vault gate or `init()`.
 */
export default function Demo() {
  useEffect(() => {
    demoSessionSet(DEMO_SESSION_KEY, '1');
    window.location.replace('/');
  }, []);

  return <div className="min-h-screen grid place-items-center text-muted">Opening the demo…</div>;
}
