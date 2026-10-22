// DPoP (RFC 9449) for the browser: every request to the gateway carries a
// proof signed by this device's key, and the access token is bound to that
// key (cnf.jkt), so a stolen token is useless without it. The private key is
// generated non-extractable: script can sign with it but never read it out.

const ALG: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

export type DeviceKey = { privateKey: CryptoKey; publicJwk: JsonWebKey };

export async function createDeviceKey(): Promise<DeviceKey> {
  const pair = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { kty, crv, x, y } };
}

const encoder = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const json64 = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

/** RFC 7638 thumbprint: what the server puts in the token's cnf.jkt. */
export async function thumbprint(jwk: JsonWebKey): Promise<string> {
  // Required members only, in lexicographic order, no whitespace.
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return base64url(await crypto.subtle.digest('SHA-256', encoder.encode(canonical)));
}

/**
 * A proof for one request. `url` is the gateway URL actually called (the
 * server ignores query and fragment); `accessToken` is set on every call
 * after sign-in, so the proof names the token it travels with (ath).
 */
export async function createProof(
  key: DeviceKey,
  method: string,
  url: string,
  accessToken?: string,
  now: () => number = Date.now,
): Promise<string> {
  const target = new URL(url);
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk };
  const payload: Record<string, unknown> = {
    jti: crypto.randomUUID(),
    htm: method.toUpperCase(),
    htu: `${target.origin}${target.pathname}`,
    iat: Math.floor(now() / 1000),
  };
  if (accessToken !== undefined) {
    payload.ath = base64url(await crypto.subtle.digest('SHA-256', encoder.encode(accessToken)));
  }
  const signingInput = `${json64(header)}.${json64(payload)}`;
  // Web Crypto's ECDSA signature is already the raw r||s form JWS wants.
  const signature = await crypto.subtle.sign(SIGN, key.privateKey, encoder.encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}
