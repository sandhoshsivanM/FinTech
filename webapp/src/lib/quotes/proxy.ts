/**
 * The web build's quote relay — the body of `netlify/functions/quote.ts`.
 *
 * A browser cannot read Yahoo's chart endpoint (no CORS headers), so the web
 * app asks this same-origin function instead, and the function asks Yahoo.
 * Same-origin is the point: the CSP stays `connect-src 'self'`, so the page
 * still cannot reach any other host, and an injected script still has nowhere
 * to send a decrypted vault.
 *
 * It is a relay and nothing more. It takes one ticker, calls one fixed
 * endpoint, returns Yahoo's answer untouched, and keeps nothing: no logging, no
 * storage, no cookies read. The ticker is validated before anything is fetched,
 * so the function cannot be pointed at another URL or used as an open proxy.
 *
 * Lives under `src/` rather than beside the function so vitest picks up its
 * test — Netlify deploys every file in the functions directory as a function,
 * a test file included.
 */

export const CHART_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/**
 * Yahoo symbols as `yahooTicker` builds them: `INFY.NS`, `AAPL`, `BRK-B`, plus
 * the `^` and `=` that indices and FX pairs use. Anything else is refused
 * before a request is made.
 */
const TICKER = /^[A-Za-z0-9.^=&-]{1,20}$/;

export function isValidTicker(t: string | null): t is string {
  return t !== null && TICKER.test(t);
}

/** Short enough that a refresh is current, long enough that the CDN absorbs a double tap. */
const CACHE = 'public, max-age=60';

export async function handleQuote(req: Request, upstream: typeof fetch = fetch): Promise<Response> {
  if (req.method !== 'GET') return new Response(null, { status: 405 });

  const ticker = new URL(req.url).searchParams.get('t');
  if (!isValidTicker(ticker)) return new Response(null, { status: 400 });

  try {
    const res = await upstream(`${CHART_ENDPOINT}${encodeURIComponent(ticker)}?interval=1d&range=1d`, {
      // Yahoo refuses requests that do not look like a browser.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Khazana quote relay)', Accept: 'application/json' },
    });
    if (!res.ok) return new Response(null, { status: 502 });
    return new Response(await res.text(), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': CACHE },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
