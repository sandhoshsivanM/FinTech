import { describe, expect, test } from 'vitest';
import { STORE } from '@khazana/domain/types';
import { newDek } from '../crypto/e2e';
import {
  COLLECTION, MAX_CIPHERTEXT, NOT_SYNCED, RECORD_ID, RecordTooLargeError, SYNCED_TYPES, collectionOf, decodeEntity,
  encodeEntity, recordIdFor, snake, tombstoneFor, typeOfCollection,
} from './codec';

describe('collections', () => {
  test('every synced type maps to a valid, unique, reversible collection; postings and attachments are not synced', () => {
    const cols = SYNCED_TYPES.map(collectionOf);
    for (const c of cols) expect(c).toMatch(COLLECTION);
    expect(new Set(cols).size).toBe(cols.length);
    for (const t of SYNCED_TYPES) expect(typeOfCollection(collectionOf(t))).toBe(t);
    expect(NOT_SYNCED).toEqual(new Set([STORE.posting, STORE.attachment]));
    expect(SYNCED_TYPES).toHaveLength(Object.keys(STORE).length - 2);
    expect(() => collectionOf(STORE.posting)).toThrow();
  });

  test('camelCase store names become snake_case', () => {
    expect(snake('pendingCapture')).toBe('pending_capture');
    expect(collectionOf('importBatch')).toBe('import_batch');
    expect(collectionOf('watchItem')).toBe('watch_item');
    expect(collectionOf('fxRate')).toBe('fx_rate');
    expect(collectionOf('txn')).toBe('txn');
  });

  test('none of them is a legacy collection', () => {
    for (const c of SYNCED_TYPES.map(collectionOf)) expect(['accounts', 'transactions', 'cards']).not.toContain(c);
  });
});

describe('record ids', () => {
  test('whatever the entity id, the record id fits the server rule (fuzz)', async () => {
    const alphabet = ['a', 'Z', '0', '-', '_', ':', '/', ' ', '.', '%', "'", 'é', '日', '\u0000', '\n', '😀'];
    const seen = new Set<string>();
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 400; i++) {
      const len = 1 + Math.floor(rnd() * (i % 5 === 0 ? 300 : 40));
      const id = Array.from({ length: len }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      const type = SYNCED_TYPES[i % SYNCED_TYPES.length];
      const rid = await recordIdFor(type, id);
      expect(rid).toMatch(RECORD_ID);
      expect(rid).toHaveLength(43);
      seen.add(rid);
    }
    expect(seen.size).toBe(400);
  });

  test('real ids that the server rule would refuse raw (colons, 80+ characters) are fine hashed', async () => {
    const long = `acct-exp-${'p'.repeat(36)}-${'c'.repeat(36)}`;
    expect(long).not.toMatch(RECORD_ID);
    expect(await recordIdFor('account', long)).toMatch(RECORD_ID);
    expect('t1:dr').not.toMatch(RECORD_ID);
  });

  test('unique across collections: the same entity id under two types never shares a record id', async () => {
    const ids = await Promise.all(SYNCED_TYPES.map((t) => recordIdFor(t, 'same-id')));
    expect(new Set(ids).size).toBe(SYNCED_TYPES.length);
    expect(await recordIdFor('txn', 'a')).toBe(await recordIdFor('txn', 'a'));
    // No separator ambiguity between type and id.
    expect(await recordIdFor('txn', 'x')).not.toBe(await recordIdFor('tx', 'nx'));
  });
});

describe('encode / decode', () => {
  const dek = newDek();
  const sample: Record<string, { id: string } & Record<string, unknown>> = {
    txn: { id: 't1', vaultId: 'default', profileId: 'p', amount: '12.34', type: 'expense', categoryId: 'cat-food', merchant: null, note: 'é 日', date: 1, createdAt: 1, last4: '1234' },
    category: { id: 'cat-food', vaultId: 'default', name: 'Food', icon: 'Utensils' },
    budget: { id: 'b', vaultId: 'default', categoryId: 'c', amountLimit: '5', rolloverEnabled: false, alertThresholdPct: 80 },
    goal: { id: 'g', vaultId: 'default', name: 'Car', goalType: 'vehicle', targetAmount: '9', currentAmount: '1' },
    holding: { id: 'h', vaultId: 'default', symbol: 'INFY', exchange: 'NSE', quantity: '3', avgCost: '10.5', assetType: 'equity' },
    liability: { id: 'l', vaultId: 'default', name: 'Loan', principal: '100' },
    recurring: { id: 'r', vaultId: 'default', amount: '1', type: 'expense', categoryId: 'c', frequency: 'monthly', nextRun: 1 },
    profile: { id: 'p', vaultId: 'default', name: 'Me', kind: 'self', createdAt: 1 },
    insurance: { id: 'i', vaultId: 'default', name: 'Term' },
    snapshot: { id: 'snap-p-2026-10-27', vaultId: 'default', date: 1, netWorth: '1' },
    account: { id: 'acct-exp-p-cat-food', vaultId: 'default', name: 'Food', type: 'expense', subtype: 'expense', openingBalance: '0' },
    transfer: { id: 'x', vaultId: 'default', fromAccountId: 'a', toAccountId: 'b', amount: '1', date: 1, createdAt: 1 },
    pendingCapture: { id: 'pc', vaultId: 'default', amount: '1', type: 'expense', occurredAt: 1, source: 'sms', fingerprint: 'f', capturedAt: 1 },
    watchItem: { id: 'w', vaultId: 'default', symbol: 'TCS', addedAt: 1 },
    dividend: { id: 'd', vaultId: 'default', payDate: 1 },
    alert: { id: 'al', vaultId: 'default', createdAt: 1 },
    importBatch: { id: 'ib', vaultId: 'default', at: 1, filename: 'a.csv', kind: 'transactions', created: [{ type: 'txn', id: 't1' }], updatedCount: 0 },
    lot: { id: 'lot', vaultId: 'default', purchaseDate: 1 },
    fxRate: { id: 'USD', code: 'USD', rateToInr: '83.5', asOf: 1, source: 'manual' },
  };

  test('every synced type round-trips through ciphertext', async () => {
    expect(Object.keys(sample).sort()).toEqual([...SYNCED_TYPES].sort());
    for (const [type, entity] of Object.entries(sample)) {
      const rec = await encodeEntity(dek, type, entity, '2026-10-27T10:00:00.000Z');
      expect(rec.collection).toBe(collectionOf(type));
      expect(rec.recordId).toBe(await recordIdFor(type, entity.id));
      expect(rec.deleted).toBe(false);
      expect(await decodeEntity(dek, rec)).toEqual({ type, entity });
    }
  });

  test('the value is ciphertext: no field text in the bytes', async () => {
    const rec = await encodeEntity(dek, 'txn', sample.txn, 'x');
    expect(new TextDecoder('latin1').decode(rec.ciphertext!)).not.toContain('expense');
  });

  test('a record moved to another collection or id cannot be opened', async () => {
    const rec = await encodeEntity(dek, 'txn', sample.txn, 'x');
    expect(await decodeEntity(dek, { ...rec, collection: 'budget' })).toBeUndefined();
    expect(await decodeEntity(dek, { ...rec, recordId: await recordIdFor('txn', 'other') })).toBeUndefined();
    expect(await decodeEntity(newDek(), rec)).toBeUndefined();
    expect(await decodeEntity(dek, { ...rec, collection: 'accounts' })).toBeUndefined();
  });

  test('tombstones carry no ciphertext and decode to nothing', async () => {
    const t = await tombstoneFor('txn', 't1', 'x');
    expect(t).toMatchObject({ collection: 'txn', deleted: true, ciphertext: null });
    expect(t.recordId).toBe(await recordIdFor('txn', 't1'));
    expect(await decodeEntity(dek, t)).toBeUndefined();
  });

  test('a profile photo stays on the device; an oversize entity is refused with a clear error', async () => {
    const rec = await encodeEntity(dek, 'profile', { ...sample.profile, photo: 'data:image/jpeg;base64,' + 'A'.repeat(200_000) }, 'x');
    expect(rec.ciphertext!.length).toBeLessThanOrEqual(MAX_CIPHERTEXT);
    expect((await decodeEntity(dek, rec))!.entity).toEqual(sample.profile);
    await expect(encodeEntity(dek, 'txn', { ...sample.txn, note: 'x'.repeat(70_000) }, 'x')).rejects.toThrow(RecordTooLargeError);
  });
});
