// contracts/crypto/vectors.json pins every end-to-end format to fixed bytes, so
// another client (the Flutter app) can prove it reads and writes the same
// thing. GEN_VECTORS=1 rewrites the file; otherwise this checks the code
// still produces exactly those bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fromBase64, toBase64 } from './bytes';
import { decryptRecord, encryptRecord, keyCheck, openDeviceEnvelope, ready, sealToDevice, unwrapRecovery, wrapForRecovery } from './e2e';
import { toPhrase } from './phrase';

const FILE = join(__dirname, '../../../../contracts/crypto/vectors.json');
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const DEK = hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
const DEVICE_SEED = hex('a0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebf');
const ENTROPY = hex('7f'.repeat(32));
const SALT = hex('5a'.repeat(16));
const NONCE = hex('4e'.repeat(12));
const RECORD = { recordId: 'acct-0001', collection: 'accounts', keyVersion: 1 };
const VALUE = { name: 'HDFC Savings', type: 'savings', opening: '25000.00' };

async function deviceKeys() {
  const s = await ready();
  return s.crypto_box_seed_keypair(DEVICE_SEED);
}

async function generate() {
  const keys = await deviceKeys();
  const words = await toPhrase(ENTROPY);
  return {
    _comment: 'Pinned bytes for the formats in webapp-online/src/lib/crypto/e2e.ts (ADR 0005, 0006). Base64 unless named _hex.',
    dek_hex: Buffer.from(DEK).toString('hex'),
    key_check: toBase64(await keyCheck(DEK)),
    device: {
      seed_hex: Buffer.from(DEVICE_SEED).toString('hex'),
      public_key: toBase64(keys.publicKey),
      // Sealed boxes use a fresh ephemeral key, so this one is fixed by being recorded.
      sealed_dek: toBase64(await sealToDevice(DEK, keys.publicKey)),
    },
    recovery: {
      entropy_hex: Buffer.from(ENTROPY).toString('hex'),
      words: words.join(' '),
      salt_hex: Buffer.from(SALT).toString('hex'),
      nonce_hex: Buffer.from(NONCE).toString('hex'),
      blob: toBase64(await wrapForRecovery(DEK, words, SALT, NONCE)),
    },
    record: {
      ...{ record_id: RECORD.recordId, collection: RECORD.collection, key_version: RECORD.keyVersion },
      value: VALUE,
      nonce_hex: Buffer.from(NONCE).toString('hex'),
      ciphertext: toBase64(await encryptRecord(DEK, RECORD, VALUE, NONCE)),
    },
  };
}

test('the code produces exactly the pinned vectors', async () => {
  const fresh = await generate();
  if (process.env.GEN_VECTORS === '1') writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`);
  const pinned = JSON.parse(readFileSync(FILE, 'utf8'));
  const keys = await deviceKeys();

  expect(toBase64(await keyCheck(DEK))).toBe(pinned.key_check);
  expect(toBase64(keys.publicKey)).toBe(pinned.device.public_key);
  expect(await openDeviceEnvelope(fromBase64(pinned.device.sealed_dek), keys)).toEqual(DEK);
  expect((await toPhrase(ENTROPY)).join(' ')).toBe(pinned.recovery.words);
  expect(toBase64(await wrapForRecovery(DEK, pinned.recovery.words.split(' '), SALT, NONCE))).toBe(pinned.recovery.blob);
  expect(await unwrapRecovery(fromBase64(pinned.recovery.blob), pinned.recovery.words.split(' '))).toEqual(DEK);
  expect(toBase64(await encryptRecord(DEK, RECORD, VALUE, NONCE))).toBe(pinned.record.ciphertext);
  expect(await decryptRecord(DEK, RECORD, fromBase64(pinned.record.ciphertext))).toEqual(VALUE);
}, 30_000);
