/**
 * The gates a backup file must pass (§6.1).
 *
 * The webapp export used to be base64-of-JSON with no header, no hash and no
 * schema version — the only check was `JSON.parse` failing. Each test here is
 * one thing that used to get through.
 */
import { describe, expect, test } from 'vitest';
import { decodeBackup, encodeBackup, ENVELOPE_VERSION, MAGIC } from './backupFormat';
import { BackupError } from './backupError';
import { b64ToBuf, bufToB64, deriveKey, encryptJson } from './crypto';

const PIN = '4321';
const SCHEMA = 2;

const body = () => ({
  vaultId: 'v',
  exportedAt: 1_700_000_000_000,
  data: { txn: [{ id: 't1', amount: '1500.00', type: 'expense' }], account: [{ id: 'a1' }] },
});

/** A key no backup here is encrypted with — stands in for the local vault. */
const otherKey = () => deriveKey('0000', new Uint8Array(16).fill(9));

const reencode = (env: Record<string, unknown>) =>
  bufToB64(new TextEncoder().encode(JSON.stringify(env)).buffer);
const decode = (b64: string) =>
  JSON.parse(new TextDecoder().decode(b64ToBuf(b64))) as Record<string, unknown>;

const reasonOf = async (p: Promise<unknown>) => {
  try { await p; return 'no-error'; } catch (e) { return e instanceof BackupError ? e.reason : 'not-a-BackupError'; }
};

describe('round trip', () => {
  test('a file written here reads back identically', async () => {
    const file = await encodeBackup(body(), PIN, SCHEMA, '1.0.0');
    const out = await decodeBackup(file, PIN, await otherKey(), SCHEMA);
    expect(out.body).toEqual(body());
    expect(out.envelopeVersion).toBe(ENVELOPE_VERSION);
    expect(out.schemaVersion).toBe(SCHEMA);
  });

  test('the header is readable without the PIN, and the data is not', async () => {
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    expect(env.magic).toBe(MAGIC);
    expect(env.schemaVersion).toBe(SCHEMA);
    expect(env.kdf).toBe('PBKDF2-SHA256');
    expect(JSON.stringify(env)).not.toContain('1500.00');
  });

  test('each export uses a fresh salt and IV', async () => {
    const a = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    const b = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    expect(a.saltB64).not.toBe(b.saltB64);
    expect((a.enc as { iv: string }).iv).not.toBe((b.enc as { iv: string }).iv);
  });
});

describe('gate 1 — the file is ours', () => {
  test('an unrelated file is refused', async () => {
    expect(await reasonOf(decodeBackup(btoa('hello, world'), PIN, await otherKey(), SCHEMA)))
      .toBe('unreadable');
  });

  test('a v3 envelope with the wrong magic is refused', async () => {
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    env.magic = 'XXXX';
    expect(await reasonOf(decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA)))
      .toBe('unreadable');
  });
});

describe('gate 2 — a version this build understands', () => {
  test('a backup from a newer app is refused rather than half-read', async () => {
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    env.v = ENVELOPE_VERSION + 1;
    const err = decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA);
    expect(await reasonOf(err)).toBe('unreadable');
    await expect(err).rejects.toThrow(/newer version/i);
  });
});

describe('gate 3 — the envelope is well formed', () => {
  test('a v3 file with no salt is refused', async () => {
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    delete env.saltB64;
    expect(await reasonOf(decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA)))
      .toBe('unreadable');
  });

  test('a file with no ciphertext is refused', async () => {
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    env.enc = { iv: 'AAAA' };
    expect(await reasonOf(decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA)))
      .toBe('unreadable');
  });
});

describe('gate 4 — the right secret, and no oracle', () => {
  test('a missing PIN asks for one rather than failing', async () => {
    expect(await reasonOf(decodeBackup(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'), undefined, await otherKey(), SCHEMA)))
      .toBe('needs-pin');
  });

  test('a wrong PIN is refused', async () => {
    expect(await reasonOf(decodeBackup(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'), '9999', await otherKey(), SCHEMA)))
      .toBe('wrong-pin');
  });

  test('a wrong PIN and a tampered ciphertext are indistinguishable', async () => {
    // Otherwise the restore screen is an oracle: an attacker with a stolen
    // backup could tell a wrong guess from a damaged file and grind the PIN.
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    const ct = (env.enc as { ct: string }).ct;
    (env.enc as { ct: string }).ct = `${ct.slice(0, -4)}AAAA`;

    const caught = (p: Promise<unknown>) => p.then(() => null, (e: BackupError) => e);
    const a = await caught(decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA));
    const b = await caught(
      decodeBackup(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'), '9999', await otherKey(), SCHEMA),
    );

    expect(a).toBeInstanceOf(BackupError);
    expect(a!.reason).toBe(b!.reason);
    expect(a!.message).toBe(b!.message);
  });
});

describe('gate 5 — the content is what the header says it is', () => {
  test('a digest that does not match the payload is refused', async () => {
    // Reached only when the plaintext was re-encrypted under a known key, so
    // GCM alone would have said yes.
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    const swapped = { ...body(), data: { txn: [{ id: 't1', amount: '999999.00', type: 'expense' }] } };
    const key = await deriveKey(PIN, new Uint8Array(b64ToBuf(env.saltB64 as string)));
    env.enc = await encryptJson(key, swapped);
    expect(await reasonOf(decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA)))
      .toBe('unreadable');
  });

  test('a size that does not match the payload is refused', async () => {
    const env = decode(await encodeBackup(body(), PIN, SCHEMA, '1.0.0'));
    env.plaintextSize = (env.plaintextSize as number) + 1;
    expect(await reasonOf(decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA)))
      .toBe('unreadable');
  });
});

describe('gate 6 — a data shape this build can read', () => {
  test('a newer schema is refused rather than misread', async () => {
    const file = await encodeBackup(body(), PIN, SCHEMA + 1, '1.0.0');
    const err = decodeBackup(file, PIN, await otherKey(), SCHEMA);
    expect(await reasonOf(err)).toBe('unreadable');
    await expect(err).rejects.toThrow(/newer version/i);
  });

  test('an older schema is accepted and reported so it can be migrated', async () => {
    const out = await decodeBackup(await encodeBackup(body(), PIN, 1, '1.0.0'), PIN, await otherKey(), SCHEMA);
    expect(out.schemaVersion).toBe(1);
  });
});

describe('older files still open', () => {
  test('a v2 envelope restores, with no schema version to report', async () => {
    const salt = new Uint8Array(16).fill(3);
    const key = await deriveKey(PIN, salt);
    const env = {
      v: 2, kdf: 'PBKDF2-SHA256', saltB64: bufToB64(salt.buffer),
      enc: await encryptJson(key, body()),
    };
    const out = await decodeBackup(reencode(env), PIN, await otherKey(), SCHEMA);
    expect(out.body).toEqual(body());
    expect(out.envelopeVersion).toBe(2);
    expect(out.schemaVersion).toBeNull();
  });

  test('a v1 envelope opens with the vault key it was written by', async () => {
    const vaultKey = await deriveKey('vault', new Uint8Array(16).fill(7));
    const env = await encryptJson(vaultKey, { ...body(), v: 1 });
    const out = await decodeBackup(reencode(env as unknown as Record<string, unknown>), undefined, vaultKey, SCHEMA);
    expect(out.body.data).toEqual(body().data);
    expect(out.envelopeVersion).toBe(1);
  });

  test('a v1 envelope from another vault says so, rather than blaming the PIN', async () => {
    const theirs = await deriveKey('vault', new Uint8Array(16).fill(7));
    const env = await encryptJson(theirs, { ...body(), v: 1 });
    expect(await reasonOf(decodeBackup(reencode(env as unknown as Record<string, unknown>), undefined, await otherKey(), SCHEMA)))
      .toBe('wrong-vault');
  });
});
