import { describe, expect, test } from 'vitest';
import { GatewayClient, type TokenResponse } from './api';
import type { DeviceKey } from './dpop';
import type { Session } from './vault';

const BASE = 'http://gw.test';

function memoryVault() {
  let key: DeviceKey | undefined;
  let session: Session | undefined;
  return {
    loadKey: async () => key,
    saveKey: async (k: DeviceKey) => { key = k; return 'key'; },
    loadSession: async () => session,
    saveSession: async (s: Session) => { session = s; return 'session'; },
    clearSession: async () => { session = undefined; return undefined; },
    get session() { return session; },
  };
}

const tokens = (n: number): TokenResponse => ({
  access_token: `access-${n}`, token_type: 'DPoP', expires_in: 900,
  refresh_token: `refresh-${n}`, user_id: 'u1', device_id: 'd1',
});

type Seen = { url: string; method: string; headers: Record<string, string>; body?: string };

function harness(responses: Array<(req: Seen) => Response>) {
  const seen: Seen[] = [];
  const vault = memoryVault();
  const fetchFake = async (url: string | URL | Request, init?: RequestInit) => {
    const req = { url: String(url), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body as string | undefined };
    seen.push(req);
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request ${req.method} ${req.url}`);
    return next(req);
  };
  let now = 1_700_000_000_000;
  const client = new GatewayClient(BASE, { fetch: fetchFake as typeof fetch, now: () => now, vault: vault as never });
  return { client, seen, vault, advance: (ms: number) => { now += ms; } };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

describe('GatewayClient', () => {
  test('sign-in sends a DPoP proof and no Authorization, as platform web, and keeps the session', async () => {
    const h = harness([json(tokens(1))]);
    await h.client.signIn('dev', 'dev:me');
    const [req] = h.seen;
    expect(req.url).toBe(`${BASE}/v1/auth/token`);
    expect(req.headers.DPoP.split('.')).toHaveLength(3);
    expect(req.headers.Authorization).toBeUndefined();
    expect(JSON.parse(req.body!)).toEqual({ provider: 'dev', platform: 'web', id_token: 'dev:me' });
    expect(h.vault.session).toEqual({ refreshToken: 'refresh-1', userId: 'u1', deviceId: 'd1' });
  });

  test('a signed-in call carries the access token and a proof from the same key', async () => {
    const h = harness([json(tokens(1)), json({ ok: true })]);
    await h.client.signIn('dev', 'dev:me');
    await h.client.call('GET', '/v1/devices/me');
    const [signIn, call] = h.seen;
    expect(call.headers.Authorization).toBe('DPoP access-1');
    const jwkOf = (p: string) => JSON.parse(Buffer.from(p.split('.')[0], 'base64url').toString()).jwk;
    expect(jwkOf(call.headers.DPoP)).toEqual(jwkOf(signIn.headers.DPoP));
  });

  test('an expired access token is refreshed first, rotating the refresh token', async () => {
    const h = harness([json(tokens(1)), json(tokens(2)), json({})]);
    await h.client.signIn('dev', 'dev:me');
    h.advance(900_000);
    await h.client.call('GET', '/v1/devices/me');
    expect(JSON.parse(h.seen[1].body!)).toEqual({ refresh_token: 'refresh-1' });
    expect(h.seen[2].headers.Authorization).toBe('DPoP access-2');
    expect(h.vault.session?.refreshToken).toBe('refresh-2');
  });

  test('a 401 triggers one refresh and one retry', async () => {
    const h = harness([json(tokens(1)), json({ error: 'invalid_token' }, 401), json(tokens(2)), json({ ok: 1 })]);
    await h.client.signIn('dev', 'dev:me');
    await expect(h.client.call('GET', '/v1/devices/me')).resolves.toEqual({ ok: 1 });
    expect(h.seen).toHaveLength(4);
  });

  test('a refused refresh signs this browser out', async () => {
    const h = harness([json(tokens(1)), json({ error: 'invalid_grant' }, 400)]);
    await h.client.signIn('dev', 'dev:me');
    h.advance(900_000);
    await expect(h.client.call('GET', '/v1/devices/me')).rejects.toMatchObject({ status: 400, code: 'invalid_grant' });
    expect(h.vault.session).toBeUndefined();
  });

  test('sign-out clears the session even if the server is unreachable', async () => {
    const h = harness([json(tokens(1)), () => { throw new TypeError('network'); }]);
    await h.client.signIn('dev', 'dev:me');
    await expect(h.client.signOut()).rejects.toThrow('network');
    expect(h.vault.session).toBeUndefined();
  });
});
