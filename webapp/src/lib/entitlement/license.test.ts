// The TypeScript licence verifier, checked against the SAME fixture the Dart
// verifier is checked against (`test/fixtures/license_keys.json`).
//
// This is the point of the exercise. Two independent implementations of one
// byte format will drift, and the place they must never drift is "is this
// customer's key valid" — a key that unlocks the desktop app and is refused by
// the phone is a support ticket that cannot be explained.
//
// The key pair in the fixture is test-only and deliberately public. It has
// signed nothing that was ever sold.
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyLicense, LICENSE_TOTAL_LEN } from './license';

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../../../../test/fixtures/license_keys.json'), 'utf8'),
) as {
  testKeyPair: { publicKey: number[] };
  cases: { name: string; key: string; verdict: string }[];
};

const PUB = new Uint8Array(fixture.testKeyPair.publicKey);

describe('shared fixture — must agree with the Dart verifier', () => {
  for (const c of fixture.cases) {
    test(c.name, () => {
      expect(verifyLicense(c.key, PUB).verdict).toBe(c.verdict);
    });
  }
});

describe('what a valid key yields', () => {
  const good = fixture.cases.find((c) => c.verdict === 'valid')!;

  test('an order reference is exposed for display', () => {
    const check = verifyLicense(good.key, PUB);
    expect(check.orderRef).toMatch(/^[0-9A-F]{16}$/);
  });

  test('the order reference is a hash, not an identity', () => {
    // 16 hex characters and nothing else. No email, no name, no device id —
    // the client deliberately holds zero personal data about a buyer, and the
    // paywall can still say "Licence …4F2A".
    const check = verifyLicense(good.key, PUB);
    expect(check.orderRef).not.toMatch(/@/);
    expect(check.orderRef).toHaveLength(16);
  });

  test('an issue date is exposed, and nothing checks it against the clock', () => {
    // Deliberate: a perpetual licence has no expiry, which is exactly what
    // makes offline verification sound. The day an expiry exists, verification
    // needs trustworthy time and the design needs a server.
    const check = verifyLicense(good.key, PUB);
    expect(check.issuedAt).toBeInstanceOf(Date);
    expect(check.verdict).toBe('valid');
  });
});

describe('refusals', () => {
  const good = fixture.cases.find((c) => c.verdict === 'valid')!;

  test('a different public key refuses a genuine key', () => {
    const other = new Uint8Array(32).fill(7);
    expect(verifyLicense(good.key, other).verdict).toBe('badSignature');
  });

  test('the all-zero placeholder key accepts nothing', () => {
    // The shipped default until a real pair is minted. It must refuse
    // everything rather than accidentally accepting a degenerate signature.
    expect(verifyLicense(good.key, new Uint8Array(32)).verdict).not.toBe('valid');
  });

  test('garbage of the right length is refused', () => {
    const junk = 'A'.repeat(Math.ceil((LICENSE_TOTAL_LEN * 4) / 3));
    expect(verifyLicense(`KHAZ1.${junk}`, PUB).verdict).not.toBe('valid');
  });

  test('hyphens are payload, not decoration', () => {
    // `-` is a real base64url character. Stripping it as a readability
    // separator corrupts the payload of most keys — a live bug on the Dart
    // side, caught by this fixture. Inserting hyphens must therefore break a
    // key, not be silently forgiven.
    const mangled = good.key.replace(/(.{8})/g, '$1-');
    expect(verifyLicense(mangled, PUB).verdict).not.toBe('valid');
  });

  test('whitespace, however, is forgiven', () => {
    const wrapped = good.key.replace(/(.{30})/g, '$1\n');
    expect(verifyLicense(wrapped, PUB).verdict).toBe('valid');
  });
});
