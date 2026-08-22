/**
 * Licence key verification — the TypeScript twin of
 * `lib/domain/entitlement/license_key.dart`.
 *
 * Format: `KHAZ1.<base64url(payload ‖ signature)>`
 *
 * ```
 *   byte  0      format version (0x01)
 *   byte  1      product        (0x01 = khazana-pro)
 *   bytes 2-3    issuedAtDays   uint16 BE, days since 2020-01-01, display only
 *   bytes 4-11   orderRef       first 8 bytes of SHA-256(merchant order id)
 *   bytes 12-75  Ed25519 signature over bytes 0..11
 * ```
 *
 * `@noble/ed25519` rather than `crypto.subtle`: WebCrypto's Ed25519 support is
 * still absent or flagged in enough browsers, in Tauri's WKWebView and WebView2,
 * and in vitest's jsdom, that relying on it would mean a verifier that works in
 * testing and fails on a customer's machine. Four kilobytes buys the same
 * answer in all four environments.
 *
 * Verification is local and offline. Nothing is sent anywhere — not to check a
 * key, not to activate one, not to "phone home". That is what lets Pro work on
 * a plane and lets us never learn that a given person is running the app.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

// @noble/ed25519 v2 ships without a hash so it can stay dependency-free; the
// synchronous `verify` below is unavailable until one is supplied. Doing it at
// module load keeps verification synchronous, which is what lets the store
// resolve Pro during `init()` with no Pro-flicker on first paint.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

export type LicenseVerdict =
  | 'valid'
  | 'malformed'
  | 'unsupportedVersion'
  | 'wrongProduct'
  | 'badSignature';

export interface LicenseCheck {
  verdict: LicenseVerdict;
  /** 16 hex chars. Display only. */
  orderRef?: string;
  /**
   * Display only. Nothing compares it against the clock — a perpetual licence
   * has no expiry, which is precisely what makes offline verification sound.
   */
  issuedAt?: Date;
}

export const LICENSE_PREFIX = 'KHAZ1.';
const FORMAT_VERSION = 0x01;
const PRODUCT_KHAZANA_PRO = 0x01;
const PAYLOAD_LEN = 12;
const SIGNATURE_LEN = 64;
export const LICENSE_TOTAL_LEN = PAYLOAD_LEN + SIGNATURE_LEN; // 76

const EPOCH = Date.UTC(2020, 0, 1);

/**
 * Verifies `raw` against a 32-byte public key.
 *
 * Tolerant of how people actually paste keys: surrounding whitespace, newlines
 * from an email client wrapping the line, and a missing `KHAZ1.` prefix.
 *
 * Deliberately NOT tolerant of hyphens: `-` is a real character in the base64url
 * alphabet, so stripping it as "readability formatting" corrupts the payload of
 * most keys. That was a live bug on the Dart side, caught by the shared fixture.
 */
export function verifyLicense(
  raw: string,
  publicKey: Uint8Array,
): LicenseCheck {
  const bytes = decode(raw);
  if (!bytes || bytes.length !== LICENSE_TOTAL_LEN) {
    return { verdict: 'malformed' };
  }
  if (bytes[0] !== FORMAT_VERSION) return { verdict: 'unsupportedVersion' };
  if (bytes[1] !== PRODUCT_KHAZANA_PRO) return { verdict: 'wrongProduct' };

  const payload = bytes.slice(0, PAYLOAD_LEN);
  const signature = bytes.slice(PAYLOAD_LEN);

  let ok = false;
  try {
    ok = ed.verify(signature, payload, publicKey);
  } catch {
    // A malformed public key or signature point. Indistinguishable from a
    // forgery as far as the user is concerned, and treated the same.
    ok = false;
  }
  if (!ok) return { verdict: 'badSignature' };

  return {
    verdict: 'valid',
    orderRef: hex(payload.slice(4, 12)),
    issuedAt: new Date(EPOCH + ((payload[2] << 8) | payload[3]) * 86_400_000),
  };
}

function decode(raw: string): Uint8Array | null {
  // Whitespace only — `-` and `_` are payload.
  let s = raw.replace(/\s/g, '');
  if (s.toUpperCase().startsWith(LICENSE_PREFIX)) {
    s = s.slice(LICENSE_PREFIX.length);
  }
  if (!s) return null;

  // base64url → base64, then re-pad.
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
