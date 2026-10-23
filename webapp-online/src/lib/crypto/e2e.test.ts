import { describe, expect, test } from 'vitest';
import {
  decryptRecord, encryptRecord, keyCheck, KeyError, newDek, newDeviceKeyPair, openDeviceEnvelope,
  sealToDevice, unwrapRecovery, wrapForRecovery,
} from './e2e';
import { parsePhrase, PhraseError, toPhrase } from './phrase';
import { random } from './bytes';

describe('device envelopes', () => {
  test('a DEK sealed to a device opens only on that device', async () => {
    const dek = newDek();
    const phone = await newDeviceKeyPair();
    const laptop = await newDeviceKeyPair();
    const box = await sealToDevice(dek, phone.publicKey);
    expect(box.length).toBeGreaterThanOrEqual(48);
    expect(await openDeviceEnvelope(box, phone)).toEqual(dek);
    await expect(openDeviceEnvelope(box, laptop)).rejects.toBeInstanceOf(KeyError);
  });
});

describe('recovery', () => {
  test('the right phrase unwraps the DEK; a wrong one is refused', async () => {
    const dek = newDek();
    const words = await toPhrase(random(32));
    const blob = await wrapForRecovery(dek, words);
    expect(blob.length).toBe(16 + 12 + 32 + 16);
    expect(await unwrapRecovery(blob, words)).toEqual(dek);
    const other = await toPhrase(random(32));
    await expect(unwrapRecovery(blob, other)).rejects.toBeInstanceOf(KeyError);
  }, 30_000);

  test('a typed phrase is forgiving about case, spacing and four-letter prefixes', async () => {
    const words = await toPhrase(random(32));
    const typed = words.map((w, i) => (i % 2 ? w.slice(0, 4).toUpperCase() : w)).join(' ,\n ');
    expect(await parsePhrase(typed)).toEqual(words);
  });

  test('a typo, a swap or a missing word is caught', async () => {
    const words = await toPhrase(random(32));
    await expect(parsePhrase(words.slice(0, 23).join(' '))).rejects.toBeInstanceOf(PhraseError);
    await expect(parsePhrase([...words.slice(0, 23), 'notaword'].join(' '))).rejects.toThrow(/not in the list/);
    const swapped = [...words];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    if (swapped[0] !== swapped[1]) await expect(parsePhrase(swapped.join(' '))).rejects.toThrow(/valid phrase/);
  });
});

describe('records', () => {
  const id = { recordId: 'txn-1', collection: 'transactions', keyVersion: 1 };

  test('a record round-trips, and the ciphertext is at least the server minimum (28 bytes)', async () => {
    const dek = newDek();
    const blob = await encryptRecord(dek, id, { amount: '120.50' });
    expect(blob.length).toBeGreaterThanOrEqual(28);
    expect(await decryptRecord(dek, id, blob)).toEqual({ amount: '120.50' });
  });

  test('a ciphertext moved to another record or collection fails to decrypt', async () => {
    const dek = newDek();
    const blob = await encryptRecord(dek, id, { amount: '120.50' });
    await expect(decryptRecord(dek, { ...id, recordId: 'txn-2' }, blob)).rejects.toBeInstanceOf(KeyError);
    await expect(decryptRecord(dek, { ...id, collection: 'accounts' }, blob)).rejects.toBeInstanceOf(KeyError);
    await expect(decryptRecord(newDek(), id, blob)).rejects.toBeInstanceOf(KeyError);
  });

  test('the key check is 32 bytes and differs per key', async () => {
    const a = await keyCheck(newDek());
    expect(a.length).toBe(32);
    expect(a).not.toEqual(await keyCheck(newDek()));
  });
});
