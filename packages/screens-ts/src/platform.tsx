'use client';
/**
 * What differs between the apps that is not data: how a file is saved, which
 * build this is, replaying the tour, the feedback link, loading sample data.
 *
 * Defaults are plain-browser ones, so a host that configures nothing still
 * works. The offline app installs its Tauri-aware versions in
 * `webapp/src/lib/screensPlatform.ts`. A module-level registry rather than
 * context, because the pure helpers (report export, template download) are not
 * hooks.
 */
import type { ComponentType } from 'react';

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
  /** For a native dialog's file-type filter, e.g. `{ name: 'Excel', extensions: ['xlsx'] }`. */
  filter?: { name: string; extensions: string[] };
}

export interface ScreensPlatform {
  /** Stamped onto exported reports so a figure can be traced to a build. */
  appVersion: string;
  saveFile: (req: SaveRequest) => Promise<SaveOutcome>;
  /**
   * Reads a static file served from the app's own origin (the logo and fonts a
   * report embeds), or null when it cannot be read. The package itself makes no
   * network call, so the host does the fetching.
   */
  fetchAsset: (path: string) => Promise<ArrayBuffer | null>;
  /** Restarts the guided tour. */
  replayTour: () => void;
  /** The "send feedback" link on Help, or none. */
  SendFeedbackLink?: ComponentType;
  /** Fills an empty vault with a sample year. Omit to hide the button. */
  loadSampleData?: () => Promise<void>;
}

const toBytes = (data: Uint8Array | string): Uint8Array<ArrayBuffer> =>
  typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);

async function saveViaAnchor(req: SaveRequest): Promise<SaveOutcome> {
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

let current: ScreensPlatform = {
  appVersion: 'dev',
  saveFile: saveViaAnchor,
  fetchAsset: async () => null,
  replayTour: () => window.dispatchEvent(new Event('khazana:start-tour')),
};

export function configurePlatform(next: Partial<ScreensPlatform>): void {
  current = { ...current, ...next };
}

export function getPlatform(): ScreensPlatform {
  return current;
}

/** Renders the host's feedback link, or nothing. */
export function PlatformFeedbackLink() {
  const Link = current.SendFeedbackLink;
  return Link ? <Link /> : null;
}
