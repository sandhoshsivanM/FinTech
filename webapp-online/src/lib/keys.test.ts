import { describe, expect, test } from 'vitest';
import { fromBase64, toBase64 } from './crypto/bytes';
import { keyCheck, KeyError, newDeviceKeyPair } from './crypto/e2e';
import { AccountKeys, type DeviceStatus } from './keys';
import type { StoredDeviceKeys, StoredEnvelope } from './vault';

type Envelope = { wrapped_dek: string; alg: string; key_version: number };

/** A small stand-in for the Devices service: the same rules, in memory. */
class FakeDevices {
  devices = new Map<string, { publicKey: string; name: string; envelope?: Envelope }>();
  recovery?: Envelope;
  keyCheckHash?: string;
  pairing?: { id: string; code: string; device: string; open: boolean };
  swapKey?: string;
  calls: string[] = [];

  as(device: string) {
    return {
      call: async <T,>(method: string, path: string, body?: any): Promise<T> => {
        this.calls.push(`${method} ${path}`);
        return this.handle(device, method, path, body) as T;
      },
    };
  }

  private async hash(b64: string) {
    return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', fromBase64(b64) as Uint8Array<ArrayBuffer>)));
  }

  private status(device: string): DeviceStatus {
    return { device_id: device, has_key: !!this.devices.get(device)?.envelope, account_has_keys: !!this.recovery, key_version: this.recovery ? 1 : null };
  }

  private async handle(device: string, method: string, path: string, body: any): Promise<unknown> {
    const me = this.devices.get(device);
    if (path === '/v1/devices/register') {
      this.devices.set(device, { publicKey: body.public_key, name: body.name, envelope: me?.envelope });
      return this.status(device);
    }
    if (!me) throw Object.assign(new Error('forbidden'), { status: 403 });
    switch (`${method} ${path.replace(/[0-9a-f-]{8,}/, ':id')}`) {
      case 'GET /v1/devices/me': return this.status(device);
      case 'POST /v1/keys/bootstrap':
        if (this.recovery) throw Object.assign(new Error('conflict'), { status: 409 });
        me.envelope = body.device;
        this.recovery = body.recovery;
        this.keyCheckHash = await this.hash(body.key_check);
        return undefined;
      case 'GET /v1/keys/envelopes/recovery': return this.recovery;
      case 'GET /v1/keys/envelopes/self': return me.envelope;
      case 'POST /v1/keys/envelopes/self':
        if ((await this.hash(body.key_check)) !== this.keyCheckHash) throw Object.assign(new Error('forbidden'), { status: 403 });
        me.envelope = body.envelope;
        return undefined;
      case 'POST /v1/devices/pairing':
        this.pairing = { id: '0198a8f0-0000-7000-8000-000000000001', code: 'one-time-code', device, open: true };
        return { pairing_id: this.pairing.id, code: this.pairing.code, expires_at: new Date(Date.now() + 300_000).toISOString() };
      case 'GET /v1/devices/pairing/:id': {
        const target = this.devices.get(this.pairing!.device)!;
        return { new_device_id: this.pairing!.device, name: target.name, platform: 'web', public_key: this.swapKey ?? target.publicKey };
      }
      case 'POST /v1/devices/pairing/:id/approve':
        if (body.code !== this.pairing!.code || !this.pairing!.open) throw Object.assign(new Error('forbidden'), { status: 403 });
        this.pairing!.open = false;
        this.devices.get(this.pairing!.device)!.envelope = body.envelope;
        return undefined;
    }
    throw new Error(`unexpected ${method} ${path}`);
  }
}

function memoryStore() {
  let keys: StoredDeviceKeys | undefined;
  let wrap: CryptoKey | undefined;
  let envelope: StoredEnvelope | undefined;
  return {
    loadDeviceKeys: async () => keys,
    saveDeviceKeys: async (k: StoredDeviceKeys) => { keys = k; return 'x25519'; },
    loadWrapKey: async () => wrap,
    saveWrapKey: async (k: CryptoKey) => { wrap = k; return 'x25519-wrap'; },
    loadEnvelope: async () => envelope,
    saveEnvelope: async (e: StoredEnvelope) => { envelope = e; return 'envelope'; },
    get stored() { return keys; },
  };
}

const noSleep = async () => undefined;

describe('AccountKeys', () => {
  test('the first device creates the key; nothing reaches the server before the words are saved', async () => {
    const server = new FakeDevices();
    const laptop = new AccountKeys(server.as('laptop'), memoryStore(), noSleep);
    expect((await laptop.register('Firefox on Mac')).account_has_keys).toBe(false);

    const { words, save } = await laptop.createAccountKey();
    expect(words).toHaveLength(24);
    expect(server.calls).not.toContain('POST /v1/keys/bootstrap');
    await save();
    expect(laptop.unlocked).toBe(true);
    expect((await laptop.status()).has_key).toBe(true);
  }, 30_000);

  test('the private key is stored wrapped, never as plain bytes, and survives a restart', async () => {
    const server = new FakeDevices();
    const store = memoryStore();
    const first = new AccountKeys(server.as('laptop'), store, noSleep);
    await first.register('laptop');
    const { save } = await first.createAccountKey();
    await save();
    const raw = (await first.deviceKeys()).privateKey;
    expect(toBase64(store.stored!.wrappedPrivate)).not.toContain(toBase64(raw));

    const restarted = new AccountKeys(server.as('laptop'), store, noSleep);
    expect(await restarted.unlock()).toBe(true);
    expect(restarted.dataKey).toEqual(first.dataKey);
  }, 30_000);

  test('concurrent first calls share one key pair (the one registered is the one stored)', async () => {
    const server = new FakeDevices();
    const store = memoryStore();
    const k = new AccountKeys(server.as('laptop'), store, noSleep);
    const [a, b] = await Promise.all([k.deviceKeys(), k.register('laptop').then(() => k.deviceKeys())]);
    expect(a.publicKey).toEqual(b.publicKey);
    expect(store.stored!.publicKey).toEqual(a.publicKey);
    expect(server.devices.get('laptop')!.publicKey).toBe(toBase64(a.publicKey));
  });

  test('a second device pairs through the link and gets the same key', async () => {
    const server = new FakeDevices();
    const laptop = new AccountKeys(server.as('laptop'), memoryStore(), noSleep);
    await laptop.register('laptop');
    await (await laptop.createAccountKey()).save();

    const phone = new AccountKeys(server.as('phone'), memoryStore(), noSleep);
    const status = await phone.register('Safari on iPhone');
    expect(status).toMatchObject({ account_has_keys: true, has_key: false });
    const { link, expiresAt } = await phone.startPairing('https://khazana-online.netlify.app');
    const fragment = new URLSearchParams(new URL(link).hash.slice(1));

    const target = await laptop.inspectPairing(fragment.get('id')!, fragment.get('h')!);
    expect(target.name).toBe('Safari on iPhone');
    await laptop.approvePairing(fragment.get('id')!, fragment.get('code')!, target);

    expect(await phone.waitForApproval(expiresAt)).toBe(true);
    expect(phone.dataKey).toEqual(laptop.dataKey);
  }, 30_000);

  test('a pairing target whose key was swapped by the server is refused, and nothing is sealed', async () => {
    const server = new FakeDevices();
    const laptop = new AccountKeys(server.as('laptop'), memoryStore(), noSleep);
    await laptop.register('laptop');
    await (await laptop.createAccountKey()).save();
    const phone = new AccountKeys(server.as('phone'), memoryStore(), noSleep);
    await phone.register('phone');
    const { link } = await phone.startPairing('https://x.test');
    const fragment = new URLSearchParams(new URL(link).hash.slice(1));

    server.swapKey = toBase64((await newDeviceKeyPair()).publicKey);
    await expect(laptop.inspectPairing(fragment.get('id')!, fragment.get('h')!)).rejects.toBeInstanceOf(KeyError);
    expect(server.calls.some((c) => c.endsWith('/approve'))).toBe(false);
  }, 30_000);

  test('a device recovers with the phrase; a wrong phrase is refused', async () => {
    const server = new FakeDevices();
    const laptop = new AccountKeys(server.as('laptop'), memoryStore(), noSleep);
    await laptop.register('laptop');
    const { words, save } = await laptop.createAccountKey();
    await save();

    const tablet = new AccountKeys(server.as('tablet'), memoryStore(), noSleep);
    await tablet.register('tablet');
    const wrong = [...words].reverse().join(' ');
    await expect(tablet.recover(wrong)).rejects.toThrow();
    await tablet.recover(words.map((w) => w.slice(0, 4)).join(' '));
    expect(tablet.dataKey).toEqual(laptop.dataKey);
    expect(toBase64(await keyCheck(tablet.dataKey))).toBe(toBase64(await keyCheck(laptop.dataKey)));
  }, 60_000);
});
