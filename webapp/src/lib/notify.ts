/**
 * OS notifications, from this browser only.
 *
 * What to say and when is `domain/notificationScheduler.ts`'s job; this file
 * only carries it to the operating system.
 *
 * The honest limits, because they shape every caller:
 *
 *   - Notifications appear only while a Khazana window is alive. There is no
 *     server, so there is no push; and the Notification Triggers API, which
 *     would have allowed a locally scheduled notification, never shipped past
 *     its Chrome origin trial. Nothing here changes that, and the copy on
 *     /alerts must keep saying so.
 *   - iOS Safari shows notifications only for a PWA installed to the Home
 *     Screen, from 16.4 onwards. In a normal tab `Notification` is undefined,
 *     which is why every entry point guards for it.
 *   - Permission must be requested from a real user gesture. A denial is
 *     permanent for the origin until the user digs into site settings, so it is
 *     asked for once, from the Settings toggle, and never on load.
 */
import type { PlannedNotification } from '@/domain/notificationScheduler';

export type NotifyPermission = NotificationPermission | 'unsupported';

const supported = () =>
  typeof window !== 'undefined' && typeof Notification !== 'undefined';

/** Under the Tauri desktop shell, where the service worker is not registered. */
export const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function notifyPermission(): NotifyPermission {
  if (!supported()) return 'unsupported';
  return Notification.permission;
}

// --- useSyncExternalStore adapter -------------------------------------------
//
// `Notification` does not exist during the static export's prerender, so the
// permission cannot be read during render. There is also no event for it
// changing — the browser fires nothing when a user flips the site setting — so
// the only reliable moment is after a request we made ourselves, which is what
// [notifyPermissionChanged] announces.
const permissionListeners = new Set<() => void>();

export function subscribePermission(onChange: () => void): () => void {
  permissionListeners.add(onChange);
  return () => permissionListeners.delete(onChange);
}

/** Call after anything that could have changed the browser's answer. */
export function notifyPermissionChanged(): void {
  for (const l of permissionListeners) l();
}

/**
 * Asks the browser. Must be called from a click handler — Safari and Chrome
 * both reject a request that does not originate in a user gesture.
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!supported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    // Older Safari resolves this through a callback and throws on the promise
    // form. Treating it as a refusal is the safe read: nothing was granted.
    return 'denied';
  }
}

/**
 * Shows one notification now.
 *
 * Prefers the service worker's registration, because a notification posted
 * through it survives the page being closed a moment later and is the only form
 * that can be clicked back into the app. `new Notification()` is the fallback
 * for dev and for the desktop shell, where no worker is registered.
 */
export async function showLocal(n: PlannedNotification): Promise<boolean> {
  if (!supported() || Notification.permission !== 'granted') return false;

  const options: NotificationOptions = {
    body: n.body,
    // The OS collapses same-tag notifications, which layers free de-duplication
    // on top of the scheduler's own cooldown.
    tag: n.dedupeKey,
    data: { url: n.deepLink ?? '/dashboard' },
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };

  try {
    if (!isTauri() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        // ready never resolves when no worker is registered — in dev, and on
        // any first load before registration completes — so a bare await here
        // would hang the caller forever.
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (registration) {
        await registration.showNotification(n.title, options);
        return true;
      }
    }
    new Notification(n.title, options);
    return true;
  } catch {
    // Best-effort: a notification is never worth taking a screen down for.
    return false;
  }
}

/**
 * Routes a notification tap without reloading the page.
 *
 * The worker posts rather than calling `client.navigate()` for a specific
 * reason: a hard navigation re-mounts the app, which discards the in-memory
 * vault key and puts the PIN screen in front of someone who was already looking
 * at their data.
 */
export function onNotificationNavigate(handler: (url: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type !== 'khazana:navigate' || typeof data.url !== 'string') return;
    handler(data.url);
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}
