import { describe, expect, it, vi } from 'vitest';
import { fetchDeployedId, isOutdated } from './buildCheck';

describe('build check', () => {
  it('is outdated only when both ids exist and differ', () => {
    expect(isOutdated('abc-1', 'abc-2')).toBe(true);
    expect(isOutdated('abc-1', 'abc-1')).toBe(false);
  });

  it('never flags without a running id (dev server, tests)', () => {
    expect(isOutdated(undefined, 'abc-2')).toBe(false);
  });

  it('ignores a missing or malformed deployed id', () => {
    expect(isOutdated('abc-1', undefined)).toBe(false);
    expect(isOutdated('abc-1', '')).toBe(false);
    expect(isOutdated('abc-1', 42)).toBe(false);
  });

  it('reads the id from build.json, bypassing caches', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'def-9' }))) as unknown as typeof fetch;
    await expect(fetchDeployedId(fetcher)).resolves.toBe('def-9');
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(/^\/build\.json\?t=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('treats offline, errors and bad JSON as "not outdated"', async () => {
    const offline = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    const notFound = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const garbage = vi.fn(async () => new Response('not json')) as unknown as typeof fetch;
    for (const f of [offline, notFound, garbage]) {
      await expect(fetchDeployedId(f)).resolves.toBeUndefined();
    }
  });
});
