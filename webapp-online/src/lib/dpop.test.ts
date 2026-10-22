import { describe, expect, test } from 'vitest';
import { base64url, createDeviceKey, createProof, thumbprint } from './dpop';

const decode = (part: string) =>
  JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

async function verify(proof: string, jwk: JsonWebKey) {
  const [h, p, s] = proof.split('.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(`${h}.${p}`));
}

describe('DPoP proofs (RFC 9449)', () => {
  test('the private key cannot be exported', async () => {
    const key = await createDeviceKey();
    await expect(crypto.subtle.exportKey('jwk', key.privateKey)).rejects.toThrow();
    expect(Object.keys(key.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
  });

  test('a proof is an ES256 dpop+jwt carrying only the public key, and verifies', async () => {
    const key = await createDeviceKey();
    const proof = await createProof(key, 'post', 'http://localhost:5196/v1/auth/token?x=1#y', undefined, () => 1_700_000_000_000);
    const [h, p] = proof.split('.');
    expect(decode(h)).toEqual({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk });
    const payload = decode(p);
    expect(payload.htm).toBe('POST');
    expect(payload.htu).toBe('http://localhost:5196/v1/auth/token');
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload).not.toHaveProperty('ath');
    expect(await verify(proof, key.publicJwk)).toBe(true);
  });

  test('with an access token the proof names it (ath = base64url(SHA-256(token)))', async () => {
    const key = await createDeviceKey();
    const proof = await createProof(key, 'GET', 'https://api.example/v1/devices/me', 'the-token');
    const expected = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('the-token')));
    expect(decode(proof.split('.')[1]).ath).toBe(expected);
  });

  test('every proof has a fresh jti', async () => {
    const key = await createDeviceKey();
    const a = decode((await createProof(key, 'GET', 'https://api.example/x')).split('.')[1]).jti;
    const b = decode((await createProof(key, 'GET', 'https://api.example/x')).split('.')[1]).jti;
    expect(a).not.toBe(b);
  });

  test('the thumbprint is stable, unpadded base64url SHA-256 of the canonical JWK', async () => {
    const jwk = { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' };
    const canonical = '{"crv":"P-256","kty":"EC","x":"abc","y":"def"}';
    const expected = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
    expect(await thumbprint({ ...jwk, extra: 'ignored' } as JsonWebKey)).toBe(expected);
    expect(expected).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
