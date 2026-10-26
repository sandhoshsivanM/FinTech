/**
 * Moves sync files between this device and the shared folder.
 *
 * Three ways in, one engine (`syncWith` in the store):
 * - the Mac app: a folder picked once, read and written by Rust
 *   (src-tauri/src/sync_folder.rs), automatic;
 * - Chrome and Edge: the File System Access API, automatic once the browser
 *   has granted access to the folder for this visit;
 * - Safari and Firefox, which have neither: "Import other devices' files" and
 *   "Save this device's file", by hand.
 *
 * No network call in any branch — the folder's own sync service (iCloud,
 * Dropbox) carries the files, and only ever sees ciphertext.
 */
import { create } from 'zustand';
import { useApp, type SyncDevice } from './store';
import { isTauri } from './notify';
import { isSyncFileName } from './syncFile';
import { saveFile } from './saveFile';

export const AUTO_SYNC_MS = 2 * 60_000;

export type SyncMode = 'tauri' | 'web' | 'manual';
export type SyncStatus =
  | 'off' | 'idle' | 'syncing' | 'error' | 'needs_confirm' | 'needs_permission' | 'no_folder';

interface SyncState {
  status: SyncStatus;
  folderLabel: string | null;
  lastSyncAt: number | null;
  devices: SyncDevice[];
  errors: { name: string; message: string }[];
  message: string | null;
}

export const useSync = create<SyncState>(() => ({
  status: 'off', folderLabel: null, lastSyncAt: null, devices: [], errors: [], message: null,
}));

export function syncMode(): SyncMode {
  if (isTauri()) return 'tauri';
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) return 'web';
  return 'manual';
}

/* -------------------------------------------------------------------------- */
/* Folders                                                                    */
/* -------------------------------------------------------------------------- */

interface Folder {
  label: string;
  list(): Promise<{ name: string; modified: number }[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
const tauriInvoke = async (): Promise<Invoke> => (await import('@tauri-apps/api/core')).invoke as Invoke;

async function tauriFolder(): Promise<Folder | null> {
  const invoke = await tauriInvoke();
  const path = (await invoke('sync_folder_path')) as string | null;
  if (!path) return null;
  return {
    label: path.split('/').filter(Boolean).slice(-2).join('/'),
    list: async () =>
      ((await invoke('sync_list')) as { name: string; modifiedMs: number }[]).map((f) => ({ name: f.name, modified: f.modifiedMs })),
    read: async (name) => (await invoke('sync_read', { name })) as string,
    write: async (name, contents) => { await invoke('sync_write', { name, contents }); },
  };
}

// The browser's folder handle is kept in its own small database: it cannot go
// in the vault (it is not JSON) and must not go in a backup.
const HANDLE_DB = 'khazana-sync-folder';
function handleStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(HANDLE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('h');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction('h', mode).objectStore('h'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

/** Minimal File System Access API surface, since lib.dom does not ship it everywhere. */
interface DirHandle {
  name: string;
  values(): AsyncIterable<{ kind: string; name: string; getFile?: () => Promise<File> }>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
  }>;
  queryPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'readwrite' }): Promise<PermissionState>;
}

const loadHandle = () => handleStore<DirHandle | undefined>('readonly', (s) => s.get('dir') as IDBRequest<DirHandle | undefined>);

async function webFolder(interactive: boolean): Promise<Folder | 'needs_permission' | null> {
  const dir = await loadHandle().catch(() => undefined);
  if (!dir) return null;
  let perm = await dir.queryPermission({ mode: 'readwrite' });
  // The browser only asks again in response to a click.
  if (perm !== 'granted' && interactive) perm = await dir.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') return 'needs_permission';
  return {
    label: dir.name,
    list: async () => {
      const out: { name: string; modified: number }[] = [];
      for await (const e of dir.values()) {
        if (e.kind !== 'file' || !isSyncFileName(e.name) || !e.getFile) continue;
        out.push({ name: e.name, modified: (await e.getFile()).lastModified });
      }
      return out;
    },
    read: async (name) => (await (await dir.getFileHandle(name)).getFile()).text(),
    // createWritable writes to a swap file and swaps on close: atomic.
    write: async (name, text) => {
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
  };
}

/** Picks the shared folder. Returns its name, or null if cancelled. */
export async function pickSyncFolder(): Promise<string | null> {
  if (syncMode() === 'tauri') {
    const path = (await (await tauriInvoke())('sync_pick_folder')) as string | null;
    return path ? path.split('/').filter(Boolean).pop() ?? path : null;
  }
  try {
    const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
    const dir = await picker({ id: 'khazana-sync', mode: 'readwrite' });
    await handleStore('readwrite', (s) => s.put(dir, 'dir'));
    return dir.name;
  } catch {
    return null; // dismissed
  }
}

export async function forgetSyncFolder(): Promise<void> {
  if (syncMode() === 'tauri') await (await tauriInvoke())('sync_forget_folder');
  else if (syncMode() === 'web') await handleStore('readwrite', (s) => s.delete('dir')).catch(() => {});
  useSync.setState({ folderLabel: null, status: 'off', devices: [], errors: [] });
}

/* -------------------------------------------------------------------------- */
/* Running a sync                                                             */
/* -------------------------------------------------------------------------- */

let running = false;
/** name → modified time already merged, so an unchanged file is not decrypted again. */
const merged = new Map<string, number>();
const knownDevices = new Map<string, SyncDevice>();

function finish(report: { devices: SyncDevice[]; errors: SyncState['errors']; stale: string[] }) {
  for (const d of report.devices) knownDevices.set(d.deviceId, d);
  const staleNote = report.stale.length
    ? `${report.stale.length} device${report.stale.length === 1 ? ' has' : 's have'} not synced in 90 days and ${report.stale.length === 1 ? 'was' : 'were'} skipped, so deletions it missed are not undone.`
    : null;
  useSync.setState({
    status: report.errors.length ? 'error' : 'idle',
    lastSyncAt: Date.now(),
    devices: [...knownDevices.values()].sort((a, b) => b.exportedAt - a.exportedAt),
    errors: report.errors,
    message: staleNote,
  });
}

/**
 * One sync through the folder. `interactive` when started by a click, which is
 * what lets a browser ask for folder access again.
 */
export async function runFolderSync(opts: { interactive?: boolean; confirmSeparate?: boolean } = {}): Promise<void> {
  if (running) return;
  const app = useApp.getState();
  const cfg = await app.getSyncConfig();
  if (!cfg) {
    useSync.setState({ status: 'off' });
    return;
  }
  running = true;
  try {
    const folder = syncMode() === 'tauri' ? await tauriFolder() : await webFolder(!!opts.interactive);
    if (folder === 'needs_permission') {
      useSync.setState({ status: 'needs_permission' });
      return;
    }
    if (!folder) {
      useSync.setState({ status: 'no_folder', folderLabel: null });
      return;
    }
    useSync.setState({ status: 'syncing', folderLabel: folder.label });

    const listing = await folder.list();
    const files: { name: string; text: string }[] = [];
    for (const f of listing) {
      const isOwn = f.name.startsWith(`${cfg.deviceId}.`);
      // Our own file only needs to be known to exist; others only when changed.
      if (isOwn) files.push({ name: f.name, text: '' });
      else if (opts.confirmSeparate || merged.get(f.name) !== f.modified) files.push({ name: f.name, text: await folder.read(f.name) });
    }
    const report = await app.syncWith(files, { confirmSeparate: opts.confirmSeparate });
    if (report.needsConfirm) {
      useSync.setState({ status: 'needs_confirm', devices: report.devices });
      return;
    }
    if (report.own) {
      await folder.write(report.own.name, report.own.text);
      await app.markSyncWritten(report.own.digest);
    }
    for (const f of listing) if (!report.errors.some((e) => e.name === f.name)) merged.set(f.name, f.modified);
    finish(report);
  } catch (e) {
    useSync.setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
  }
}

/** Safari / Firefox: merge files the user picked, then offer this device's file to save. */
export async function importSyncFiles(list: FileList | File[], opts: { confirmSeparate?: boolean } = {}): Promise<void> {
  const app = useApp.getState();
  const files = await Promise.all(Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() })));
  useSync.setState({ status: 'syncing' });
  try {
    const report = await app.syncWith(files, opts);
    if (report.needsConfirm) {
      useSync.setState({ status: 'needs_confirm', devices: report.devices });
      return;
    }
    finish(report);
  } catch (e) {
    useSync.setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/** Safari / Firefox: this device's file, to put in the shared folder by hand. */
export async function saveOwnSyncFile(): Promise<void> {
  const app = useApp.getState();
  const report = await app.syncWith([]);
  if (!report.own) return;
  const out = await saveFile({
    filename: report.own.name,
    data: report.own.text,
    mimeType: 'application/octet-stream',
    filter: { name: 'Khazana sync file', extensions: ['khazana-sync'] },
  });
  if (out.status === 'saved') await app.markSyncWritten(report.own.digest);
}
