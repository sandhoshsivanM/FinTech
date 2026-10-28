// The delivery key ring (ADR 0008): X25519 key pairs that bank and investment
// data from the Account Aggregator is sealed to. The server only ever gets a
// PUBLIC key (with each consent request). Each private key is kept as one
// encrypted sync record under the account's data key, so every device of the
// user can open what any consent delivers, and the server can't.
//
// A ring, not a single record: two devices that each make a key before they
// have synced would otherwise overwrite each other, and a consent made with the
// lost key could never be opened. Every key ever made is kept; a payload is
// opened by trying them (a sealed box fails fast under the wrong key). The
// oldest key is the one new consents use, so devices converge after a sync.
import { fromBase64, own, toBase64, utf8 } from '../crypto/bytes';
import { DEVICE_ALG, KEY_VERSION, decryptRecord, encryptRecord, ready } from '../crypto/e2e';
import type { LocalRecord } from '../vault';

/** Sync collection for the ring (server rule ^[a-z][a-z0-9_]{0,31}$). */
export const DELIVERY_KEYS = 'aa_delivery_keys';

export type DeliveryKey = { publicKey: Uint8Array; privateKey: Uint8Array; createdAt: string };

type Stored = { id: string; alg: typeof DEVICE_ALG; public_key: string; private_key: string; created_at: string };

export interface DeliveryKeyDeps {
  dek: () => Uint8Array;
  records: { all(): Promise<LocalRecord[]> };
  /** Stores and queues for sync (SyncEngine.saveMany). */
  save: (records: LocalRecord[]) => Promise<void>;
  /** Pulls other devices' records (and pushes ours). */
  sync?: () => Promise<void>;
  now?: () => Date;
}

const b64url = (b: Uint8Array) => toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Record id: a hash of the public key, so a record can't be replayed under another key's id. */
export async function deliveryRecordId(publicKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', own(utf8(`aa_delivery_key\0${toBase64(publicKey)}`))));
  return b64url(digest);
}

/** Every delivery key this account has, oldest first. Records that don't open or don't check out are ignored. */
export async function loadDeliveryKeys(deps: Pick<DeliveryKeyDeps, 'dek' | 'records'>): Promise<DeliveryKey[]> {
  const s = await ready();
  const dek = deps.dek();
  const out: DeliveryKey[] = [];
  for (const r of await deps.records.all()) {
    if (r.collection !== DELIVERY_KEYS || r.deleted || !r.ciphertext) continue;
    let stored: Stored;
    try {
      stored = await decryptRecord<Stored>(dek, { recordId: r.recordId, collection: r.collection, keyVersion: r.keyVersion }, r.ciphertext);
    } catch {
      continue;
    }
    if (stored?.alg !== DEVICE_ALG || typeof stored.public_key !== 'string' || typeof stored.private_key !== 'string') continue;
    const publicKey = fromBase64(stored.public_key);
    const privateKey = fromBase64(stored.private_key);
    if (publicKey.length !== 32 || privateKey.length !== 32) continue;
    // The pair must be a pair, and the record must be the one for this key.
    if (toBase64(s.crypto_scalarmult_base(privateKey)) !== stored.public_key) continue;
    if ((await deliveryRecordId(publicKey)) !== r.recordId) continue;
    out.push({ publicKey, privateKey, createdAt: stored.created_at });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || toBase64(a.publicKey).localeCompare(toBase64(b.publicKey)));
}

/**
 * The key new consents are sealed to. Syncs first when this device has none, so
 * a second device adopts the first one's key instead of making its own.
 */
export async function ensureDeliveryKey(deps: DeliveryKeyDeps): Promise<DeliveryKey> {
  let ring = await loadDeliveryKeys(deps);
  if (ring.length === 0 && deps.sync) {
    await deps.sync();
    ring = await loadDeliveryKeys(deps);
  }
  if (ring.length > 0) return ring[0];

  const s = await ready();
  const { publicKey, privateKey } = s.crypto_box_keypair();
  const createdAt = (deps.now?.() ?? new Date()).toISOString();
  const recordId = await deliveryRecordId(publicKey);
  const value: Stored = { id: recordId, alg: DEVICE_ALG, public_key: toBase64(publicKey), private_key: toBase64(privateKey), created_at: createdAt };
  const ciphertext = await encryptRecord(deps.dek(), { recordId, collection: DELIVERY_KEYS, keyVersion: KEY_VERSION }, value);
  await deps.save([{ collection: DELIVERY_KEYS, recordId, updatedAt: createdAt, deleted: false, ciphertext, keyVersion: KEY_VERSION }]);
  // Up to the server at once, so the user's other devices can open this consent's data.
  await deps.sync?.();
  return { publicKey, privateKey, createdAt };
}
