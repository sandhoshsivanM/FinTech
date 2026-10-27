/**
 * Binary furniture the exports embed: the brand mark and, for the PDF, the
 * Anek Latin faces.
 *
 * Read through the host's `fetchAsset` adapter (this package makes no network
 * call of its own) from `public/` the moment somebody exports and never before — three
 * fonts and a logo are ~380 KB that have no business in the initial bundle, and
 * a static file on the app's own origin works the same in the browser, the
 * static export and the desktop shell. Nothing here touches the network beyond
 * the app's own origin.
 *
 * Every piece is optional. Offline with a cold cache, a failed fetch yields
 * `null` and the renderers fall back (Helvetica in the PDF, no image in the
 * workbook) rather than refusing to export — a plainer file beats no file.
 */

import { getPlatform } from '../../platform';

export interface ReportAssets {
  /** The brand mark as a base64 PNG (no data-URL prefix). */
  logoPng: string | null;
  /** Anek Latin faces as base64 TTF, or null when they could not be loaded. */
  fonts: { light: string; regular: string; medium: string } | null;
}

export const EMPTY_ASSETS: ReportAssets = { logoPng: null, fonts: null };

/** Base64 without blowing the call stack on a 100 KB font. */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function fetchBase64(path: string): Promise<string | null> {
  try {
    const bytes = await getPlatform().fetchAsset(path);
    return bytes ? toBase64(new Uint8Array(bytes)) : null;
  } catch {
    return null;
  }
}

let cached: Promise<ReportAssets> | null = null;

/**
 * Loads (once per session) whatever assets the current origin can serve.
 * Outside a browser there is no origin to fetch from, so it resolves empty.
 */
export function loadReportAssets(): Promise<ReportAssets> {
  if (typeof window === 'undefined') {
    return Promise.resolve(EMPTY_ASSETS);
  }
  cached ??= (async () => {
    const [logoPng, light, regular, medium] = await Promise.all([
      fetchBase64('/khazana-mark.png'),
      fetchBase64('/fonts/AnekLatin-Light.ttf'),
      fetchBase64('/fonts/AnekLatin-Regular.ttf'),
      fetchBase64('/fonts/AnekLatin-Medium.ttf'),
    ]);
    const fonts = light && regular && medium ? { light, regular, medium } : null;
    const assets = { logoPng, fonts };
    // A failed load is not cached, so the next export can try again.
    if (!logoPng || !fonts) cached = null;
    return assets;
  })();
  return cached;
}
