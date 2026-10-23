// This device's part in Khazana Online's end-to-end encryption (ADR 0005):
// register its X25519 key, get the account's data key (DEK) by creating it
// (first device), pairing with a device that has it, or the recovery phrase,
// and unlock it from the local envelope on every start.
//
// The DEK only ever exists in memory here and on the user's other devices.
// The server holds envelopes it can't open and a hash of the key check.
import { fromBase64, own, random, toBase64 } from './crypto/bytes';
import {
  DEVICE_ALG, KEY_VERSION, KeyError, RECOVERY_ALG, keyCheck, newDek, newDeviceKeyPair, openDeviceEnvelope,
  sealToDevice, unwrapRecovery, wrapForRecovery, type X25519KeyPair,
} from './crypto/e2e';
import { parsePhrase, toPhrase } from './crypto/phrase';
import * as vault from './vault';

export type DeviceStatus = { device_id: string; has_key: boolean; account_has_keys: boolean; key_version: number | null };
type Envelope = { wrapped_dek: string; alg: string; key_version: number };
type PairingStart = { pairing_id: string; code: string; expires_at: string };
type PairingTarget = { new_device_id: string; name: string; platform: string; public_key: string };

type Gateway = { call<T>(method: string, path: string, body?: unknown): Promise<T> };
type Store = Pick<typeof vault,
  'loadDeviceKeys' | 'saveDeviceKeys' | 'loadWrapKey' | 'saveWrapKey' | 'loadEnvelope' | 'saveEnvelope'>;

const b64url = (b: Uint8Array) => toBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The fingerprint a pairing link carries: base64url(SHA-256(public key)). */
export async function fingerprint(publicKey: Uint8Array): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', own(publicKey))));
}

export class AccountKeys {
  private dek: Uint8Array | undefined;
  private keys: Promise<X25519KeyPair> | undefined;

  constructor(
    private readonly gateway: Gateway,
    private readonly store: Store = vault,
    private readonly sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** The DEK, once unlocked. */
  get dataKey(): Uint8Array {
    if (!this.dek) throw new KeyError('Locked: this device has no data key yet.');
    return this.dek;
  }

  get unlocked() {
    return this.dek !== undefined;
  }

  /**
   * This device's X25519 key pair: created once, private half kept wrapped.
   * Concurrent callers share one load: two pages' effects starting at once
   * once made two key pairs, registered one and stored the other.
   */
  deviceKeys(): Promise<X25519KeyPair> {
    this.keys ??= this.loadOrCreateKeys();
    this.keys.catch(() => (this.keys = undefined));
    return this.keys;
  }

  private async loadOrCreateKeys(): Promise<X25519KeyPair> {
    const stored = await this.store.loadDeviceKeys();
    const wrapKey = await this.store.loadWrapKey();
    if (stored && wrapKey) {
      const privateKey = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: own(stored.iv) }, wrapKey, own(stored.wrappedPrivate)));
      return { publicKey: stored.publicKey, privateKey };
    }
    const keys = await newDeviceKeyPair();
    const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = random(12);
    const wrappedPrivate = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: own(iv) }, fresh, own(keys.privateKey)));
    await this.store.saveWrapKey(fresh);
    await this.store.saveDeviceKeys({ publicKey: keys.publicKey, wrappedPrivate, iv });
    return keys;
  }

  /** Registers this device (idempotent for the same key) and returns its status. */
  async register(name: string): Promise<DeviceStatus> {
    const { publicKey } = await this.deviceKeys();
    return this.gateway.call<DeviceStatus>('POST', '/v1/devices/register', {
      platform: 'web', public_key: toBase64(publicKey), name: name.slice(0, 64),
    });
  }

  status = () => this.gateway.call<DeviceStatus>('GET', '/v1/devices/me');

  /** Opens the DEK from this device's stored envelope. False if there isn't one. */
  async unlock(): Promise<boolean> {
    const envelope = await this.store.loadEnvelope();
    if (!envelope) return false;
    this.dek = await openDeviceEnvelope(envelope.wrappedDek, await this.deviceKeys());
    return true;
  }

  /** Opens the DEK from this device's envelope on the server (when the local copy is gone). */
  async unlockFromServer(): Promise<void> {
    const envelope = await this.gateway.call<Envelope>('GET', '/v1/keys/envelopes/self');
    const sealed = fromBase64(envelope.wrapped_dek);
    await this.keep(await openDeviceEnvelope(sealed, await this.deviceKeys()), sealed);
  }

  private async keep(dek: Uint8Array, wrappedDek: Uint8Array) {
    await this.store.saveEnvelope({ wrappedDek, keyVersion: KEY_VERSION });
    this.dek = dek;
  }

  private async ownEnvelope(dek: Uint8Array): Promise<{ wire: Envelope; sealed: Uint8Array }> {
    const sealed = await sealToDevice(dek, (await this.deviceKeys()).publicKey);
    return { sealed, wire: { wrapped_dek: toBase64(sealed), alg: DEVICE_ALG, key_version: KEY_VERSION } };
  }

  /**
   * First device of a new account: a fresh DEK and a 24-word phrase. Show the
   * words, then call `save()`; nothing reaches the server before that.
   */
  async createAccountKey(): Promise<{ words: string[]; save: () => Promise<void> }> {
    const dek = newDek();
    const words = await toPhrase(random(32));
    return {
      words,
      save: async () => {
        const own = await this.ownEnvelope(dek);
        const recovery = await wrapForRecovery(dek, words);
        await this.gateway.call('POST', '/v1/keys/bootstrap', {
          device: own.wire,
          recovery: { wrapped_dek: toBase64(recovery), alg: RECOVERY_ALG, key_version: KEY_VERSION },
          key_check: toBase64(await keyCheck(dek)),
        });
        await this.keep(dek, own.sealed);
      },
    };
  }

  /** Another device: the recovery phrase opens the DEK, then this device gets its own envelope. */
  async recover(typed: string): Promise<void> {
    const words = await parsePhrase(typed);
    const recovery = await this.gateway.call<Envelope>('GET', '/v1/keys/envelopes/recovery');
    const dek = await unwrapRecovery(fromBase64(recovery.wrapped_dek), words);
    await this.addOwnEnvelope(dek);
  }

  /**
   * After signing in again on a device that still holds the DEK (a session
   * that expired, not a sign-out): give the new session's device its envelope.
   */
  async adoptLocalKey(): Promise<boolean> {
    if (!(await this.unlock())) return false;
    await this.addOwnEnvelope(this.dataKey);
    return true;
  }

  private async addOwnEnvelope(dek: Uint8Array) {
    const own = await this.ownEnvelope(dek);
    await this.gateway.call('POST', '/v1/keys/envelopes/self', { envelope: own.wire, key_check: toBase64(await keyCheck(dek)) });
    await this.keep(dek, own.sealed);
  }

  /** New device: start pairing. The link goes to a device that has the key. */
  async startPairing(origin: string): Promise<{ link: string; expiresAt: Date }> {
    const start = await this.gateway.call<PairingStart>('POST', '/v1/devices/pairing');
    const h = await fingerprint((await this.deviceKeys()).publicKey);
    // The fragment never reaches any server: id, one-time code and this key's fingerprint.
    const link = `${origin}/pair/#id=${start.pairing_id}&code=${encodeURIComponent(start.code)}&h=${h}`;
    return { link, expiresAt: new Date(start.expires_at) };
  }

  /** New device: wait until another device approves, then open the envelope it sealed for us. */
  async waitForApproval(until: Date, cancelled: () => boolean = () => false): Promise<boolean> {
    while (Date.now() < until.getTime() && !cancelled()) {
      if ((await this.status()).has_key) {
        const envelope = await this.gateway.call<Envelope>('GET', '/v1/keys/envelopes/self');
        const sealed = fromBase64(envelope.wrapped_dek);
        await this.keep(await openDeviceEnvelope(sealed, await this.deviceKeys()), sealed);
        return true;
      }
      await this.sleep(2000);
    }
    return false;
  }

  /**
   * Device with the key: look up the device asking to pair. Refuses unless its
   * public key matches the fingerprint from the link, so the server can't
   * swap in a key of its own.
   */
  async inspectPairing(id: string, h: string): Promise<PairingTarget> {
    const target = await this.gateway.call<PairingTarget>('GET', `/v1/devices/pairing/${encodeURIComponent(id)}`);
    if ((await fingerprint(fromBase64(target.public_key))) !== h) {
      throw new KeyError('The device asking to pair doesn’t match this link. Nothing was shared.');
    }
    return target;
  }

  /** Device with the key: seal the DEK to the new device and approve. */
  async approvePairing(id: string, code: string, target: PairingTarget): Promise<void> {
    const sealed = await sealToDevice(this.dataKey, fromBase64(target.public_key));
    await this.gateway.call('POST', `/v1/devices/pairing/${encodeURIComponent(id)}/approve`, {
      code, envelope: { wrapped_dek: toBase64(sealed), alg: DEVICE_ALG, key_version: KEY_VERSION },
    });
  }
}
