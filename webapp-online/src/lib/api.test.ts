import { describe, expect, test, vi } from 'vitest';
import { GatewayClient, type TokenResponse } from './api';
import { thumbprint, type DeviceKey } from './dpop';
import type { Session } from './vault';

vi.mock('./passkey', () => ({ getPasskey: vi.fn(async () => ({ id: 'cred', response: {} })), createPasskey: vi.fn() }));

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

  test('Google sign-in: the nonce Google gets is the thumbprint of the key that signs the token request', async () => {
    const h = harness([json(tokens(1))]);
    const nonce = await h.client.dpopThumbprint();
    await h.client.signInWithGoogle('google-id-token');
    const [req] = h.seen;
    expect(JSON.parse(req.body!)).toEqual({ platform: 'web', provider: 'google', id_token: 'google-id-token' });
    const jwk = JSON.parse(Buffer.from(req.headers.DPoP.split('.')[0], 'base64url').toString()).jwk;
    expect(await thumbprint(jwk)).toBe(nonce);
    expect(h.vault.session?.refreshToken).toBe('refresh-1');
  });

  test('asking for an SMS code sends the phone and platform with a proof, and returns the challenge', async () => {
    const h = harness([json({ challenge_id: 'c1', expires_in: 300, resend_after: 30, demo_code: '123456' })]);
    const challenge = await h.client.startPhoneSignIn('+919876543210');
    const [req] = h.seen;
    expect(req.url).toBe(`${BASE}/v1/auth/phone/start`);
    expect(req.headers.DPoP.split('.')).toHaveLength(3);
    expect(req.headers.Authorization).toBeUndefined();
    expect(JSON.parse(req.body!)).toEqual({ phone: '+919876543210', platform: 'web' });
    expect(challenge).toEqual({ challenge_id: 'c1', expires_in: 300, resend_after: 30, demo_code: '123456' });
    expect(h.vault.session).toBeUndefined();
  });

  test('a 429 on asking for a code carries the server\'s Retry-After', async () => {
    const h = harness([() => new Response(JSON.stringify({ error: 'too_many_requests' }), { status: 429, headers: { 'Retry-After': '42' } })]);
    await expect(h.client.startPhoneSignIn('+919876543210')).rejects.toMatchObject({ status: 429, code: 'too_many_requests', retryAfter: 42 });
  });

  test('signing in with the code sends provider phone, the challenge and the code, and keeps the session', async () => {
    const h = harness([json(tokens(1))]);
    await h.client.signInWithPhone('c1', '123456');
    const [req] = h.seen;
    expect(req.url).toBe(`${BASE}/v1/auth/token`);
    expect(JSON.parse(req.body!)).toEqual({ platform: 'web', provider: 'phone', challenge_id: 'c1', code: '123456' });
    expect(h.vault.session?.refreshToken).toBe('refresh-1');
  });

  test('a wrong code is an ApiError invalid_grant and keeps no session', async () => {
    const h = harness([json({ error: 'invalid_grant' }, 400)]);
    await expect(h.client.signInWithPhone('c1', '000000')).rejects.toMatchObject({ status: 400, code: 'invalid_grant' });
    expect(h.vault.session).toBeUndefined();
  });

  test('adding a passkey asks for options, creates the credential and registers it, signed in', async () => {
    const passkey = await import('./passkey');
    vi.mocked(passkey.createPasskey).mockResolvedValueOnce({ id: 'new-cred' });
    const h = harness([json(tokens(1)), json({ challenge_id: 'r1', options: { challenge: 'abc' } }), () => new Response(null, { status: 204 })]);
    await h.client.signIn('dev', 'dev:me');
    await h.client.addPasskey();
    const [, options, register] = h.seen;
    expect(options.url).toBe(`${BASE}/v1/auth/passkeys/register/options`);
    expect(options.headers.Authorization).toBe('DPoP access-1');
    expect(register.url).toBe(`${BASE}/v1/auth/passkeys/register`);
    expect(JSON.parse(register.body!)).toEqual({ challenge_id: 'r1', attestation: { id: 'new-cred' } });
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

  test('a step-up call asks for a passkey, then sends the request with the two-minute token (not the session token)', async () => {
    const h = harness([
      json(tokens(1)),
      json({ challenge_id: 'c1', options: { challenge: 'abc' } }),
      json({ access_token: 'step-up-token', token_type: 'DPoP', expires_in: 120 }),
      () => new Response(null, { status: 204 }),
    ]);
    await h.client.signIn('dev', 'dev:me');
    await expect(h.client.callWithStepUp('DELETE', '/v1/devices/d2')).resolves.toBeUndefined();

    const [, options, answer, remove] = h.seen;
    expect(options.url).toBe(`${BASE}/v1/auth/step-up/options`);
    expect(options.headers.Authorization).toBe('DPoP access-1');
    expect(answer.url).toBe(`${BASE}/v1/auth/step-up`);
    expect(JSON.parse(answer.body!)).toEqual({ challenge_id: 'c1', assertion: { id: 'cred', response: {} } });
    expect(remove.method).toBe('DELETE');
    expect(remove.headers.Authorization).toBe('DPoP step-up-token');
    // The step-up token is single-purpose: it never replaces the session's token.
    expect(h.vault.session?.refreshToken).toBe('refresh-1');
  });

  test('a refused step-up (wrong passkey) stops before anything is removed', async () => {
    const h = harness([
      json(tokens(1)),
      json({ challenge_id: 'c1', options: {} }),
      json({ error: 'invalid_grant' }, 400),
    ]);
    await h.client.signIn('dev', 'dev:me');
    await expect(h.client.callWithStepUp('DELETE', '/v1/devices/d2')).rejects.toMatchObject({ status: 400, code: 'invalid_grant' });
    expect(h.seen.some((r) => r.method === 'DELETE')).toBe(false);
  });
});
