/**
 * Saving a file, in a browser and in the desktop shell.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Every download in this app used the same pattern: build a Blob, point an
 * `<a download>` at a blob URL, click it. That works in a browser and does
 * **nothing at all** inside the Tauri desktop shell, because WKWebView does not
 * implement the `download` attribute. It throws no error and logs nothing — the
 * click simply has no effect.
 *
 * That silence is the dangerous part. Backup export ran this path and then
 * displayed "Backup exported", so a desktop user could believe they held a
 * backup they had never actually received. Encrypted backup is on the
 * `alwaysFree` list precisely because a user's own data must never be held
 * hostage; a save that quietly fails is a worse version of the same failure.
 *
 * So: one helper, used by every save path. In the desktop shell it opens a real
 * native save dialog and writes the bytes. In a browser it keeps the anchor
 * trick, which is correct there.
 *
 * Everything stays on the device either way. No network call is involved in any
 * branch, which is the constraint the whole product is built under.
 */
import { isTauri } from './notify';

export type SaveOutcome =
  /** Written to disk, or handed to the browser's download machinery. */
  | { status: 'saved'; path?: string }
  /** The user dismissed the native save dialog. Not an error. */
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export interface SaveRequest {
  /** Suggested filename, including extension. */
  filename: string;
  /** File contents. */
  data: Uint8Array | string;
  /** MIME type, used only by the browser branch. */
  mimeType: string;
  /** For the native dialog's file-type filter, e.g. `{ name: 'Excel', extensions: ['xlsx'] }`. */
  filter?: { name: string; extensions: string[] };
}

const toBytes = (data: Uint8Array | string): Uint8Array<ArrayBuffer> =>
  typeof data === 'string'
    ? new TextEncoder().encode(data)
    // Copied into a plain ArrayBuffer. A Uint8Array can be backed by a
    // SharedArrayBuffer, which Blob will not accept, and the type system is
    // right to insist rather than let it fail at runtime.
    : new Uint8Array(data);

/**
 * Saves a file and reports what actually happened.
 *
 * The return value matters: callers must not announce success on their own.
 * Telling someone their backup was written when it was not is the exact bug
 * this module exists to remove.
 */
export async function saveFile(req: SaveRequest): Promise<SaveOutcome> {
  if (isTauri()) return saveViaTauri(req);
  return saveViaAnchor(req);
}

async function saveViaTauri(req: SaveRequest): Promise<SaveOutcome> {
  try {
    // Imported lazily so the browser build never pulls the Tauri packages into
    // its bundle — they are dead weight there and their presence would suggest
    // the web app talks to something native, which it does not.
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);

    const path = await save({
      defaultPath: req.filename,
      filters: req.filter ? [req.filter] : undefined,
    });
    // `save` resolves to null when the user closes the dialog. That is a
    // decision, not a failure, and must not surface as an error.
    if (!path) return { status: 'cancelled' };

    await writeFile(path, toBytes(req.data));
    return { status: 'saved', path };
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}

function saveViaAnchor(req: SaveRequest): SaveOutcome {
  try {
    const blob = new Blob([toBytes(req.data)], { type: req.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = req.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick: revoking synchronously races the download in
    // Safari and produces an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { status: 'saved' };
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}
