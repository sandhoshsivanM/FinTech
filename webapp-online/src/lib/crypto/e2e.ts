// End-to-end encryption for Khazana Online (ADR 0005, 0006). Every format here
// is a contract with the server's checks and with the other clients, pinned by
// contracts/crypto/vectors.json:
//
// - Data key (DEK): 32 random bytes, one per account.
// - Device envelope "x25519-sealedbox-v1": libsodium crypto_box_seal of the DEK
//   to the device's X25519 public key.
// - Recovery envelope "argon2id-aes256gcm-v1": salt(16) ‖ nonce(12) ‖
//   AES-256-GCM(DEK), under Argon2id(phrase, salt, ops 3, 64 MiB). The phrase
//   is the 24 canonical words joined by single spaces.
// - Key check: HKDF-SHA256(DEK, no salt, info "khazana.key-check.v1"), 32 bytes.
//   The server keeps its hash to refuse an envelope for the wrong key.
// - Record: nonce(12) ‖ AES-256-GCM(JSON), with additional data
//   "record_id|collection|key_version", so a ciphertext can't be moved to
//   another record or collection without failing to decrypt.
import sodium from 'libsodium-wrappers-sumo';
import { concat, fromUtf8, own, random, utf8 } from './bytes';

export const DEVICE_ALG = 'x25519-sealedbox-v1';
export const RECOVERY_ALG = 'argon2id-aes256gcm-v1';
export const KEY_VERSION = 1;

const ARGON_OPS = 3;
const ARGON_MEM = 64 * 1024 * 1024;

export async function ready(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

export type X25519KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

export async function newDeviceKeyPair(): Promise<X25519KeyPair> {
  const s = await ready();
  const { publicKey, privateKey } = s.crypto_box_keypair();
  return { publicKey, privateKey };
}

export const newDek = () => random(32);

export async function sealToDevice(dek: Uint8Array, devicePublicKey: Uint8Array): Promise<Uint8Array> {
  return (await ready()).crypto_box_seal(dek, devicePublicKey);
}

export async function openDeviceEnvelope(envelope: Uint8Array, keys: X25519KeyPair): Promise<Uint8Array> {
  try {
    return (await ready()).crypto_box_seal_open(envelope, keys.publicKey, keys.privateKey);
  } catch {
    throw new KeyError('This envelope was not sealed to this device.');
  }
}

export async function keyCheck(dek: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', own(dek), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8('khazana.key-check.v1') },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function aesKey(raw: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', own(raw), 'AES-GCM', false, usage);
}

async function recoveryKey(words: string[], salt: Uint8Array): Promise<CryptoKey> {
  const s = await ready();
  const raw = s.crypto_pwhash(32, utf8(words.join(' ')), salt, ARGON_OPS, ARGON_MEM, s.crypto_pwhash_ALG_ARGON2ID13);
  return aesKey(raw, ['encrypt', 'decrypt']);
}

/** The DEK wrapped under the recovery phrase. `salt`/`nonce` are for test vectors only. */
export async function wrapForRecovery(dek: Uint8Array, words: string[], salt = random(16), nonce = random(12)): Promise<Uint8Array> {
  const key = await recoveryKey(words, salt);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: own(nonce) }, key, own(dek)));
  return concat(salt, nonce, sealed);
}

export async function unwrapRecovery(blob: Uint8Array, words: string[]): Promise<Uint8Array> {
  const key = await recoveryKey(words, blob.slice(0, 16));
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: own(blob.slice(16, 28)) }, key, own(blob.slice(28))));
  } catch {
    throw new KeyError('That recovery phrase doesn’t open this account’s key.');
  }
}

export type RecordId = { recordId: string; collection: string; keyVersion: number };

const aad = ({ recordId, collection, keyVersion }: RecordId) => utf8(`${recordId}|${collection}|${keyVersion}`);

/** `nonce` is for test vectors only. */
export async function encryptRecord(dek: Uint8Array, id: RecordId, value: unknown, nonce = random(12)): Promise<Uint8Array> {
  const key = await aesKey(dek, ['encrypt']);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: own(nonce), additionalData: own(aad(id)) },
    key,
    own(utf8(JSON.stringify(value))),
  );
  return concat(nonce, new Uint8Array(sealed));
}

export async function decryptRecord<T>(dek: Uint8Array, id: RecordId, blob: Uint8Array): Promise<T> {
  const key = await aesKey(dek, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: own(blob.slice(0, 12)), additionalData: own(aad(id)) },
      key,
      own(blob.slice(12)),
    );
    return JSON.parse(fromUtf8(new Uint8Array(plain))) as T;
  } catch {
    throw new KeyError(`Record ${id.collection}/${id.recordId} could not be decrypted.`);
  }
}

export class KeyError extends Error {}
