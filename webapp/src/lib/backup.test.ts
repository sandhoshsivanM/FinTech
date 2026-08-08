// Backup portability. A v1 file is encrypted with the vault's own key, whose
// salt is random per vault — so the same PIN on a second device derives a
// different key and the restore fails. v2 carries its salt with it.
import { describe, test, expect } from 'vitest';
import { deriveKey, encryptJson, decryptJson, bufToB64, b64ToBuf } from './crypto';

const PIN = '1234';
const PAYLOAD = { v: 2, data: { txn: [{ id: 't1', amount: '100' }] } };

const saltOf = (byte: number) => new Uint8Array(16).fill(byte);

describe('key derivation is salt-bound, not PIN-bound', () => {
  test('the same PIN with a different salt yields a key that cannot decrypt', async () => {
    // This is exactly why restoring a v1 backup on a second device failed
    // while the user was certain the PIN was right. It was.
    const deviceA = await deriveKey(PIN, saltOf(1));
    const deviceB = await deriveKey(PIN, saltOf(2));
    const enc = await encryptJson(deviceA, PAYLOAD);
    await expect(decryptJson(deviceB, enc)).rejects.toBeTruthy();
  });

  test('the same PIN with the same salt round-trips', async () => {
    const a = await deriveKey(PIN, saltOf(1));
    const b = await deriveKey(PIN, saltOf(1));
    expect(await decryptJson(b, await encryptJson(a, PAYLOAD))).toEqual(PAYLOAD);
  });
});

describe('v2 envelope — portable across vaults', () => {
  /** Mirrors exportBackup's v2 path. */
  async function exportV2(pin: string, body: unknown) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pin, salt);
    const envelope = { v: 2, kdf: 'PBKDF2-SHA256', saltB64: bufToB64(salt.buffer), enc: await encryptJson(key, body) };
    return bufToB64(new TextEncoder().encode(JSON.stringify(envelope)).buffer);
  }

  /** Mirrors importBackup's v2 path. */
  async function importV2(b64: string, pin: string) {
    const outer = JSON.parse(new TextDecoder().decode(b64ToBuf(b64)));
    expect(outer.v).toBe(2);
    const key = await deriveKey(pin, new Uint8Array(b64ToBuf(outer.saltB64)));
    return decryptJson(key, outer.enc);
  }

  test('restores with the right PIN and no knowledge of the original vault', async () => {
    const file = await exportV2(PIN, PAYLOAD);
    expect(await importV2(file, PIN)).toEqual(PAYLOAD);
  });

  test('a wrong PIN is rejected', async () => {
    const file = await exportV2(PIN, PAYLOAD);
    await expect(importV2(file, '9999')).rejects.toBeTruthy();
  });

  test('every export uses a fresh salt, so two files never share a key', async () => {
    const a = JSON.parse(new TextDecoder().decode(b64ToBuf(await exportV2(PIN, PAYLOAD))));
    const b = JSON.parse(new TextDecoder().decode(b64ToBuf(await exportV2(PIN, PAYLOAD))));
    expect(a.saltB64).not.toBe(b.saltB64);
  });

  test('the envelope exposes no plaintext', async () => {
    const file = await exportV2(PIN, { secret: 'RELIANCE dividend 1240' });
    const outer = new TextDecoder().decode(b64ToBuf(file));
    expect(outer).not.toContain('RELIANCE');
    expect(outer).not.toContain(PIN);
  });
});
