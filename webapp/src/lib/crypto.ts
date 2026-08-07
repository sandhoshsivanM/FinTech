// Web Crypto vault encryption — mirrors the Flutter app's security model
// (PBKDF2-HMAC-SHA256, 600k iterations → AES-256-GCM). Local-only, private.

const ITERATIONS = 600000;
const KEY_LEN_BITS = 256;

function bufToB64(buf: ArrayBufferLike): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Whether Web Crypto is actually available here.
 *
 * `crypto.subtle` exists ONLY in a secure context: HTTPS, or the localhost /
 * 127.0.0.1 loopback exemption. Open the same build over plain http on a LAN
 * address — `http://192.168.1.7:3100`, which is exactly how you would reach it
 * from a phone — and `crypto.subtle` is `undefined`. The vault gate used to
 * walk straight into that and surface a raw
 * "can't access property importKey" TypeError, which reads like the app is
 * broken rather than like the page needs HTTPS.
 */
export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

/** Thrown instead of a TypeError when the page is not a secure context. */
export class InsecureContextError extends Error {
  constructor() {
    super(
      'Khazana needs a secure connection to encrypt your vault. Open it over '
      + 'https://, or on this device at http://localhost — a plain http:// '
      + 'address on your network cannot use browser encryption.',
    );
    this.name = 'InsecureContextError';
  }
}

function requireCrypto(): void {
  if (!cryptoAvailable()) throw new InsecureContextError();
}

export function randomBytes(n: number): Uint8Array {
  requireCrypto();
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

/// Derives the vault AES-GCM key from the user's PIN + salt (PBKDF2 600k).
export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  requireCrypto();
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface Encrypted {
  iv: string; // base64
  ct: string; // base64
}

/// Encrypts a JSON-serializable value with a fresh 12-byte IV (never reused).
export async function encryptJson(key: CryptoKey, value: unknown): Promise<Encrypted> {
  const iv = randomBytes(12);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data);
  return { iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
}

/// Decrypts a value; throws on a wrong key / tampered data (GCM auth fail).
export async function decryptJson<T>(key: CryptoKey, enc: Encrypted): Promise<T> {
  const iv = b64ToBuf(enc.iv);
  const ct = b64ToBuf(enc.ct);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export { bufToB64, b64ToBuf };
