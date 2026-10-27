// Device management (ADR 0005): the account's devices, rename, and remote
// logout. Removing a device is the one place a passkey check is required
// first (the gateway client's step-up), because it ends someone's access.

export type Device = {
  id: string;
  name: string;
  platform: string;
  app_version: string | null;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};

type Gateway = {
  call<T>(method: string, path: string, body?: unknown): Promise<T>;
  callWithStepUp<T>(method: string, path: string, body?: unknown): Promise<T>;
};

export const MAX_NAME = 64;

export class Devices {
  constructor(private readonly gateway: Gateway) {}

  /** The account's devices that can still sign in, this one marked, oldest first. */
  list(): Promise<Device[]> {
    return this.gateway.call<Device[]>('GET', '/v1/devices/');
  }

  rename(id: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new Error('Give the device a name.');
    return this.gateway.call('PATCH', `/v1/devices/${encodeURIComponent(id)}`, { name: clean.slice(0, MAX_NAME) });
  }

  /**
   * Signs the device out everywhere: its sessions end, it can no longer reach
   * the account or its data key. Asks for a passkey first.
   */
  remove(id: string): Promise<void> {
    return this.gateway.callWithStepUp('DELETE', `/v1/devices/${encodeURIComponent(id)}`);
  }
}

const PLATFORM_LABELS: Record<string, string> = { ios: 'iPhone / iPad', android: 'Android', web: 'Web browser' };
export const platformLabel = (platform: string) => PLATFORM_LABELS[platform] ?? platform;

/** "just now", "5 minutes ago", "3 days ago"; older than a month falls back to the date. */
export function ago(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (Number.isNaN(seconds)) return 'unknown';
  if (seconds < 60) return 'just now';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (seconds < 3600) return unit(Math.floor(seconds / 60), 'minute');
  if (seconds < 86_400) return unit(Math.floor(seconds / 3600), 'hour');
  if (seconds < 30 * 86_400) return unit(Math.floor(seconds / 86_400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
