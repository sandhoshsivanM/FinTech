/**
 * Has a newer version of the app been deployed since this tab loaded?
 *
 * See scripts/write-build-id.mjs. The bundle carries the id of the build it
 * came from; `/build.json` always carries the id of the build currently
 * deployed. A difference means this tab is running an old version.
 */

/** The id this bundle was built with. Undefined in dev and tests. */
export const BUILD_ID: string | undefined = process.env.NEXT_PUBLIC_BUILD_ID;

/** Pure comparison, so the rule is testable without a network. */
export function isOutdated(running: string | undefined, deployed: unknown): boolean {
  if (!running) return false; // dev server / tests: nothing to compare against
  if (typeof deployed !== 'string' || deployed.length === 0) return false;
  return deployed !== running;
}

/**
 * Fetches the deployed id, bypassing every cache (the HTTP cache and the
 * service worker's network-first copy alike). Any failure — offline, Tauri
 * without a server, a malformed file — reads as "not outdated", so the banner
 * never appears by mistake.
 */
export async function fetchDeployedId(fetcher: typeof fetch = fetch): Promise<string | undefined> {
  try {
    const res = await fetcher(`/build.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    const id = (body as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
