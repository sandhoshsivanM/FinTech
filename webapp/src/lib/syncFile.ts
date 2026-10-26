/**
 * Multi-device sync for the offline app, without a server (ADR 0007).
 *
 * Each device writes one encrypted file, `<deviceId>.khazana-sync`, into a
 * folder the user owns — iCloud Drive, Dropbox, a USB stick — and merges every
 * other device's file into its own vault. The folder service only ever holds
 * ciphertext. Each device writes only its own file, so two devices never fight
 * over the same file in a syncing folder.
 *
 * This module is the pure part: the file format and the merge plan. The store
 * applies the plan; `syncTransport.ts` moves the files.
 *
 * Merge is per record, last write wins on `changedAt` (see repo.ts), with
 * tombstones so a delete on one device removes the record everywhere
 * (`@khazana/domain/syncMerge`).
 */
import { mergeBundles, TOMBSTONE_TTL_MS, type SyncBundle, type SyncRecord, type Tombstone } from '@khazana/domain/syncMerge';
import { STORE } from '@khazana/domain/types';
import { b64ToBuf, bufToB64, decryptJson, deriveKey, encryptJson, type Encrypted } from './crypto';

export const SYNC_MAGIC = 'KSYN';
export const SYNC_FORMAT_VERSION = 1;
export const SYNC_EXT = '.khazana-sync';
/** Separate from the PIN, and shared by every device; long because the file sits in someone's cloud. */
export const MIN_PASSPHRASE = 12;

/**
 * Not synced:
 * - postings are derived from transactions and transfers, and rebuilt after a
 *   merge — syncing them as well would let the two disagree;
 * - receipt images would make every sync file megabytes larger. A synced
 *   transaction keeps its receipt reference; the image stays on the device
 *   that took it.
 */
export const LOCAL_ONLY_TYPES = new Set<string>([STORE.posting, STORE.attachment]);

/** Everything inside the encryption. Only magic, version and salt are readable. */
export interface SyncPayload {
  deviceId: string;
  deviceName: string;
  exportedAt: number;
  schemaVersion: number;
  bundle: SyncBundle;
}

interface SyncEnvelope {
  magic: typeof SYNC_MAGIC;
  v: number;
  kdf: 'PBKDF2-SHA256';
  saltB64: string;
  enc: Encrypted;
}

export class SyncFileError extends Error {
  constructor(public kind: 'not_sync_file' | 'wrong_passphrase' | 'newer_version', message: string) {
    super(message);
  }
}

export const syncFileName = (deviceId: string) => `${deviceId}${SYNC_EXT}`;
export const isSyncFileName = (name: string) => /^[A-Za-z0-9-]{1,64}\.khazana-sync$/.test(name);

/** The stamp sync orders by: when the record last changed, falling back for data written before stamps existed. */
export function stampOf(value: Record<string, unknown>): number {
  for (const k of ['changedAt', 'updatedAt', 'createdAt'] as const) {
    const v = value[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

/** A vault's records and tombstones as a bundle, minus what is local-only. */
export function buildBundle(
  records: { type: string; value: { id: string } & Record<string, unknown> }[],
  tombstones: Tombstone[],
): SyncBundle {
  return {
    records: records
      .filter((r) => !LOCAL_ONLY_TYPES.has(r.type))
      .map((r) => ({ id: r.value.id, type: r.type, updatedAt: stampOf(r.value), value: r.value })),
    tombstones: tombstones.filter((t) => !LOCAL_ONLY_TYPES.has(t.type)),
  };
}

export async function encodeSyncFile(payload: SyncPayload, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const envelope: SyncEnvelope = {
    magic: SYNC_MAGIC,
    v: SYNC_FORMAT_VERSION,
    kdf: 'PBKDF2-SHA256',
    saltB64: bufToB64(salt.buffer),
    enc: await encryptJson(key, payload),
  };
  return JSON.stringify(envelope);
}

/** Opens another device's file. AES-GCM authenticates it, so a tampered file fails like a wrong passphrase. */
export async function decodeSyncFile(text: string, passphrase: string, supportedSchema: number): Promise<SyncPayload> {
  let env: Partial<SyncEnvelope>;
  try {
    env = JSON.parse(text);
  } catch {
    throw new SyncFileError('not_sync_file', 'Not a Khazana sync file.');
  }
  if (!env || env.magic !== SYNC_MAGIC || typeof env.saltB64 !== 'string' || !env.enc) {
    throw new SyncFileError('not_sync_file', 'Not a Khazana sync file.');
  }
  if (typeof env.v !== 'number' || env.v > SYNC_FORMAT_VERSION) {
    throw new SyncFileError('newer_version', 'Written by a newer version of Khazana. Update this device.');
  }
  const key = await deriveKey(passphrase, new Uint8Array(b64ToBuf(env.saltB64)));
  let payload: SyncPayload;
  try {
    payload = await decryptJson<SyncPayload>(key, env.enc);
  } catch {
    throw new SyncFileError('wrong_passphrase', 'This file does not open with your sync passphrase.');
  }
  if (payload.schemaVersion > supportedSchema) {
    throw new SyncFileError('newer_version', 'Written by a newer version of Khazana. Update this device.');
  }
  if (!payload.bundle || !Array.isArray(payload.bundle.records) || !Array.isArray(payload.bundle.tombstones)) {
    throw new SyncFileError('not_sync_file', 'Not a Khazana sync file.');
  }
  return payload;
}

const k = (type: string, id: string) => `${type} ${id}`;

export interface SyncPlan {
  /** Records to write locally, carrying their original stamps. */
  upserts: SyncRecord[];
  /** Records to remove locally. */
  deletes: { type: string; id: string }[];
  /** The full tombstone set to keep. */
  tombstones: Tombstone[];
  /** Newest stamp seen in any remote file. */
  maxRemoteStamp: number;
  /** The vault as it will be after the plan is applied, ready to write as this device's file. */
  merged: SyncBundle;
  /** Device files ignored because they are older than the tombstone window. */
  stale: string[];
}

/**
 * Folds every other device's bundle into this one.
 *
 * `joining` is a device's first sync on an empty vault: it adopts the others'
 * data outright instead of merging its own freshly seeded categories and
 * profile into everyone else's, which would give every device two "Food"
 * categories and two "Personal" profiles.
 *
 * A file older than the tombstone window is skipped: the deletes it missed
 * have been forgotten, and merging it would bring those records back.
 */
export function planSync(
  local: SyncBundle,
  remotes: { deviceId: string; exportedAt: number; bundle: SyncBundle }[],
  opts: { now: number; joining: boolean },
): SyncPlan {
  const stale: string[] = [];
  const usable = remotes.filter((r) => {
    if (opts.now - r.exportedAt > TOMBSTONE_TTL_MS) {
      stale.push(r.deviceId);
      return false;
    }
    return true;
  });

  const joining = opts.joining && usable.length > 0;
  let state: SyncBundle = joining ? { records: [], tombstones: [] } : local;
  let maxRemoteStamp = 0;
  for (const r of usable) {
    for (const rec of r.bundle.records) maxRemoteStamp = Math.max(maxRemoteStamp, rec.updatedAt);
    for (const t of r.bundle.tombstones) maxRemoteStamp = Math.max(maxRemoteStamp, t.deletedAt);
    const result = mergeBundles(state, r.bundle, opts.now);
    const recs = new Map(state.records.map((x) => [k(x.type, x.id), x]));
    for (const d of result.deletes) recs.delete(k(d.type, d.id));
    for (const u of result.upserts) recs.set(k(u.type, u.id), u);
    state = { records: [...recs.values()], tombstones: result.tombstones };
  }

  const before = new Map(local.records.map((x) => [k(x.type, x.id), x]));
  const after = new Map(state.records.map((x) => [k(x.type, x.id), x]));
  const upserts = state.records.filter((x) => {
    const was = before.get(k(x.type, x.id));
    return !was || was.updatedAt !== x.updatedAt;
  });
  const deletes = local.records
    .filter((x) => !after.has(k(x.type, x.id)))
    .map((x) => ({ type: x.type, id: x.id }));

  return { upserts, deletes, tombstones: state.tombstones, maxRemoteStamp, merged: state, stale };
}
