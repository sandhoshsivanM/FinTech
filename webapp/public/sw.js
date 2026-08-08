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
const CACHE = 'khazana-shell-v4';

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
