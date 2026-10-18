import { describe, test, expect, vi } from 'vitest';
import { CHART_ENDPOINT, handleQuote, isValidTicker } from './proxy';

const get = (qs: string) => new Request(`https://khazana.test/.netlify/functions/quote${qs}`);

describe('isValidTicker', () => {
  test.each(['INFY.NS', 'RELIANCE.BO', 'AAPL', 'BRK-B', '^NSEI', 'USDINR=X', 'M&M.NS'])('accepts %s', (t) => {
    expect(isValidTicker(t)).toBe(true);
  });

  test.each([null, '', 'a'.repeat(21), 'INFY/../x', 'https://evil.test', 'IN FY', 'A?b=c'])('refuses %s', (t) => {
    expect(isValidTicker(t)).toBe(false);
  });
});

describe('handleQuote', () => {
  test('relays Yahoo\'s body untouched, cacheable for a minute', async () => {
    const body = '{"chart":{"result":[{"meta":{"regularMarketPrice":1500}}]}}';
    const upstream = vi.fn(async () => new Response(body, { status: 200 }));
    const res = await handleQuote(get('?t=INFY.NS'), upstream as unknown as typeof fetch);

    expect(upstream).toHaveBeenCalledWith(`${CHART_ENDPOINT}INFY.NS?interval=1d&range=1d`, expect.anything());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await res.text()).toBe(body);
  });

  test('refuses a bad ticker without calling Yahoo', async () => {
    const upstream = vi.fn();
    const res = await handleQuote(get('?t=https://evil.test'), upstream as unknown as typeof fetch);
    expect(res.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  test('refuses a missing ticker and non-GET methods', async () => {
    const upstream = vi.fn();
    expect((await handleQuote(get(''), upstream as unknown as typeof fetch)).status).toBe(400);
    const post = new Request('https://khazana.test/.netlify/functions/quote?t=INFY.NS', { method: 'POST' });
    expect((await handleQuote(post, upstream as unknown as typeof fetch)).status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });

  test('a Yahoo error or network failure is a 502', async () => {
    const notFound = vi.fn(async () => new Response('', { status: 404 }));
    expect((await handleQuote(get('?t=NOPE'), notFound as unknown as typeof fetch)).status).toBe(502);
    const down = vi.fn(async () => { throw new TypeError('network'); });
    expect((await handleQuote(get('?t=INFY.NS'), down as unknown as typeof fetch)).status).toBe(502);
  });
});
