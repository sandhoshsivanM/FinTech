// The app's one AccountKeys, shared by every page, and the steps every
// signed-in page needs before it can show data.
import { ApiError, gateway } from './api';
import { AccountKeys } from './keys';
import { forgetSignIn } from './signInMethod';

let instance: AccountKeys | undefined;
export const keys = () => (instance ??= new AccountKeys(gateway()));

/** A readable name for this device in the account's device list. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Linux';
  return `${browser} on ${os}`;
}

export type Readiness = 'signed-out' | 'needs-setup' | 'ready';

let readying: Promise<Readiness> | undefined;

/**
 * Brings this device to "ready": signed in, registered, data key unlocked.
 * Returns where it got stuck otherwise. Cheap when already ready. Callers at
 * the same moment share one run: two registers at once made the second a 409.
 */
export function ensureReady(): Promise<Readiness> {
  readying ??= getReady().finally(() => (readying = undefined));
  return readying;
}

async function getReady(): Promise<Readiness> {
  if (!(await gateway().isSignedIn())) return 'signed-out';
  const k = keys();
  if (k.unlocked) return 'ready';
  try {
    const status = await k.register(deviceName());
    if (status.has_key) {
      if (!(await k.unlock())) await k.unlockFromServer();
      return 'ready';
    }
    if (status.account_has_keys && (await k.adoptLocalKey())) return 'ready';
    return 'needs-setup';
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return 'signed-out';
    throw err;
  }
}

/** Signs out on the server, then forgets the session and every key on this device. */
export async function signOutEverywhereLocal(): Promise<void> {
  try {
    await gateway().signOut();
  } finally {
    forgetSignIn();
    await (await import('./vault')).clearAll();
    instance = undefined;
  }
}
