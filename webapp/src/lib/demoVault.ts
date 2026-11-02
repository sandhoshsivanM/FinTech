// The "Try demo" vault: a reviewer opens /demo/ and lands in a vault full of
// sample data without choosing a PIN.
//
// It is an ordinary encrypted vault, opened through the same `setup` and
// `unlock` as a real one — there is no bypass anywhere in the real unlock path.
// What makes it a demo is only where it lives and who knows the PIN:
//   - its own IndexedDB database (db.ts `dbName`), so the real `fintech_os`
//     database is never opened in a demo tab;
//   - a random 256-bit PIN generated here and kept in this tab's
//     sessionStorage, never shown and never typed.
// A tab that has lost that PIN (a new tab, a restored session) cannot open the
// old demo vault, so it is deleted and built again. That is why a demo "starts
// fresh each visit".
import { db, DEMO_DB_NAME } from './db';
import { bufToB64, randomBytes } from './crypto';
import { useApp } from './store';
import { loadSampleData } from './sampleData';
import {
  DEMO_PIN_KEY, DEMO_SEEDED_KEY, DEMO_SESSION_KEY, demoSessionGet, demoSessionRemove, demoSessionSet,
} from '@/lib/demoSession';
import { DEMO_MARKET_KEY } from '@khazana/screens/components/DemoBadge';

/**
 * Deletes the demo database, and only the demo database.
 *
 * The name check is the guard that matters: whatever led here, a page that
 * opened the real vault must never be able to delete it through this.
 */
async function deleteDemoDb(reopen: boolean): Promise<void> {
  if (db.name !== DEMO_DB_NAME) throw new Error('Refusing to delete a database that is not the demo vault.');
  await db.delete({ disableAutoOpen: false });
  if (reopen) await db.open();
}

/**
 * Opens this tab's demo vault, creating it (with sample data) if needed.
 * Called from `init()` when the page loaded the demo database, and from the
 * gate's "Reopen the demo" after an auto-lock.
 */
export function openDemoVault(): Promise<void> {
  // One at a time. `init()` runs from an effect that can fire twice, and two
  // overlapping opens cleared and deleted each other's vault mid-seed — the
  // demo then showed its accounts at opening balance and nothing else.
  opening ??= openOnce().finally(() => { opening = null; });
  return opening;
}
let opening: Promise<void> | null = null;

async function openOnce(): Promise<void> {
  if (db.name !== DEMO_DB_NAME) return;

  const pin = demoSessionGet(DEMO_PIN_KEY);
  const meta = await db.vaults.get('default');
  // Only a vault this tab finished seeding is reopened. One without the mark
  // was cut short partway, and reopening it showed a dashboard of empty cards.
  if (meta && pin && demoSessionGet(DEMO_SEEDED_KEY) === '1') {
    await useApp.getState().unlock(pin);
    if (useApp.getState().status === 'unlocked') return;
  }

  // Stale: a vault this tab has no PIN for, a failed unlock, a half-seeded
  // vault, or leftover records. Sample data is all it ever held, so start again.
  // Two tries: a seed that fails once is rebuilt from nothing, not left empty.
  for (let attempt = 0; attempt < 2; attempt++) {
    demoSessionRemove(DEMO_SEEDED_KEY);
    if ((await db.vaults.get('default')) || (await db.records.count()) > 0) await deleteDemoDb(true);

    const fresh = bufToB64(randomBytes(32).buffer);
    demoSessionSet(DEMO_PIN_KEY, fresh);
    useApp.setState({ status: 'uninitialized', strandedRecords: 0, error: null });
    await useApp.getState().setup(fresh);
    if (useApp.getState().status !== 'unlocked') return; // setup has set the error

    // Keep the gate's busy state up while the sample is written. Shown as
    // unlocked, the empty vault invited the clicks and reloads that cut it short.
    useApp.setState({ status: 'unlocking' });
    try {
      await loadSampleData();
      demoSessionSet(DEMO_SEEDED_KEY, '1');
      break;
    } catch (e) {
      console.error('Demo sample data failed to load', e);
    }
  }
  useApp.setState({ status: 'unlocked' });
  // Markets and News are empty without it. Session-scoped: see DemoBadge.
  demoSessionSet(DEMO_MARKET_KEY, '1');
}

/**
 * Leaves the demo: forgets its PIN and flag, deletes its database, and loads
 * the real app at `/` — a full page load, so `db` is built again on the real
 * database name.
 */
export async function exitDemo(): Promise<void> {
  demoSessionRemove(DEMO_PIN_KEY);
  demoSessionRemove(DEMO_SESSION_KEY);
  demoSessionRemove(DEMO_MARKET_KEY);
  demoSessionRemove(DEMO_SEEDED_KEY);
  useApp.getState().lock();
  try { await deleteDemoDb(false); } catch { /* recreated on the next visit anyway */ }
  window.location.replace('/');
}
