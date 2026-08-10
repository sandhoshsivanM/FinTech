/**
 * The backup file format, and the gates a file must pass before it is trusted.
 *
 * The web export used to be base64-of-JSON named `.ftos`. It carried no magic
 * header, no content hash and no schema version, so the only thing standing
 * between a corrupt file and the user's vault was `JSON.parse` failing. The
 * Flutter side already had all of this (`lib/features/import/backup_service.dart`)
 * and the two clients are meant to describe the same contract.
 *
 * v3 adds the header. v1 and v2 still import — a format change that orphans
 * every backup a user already made is not a safety improvement.
 *
 * On the error messages: a wrong PIN and a tampered file must be
 * indistinguishable. Telling an attacker which of the two they hit turns the
 * restore screen into an oracle for guessing PINs against a stolen file.
 */
import { b64ToBuf, bufToB64, decryptJson, deriveKey, encryptJson, type Encrypted } from './crypto';
import { BackupError } from './backupError';

/** Four bytes that say "this is ours". Shared with the Flutter writer. */
export const MAGIC = 'FTOS';

/** The envelope format this build writes. Readers accept 1, 2 and 3. */
export const ENVELOPE_VERSION = 3;

export interface BackupBody {
  vaultId: string;
  exportedAt: number;
  data: Record<string, unknown[]>;
}

export interface EnvelopeV3 {
  magic: typeof MAGIC;
  v: 3;
  /** The persisted data shape, so an older backup can be migrated forward. */
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  kdf: 'PBKDF2-SHA256';
  saltB64: string;
  /** Byte length of the plaintext, checked alongside the digest. */
  plaintextSize: number;
  /** SHA-256 over the exact plaintext bytes, base64. */
  sha256: string;
  enc: Encrypted;
}

async function sha256B64(bytes: Uint8Array): Promise<string> {
  return bufToB64(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

/**
 * Compares two digests without leaking where they first differ.
 *
 * Overkill for a local file check, and cheap enough that being consistent about
 * it costs nothing. Mirrors `_constantTimeEquals` on the Flutter side.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const encodeBody = (body: BackupBody) => new TextEncoder().encode(JSON.stringify(body));

/** Builds a v3 file: header in the clear, everything of value encrypted. */
export async function encodeBackup(
  body: BackupBody, pin: string, schemaVersion: number, appVersion: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const plaintext = encodeBody(body);

  const envelope: EnvelopeV3 = {
    magic: MAGIC,
    v: ENVELOPE_VERSION,
    schemaVersion,
    appVersion,
    exportedAt: body.exportedAt,
    kdf: 'PBKDF2-SHA256',
    saltB64: bufToB64(salt.buffer),
    plaintextSize: plaintext.byteLength,
    sha256: await sha256B64(plaintext),
    // Encrypts the identical representation that was hashed above, so the
    // digest describes what actually travels.
    enc: await encryptJson(key, body),
  };
  return bufToB64(new TextEncoder().encode(JSON.stringify(envelope)).buffer);
}

const CORRUPT = new BackupError(
  'unreadable',
  'That file is not a Khazana backup, or it was altered in transit. Re-export it and try again.',
);

const wrongSecret = (v: number) => new BackupError(
  v >= 2 ? 'wrong-pin' : 'wrong-vault',
  v >= 2
    ? 'That PIN does not open this backup. It must be the PIN in use when the backup was exported, which is not necessarily your current one.'
    : 'This is an older backup that can only be restored into the exact vault that created it — the same browser or app install, never a second device. Export a new backup from that device to move the data.',
);

export interface DecodedBackup {
  body: BackupBody;
  envelopeVersion: number;
  /** Absent on v1/v2, which carried no schema version. */
  schemaVersion: number | null;
}

/**
 * Opens a backup, or refuses it.
 *
 * Gates, in order (§6.1): magic → envelope version → structure → decrypt →
 * digest and size → schema version. Nothing here writes; the caller decides
 * what to do with a body only after this returns.
 *
 * @param vaultKey used only for v1 files, which were encrypted with the
 *   vault's own key rather than a PIN-derived one.
 */
export async function decodeBackup(
  b64: string, pin: string | undefined, vaultKey: CryptoKey, supportedSchema: number,
): Promise<DecodedBackup> {
  // 1. Readable at all.
  let outer: Record<string, unknown>;
  try {
    outer = JSON.parse(new TextDecoder().decode(b64ToBuf(b64)));
  } catch {
    throw CORRUPT;
  }
  if (!outer || typeof outer !== 'object') throw CORRUPT;

  const v = typeof outer.v === 'number' ? outer.v : 1;

  // 2. A version this build knows. Refusing a newer file is the point: opening
  //    it with today's reader would silently discard fields it cannot see.
  if (v > ENVELOPE_VERSION) {
    throw new BackupError(
      'unreadable',
      'This backup was written by a newer version of Khazana. Update the app, then restore it.',
    );
  }

  // 3. Magic, where the format has one, and a well-formed envelope.
  if (v >= 3 && outer.magic !== MAGIC) throw CORRUPT;
  const enc = outer.enc ?? outer;
  if (!enc || typeof enc !== 'object' || typeof (enc as Encrypted).ct !== 'string') throw CORRUPT;

  // 4. The right key.
  let key = vaultKey;
  if (v >= 2) {
    if (typeof outer.saltB64 !== 'string') throw CORRUPT;
    if (!pin) throw new BackupError('needs-pin', 'This backup needs the PIN it was exported with.');
    key = await deriveKey(pin, new Uint8Array(b64ToBuf(outer.saltB64)));
  }

  let body: BackupBody;
  try {
    body = await decryptJson<BackupBody>(key, enc as Encrypted);
  } catch {
    // A wrong PIN and a tampered ciphertext both land here, and both say the
    // same thing. GCM cannot tell them apart and neither should we.
    throw wrongSecret(v);
  }

  // 5. Content integrity. AES-GCM already authenticates the ciphertext, so a
  //    mismatch here means the plaintext was re-encrypted under a key the
  //    writer knew — which is not a file we should open.
  if (v >= 3) {
    const bytes = encodeBody(body);
    if (typeof outer.plaintextSize !== 'number' || bytes.byteLength !== outer.plaintextSize) throw CORRUPT;
    if (typeof outer.sha256 !== 'string' || !constantTimeEquals(await sha256B64(bytes), outer.sha256)) {
      throw CORRUPT;
    }
  }

  // 6. A data shape this build can read. Older is migrated by the caller;
  //    newer cannot be, because the migration that produced it does not exist
  //    here yet.
  const schemaVersion = v >= 3 && typeof outer.schemaVersion === 'number' ? outer.schemaVersion : null;
  if (schemaVersion != null && schemaVersion > supportedSchema) {
    throw new BackupError(
      'unreadable',
      'This backup holds data from a newer version of Khazana. Update the app, then restore it.',
    );
  }

  if (!body || typeof body !== 'object' || typeof body.data !== 'object') throw CORRUPT;
  return { body, envelopeVersion: v, schemaVersion };
}
