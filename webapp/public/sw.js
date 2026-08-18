// Khazana service worker — OFFLINE FALLBACK ONLY (network-first).
// Privacy: caches only the app's own static assets so it works offline; makes
// NO external requests and never touches your encrypted data (that's in
// IndexedDB). Network-first everywhere so a new build's assets always load
// fresh — the SW can never serve a stale/broken shell.
//
// v4 fixes a defect that killed whole screens:
//
//   respondWith() must be given a Response. The previous handler ended in
//   `... : undefined`, so a failed fetch plus a cache miss resolved to
//   undefined, which the browser turns into a network error — rendering the
//   platform's "This page couldn't load" page instead of the app. Only `/` and
//   `/dashboard` were ever precached, so every other route (Dividends, Import,
//   Reports…) was one fetch hiccup away from a dead page.
//
//   It also now ignores non-http(s) schemes entirely. Under the desktop
//   wrapper the origin is tauri://localhost, where a service-worker fetch of a
//   custom protocol can fail outright — which turned the bug above from
//   intermittent into reliable.
//
// v5 adds a notificationclick handler. Nothing else about the caching changed
// — the version bump is what makes the new handler take effect, since the
// activate step below deletes every cache that is not the current name and a
// worker with an unchanged body would not be treated as new.
const CACHE = 'khazana-shell-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/dashboard']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Last-resort page, so a cache miss while offline still explains itself. */
function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Khazana — offline</title>'
    + '<body style="margin:0;background:#07080B;color:#e7e9ee;font:16px/1.6 system-ui,-apple-system,sans-serif">'
    + '<div style="max-width:32rem;margin:20vh auto;padding:0 1.5rem;text-align:center">'
    + '<h1 style="font-size:1.25rem;margin:0 0 .5rem">You appear to be offline</h1>'
    + '<p style="margin:0 0 1.5rem;color:#9aa1ae">This screen has not been saved for offline use yet. '
    + 'Reconnect and reload — your data is untouched and still on this device.</p>'
    + '<button onclick="location.reload()" style="font:inherit;padding:.6rem 1.2rem;border-radius:.75rem;'
    + 'border:1px solid #2a2f3a;background:#12151c;color:inherit;cursor:pointer">Reload</button>'
    + '</div></body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = (await caches.match('/dashboard')) || (await caches.match('/'));
      return shell || offlinePage();
    }
    // A genuinely missing asset while offline. Response.error() is a real
    // Response, so the page keeps control instead of being torn down.
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return; // unparseable — leave it to the browser
  }

  if (url.origin !== self.location.origin) return; // never proxy external
  // Custom schemes (tauri://, capacitor://) are served by the host app itself.
  // Intercepting them buys nothing and can fail the request outright.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith(networkFirst(req));
});


// --- Notifications ----------------------------------------------------------
//
// There is deliberately NO 'push' listener here, and there should not be one.
//
// Web Push would mean a server holding the VAPID private key, storing a
// subscription per device, deciding when to send, and composing the message —
// so "Groceries budget 90% used" would be written by a machine that is not this
// one. The relay (Google's, Mozilla's, Apple's) could not read the payload, but
// the sender necessarily could, and that is the whole claim in THREAT-MODEL.md.
// Khazana therefore shows notifications only from code running in this browser,
// about data already decrypted in this browser.
//
// The cost of that is stated plainly rather than hidden: on the web nothing is
// checked while the app is closed. The Notification Triggers API, which would
// have allowed a locally scheduled notification, never shipped. The mobile apps
// do not have this limitation, because there the OS holds the alarm.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(client.url).origin === self.location.origin;
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin) continue;
      await client.focus();
      // postMessage, not client.navigate(): a hard navigate re-mounts the app,
      // which throws away the unlocked vault key and puts the PIN screen in
      // front of someone who was already looking at their data. The client
      // listens for this and routes with the router instead.
      client.postMessage({ type: 'khazana:navigate', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
