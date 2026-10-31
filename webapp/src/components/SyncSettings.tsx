'use client';
/**
 * Settings → "Devices & sync", and the driver that syncs while unlocked.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp, uid, type SyncConfig } from '@/lib/store';
import { Button, Field, GlassCard, Input, SectionHeader } from '@khazana/ui/ui';
import { MIN_PASSPHRASE } from '@/lib/syncFile';
import { formatDate } from '@khazana/screens/lib/dateFormat';
import {
  AUTO_SYNC_MS, forgetSyncFolder, importSyncFiles, pickSyncFolder, runFolderSync, saveOwnSyncFile,
  syncMode, useSync, type SyncMode,
} from '@/lib/syncTransport';

/** Syncs on unlock, every two minutes, and on focus — where a folder is available. */
export function SyncDriver() {
  const getSyncConfig = useApp((s) => s.getSyncConfig);
  useEffect(() => {
    if (syncMode() === 'manual') return;
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | undefined;
    const run = () => void runFolderSync();
    void getSyncConfig().then((cfg) => {
      if (cancelled || !cfg) return;
      run();
      id = setInterval(run, AUTO_SYNC_MS);
      window.addEventListener('focus', run);
    });
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      window.removeEventListener('focus', run);
    };
  }, [getSyncConfig]);
  return null;
}

const defaultDeviceName = (mode: SyncMode) =>
  mode === 'tauri' ? 'Mac' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone browser' : 'Browser';

export function SyncCard() {
  const getSyncConfig = useApp((s) => s.getSyncConfig);
  const [mode, setMode] = useState<SyncMode | null>(null);
  const [cfg, setCfg] = useState<SyncConfig | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the platform is only known on the client
    setMode(syncMode());
    void getSyncConfig().then(setCfg);
  }, [getSyncConfig]);

  if (!mode || cfg === undefined) return null;
  return (
    <GlassCard>
      <SectionHeader title="Devices & sync" />
      {cfg
        ? <SyncOn mode={mode} cfg={cfg} onOff={() => setCfg(null)} />
        : <SyncSetup mode={mode} onDone={setCfg} />}
    </GlassCard>
  );
}

function SyncSetup({ mode, onDone }: { mode: SyncMode; onDone: (c: SyncConfig) => void }) {
  const setSyncConfig = useApp((s) => s.setSyncConfig);
  const [name, setName] = useState(() => defaultDeviceName(mode));
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (pass.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (pass !== again) return setError('The two passphrases do not match.');
    setError(null);
    const c: SyncConfig = { passphrase: pass, deviceId: uid(), deviceName: name.trim() || defaultDeviceName(mode), lastSyncAt: null };
    await setSyncConfig(c);
    onDone(c);
    if (mode !== 'manual' && (await pickSyncFolder())) await runFolderSync({ interactive: true });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted leading-relaxed">
        Keep this vault the same on your Mac, browser and phone without a Khazana account or server. Each
        device writes one encrypted file into a folder you choose — iCloud Drive or Dropbox — and merges the
        others&rsquo; files. The folder&rsquo;s service only ever stores ciphertext.
        {mode === 'manual' && ' This browser cannot open a folder by itself, so here you import and save the files by hand.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="This device"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
        <Field label="Sync passphrase" hint={`At least ${MIN_PASSPHRASE} characters, the same on every device`}>
          <Input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        <Field label="Passphrase again">
          <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        This is not your PIN. Khazana cannot recover it: a device without it cannot read the others&rsquo; files.
      </p>
      {error && <p role="alert" className="fs-13 text-danger">{error}</p>}
      <Button onClick={() => void start()}>{mode === 'manual' ? 'Turn on sync' : 'Choose folder and turn on'}</Button>
    </div>
  );
}

function SyncOn({ mode, cfg, onOff }: { mode: SyncMode; cfg: SyncConfig; onOff: () => void }) {
  const setSyncConfig = useApp((s) => s.setSyncConfig);
  const { status, folderLabel, lastSyncAt, devices, errors, message } = useSync();
  const fileInput = useRef<HTMLInputElement>(null);
  const picked = useRef<File[]>([]);
  const busy = status === 'syncing';
  const last = lastSyncAt ?? cfg.lastSyncAt;

  const turnOff = async () => {
    await setSyncConfig(null);
    await forgetSyncFolder();
    onOff();
  };
  const confirmMerge = () => mode === 'manual'
    ? void importSyncFiles(picked.current, { confirmSeparate: true })
    : void runFolderSync({ interactive: true, confirmSeparate: true });

  return (
    <div className="space-y-4">
      <div className="fs-13 text-ink-soft space-y-1">
        <p><b className="text-ink font-medium">{cfg.deviceName}</b>{mode !== 'manual' && folderLabel && <> · syncing through <span className="font-mono fs-12">{folderLabel}</span></>}</p>
        <p role="status" className="text-xs text-muted">
          {busy ? 'Syncing…' : last ? `Last synced ${formatDate(last)} ${new Date(last).toLocaleTimeString()}` : 'Not synced yet'}
        </p>
      </div>

      {status === 'needs_confirm' && (
        <div className="text-xs leading-relaxed rounded-[14px] border border-line p-3 space-y-2">
          <p className="text-warning font-medium">These look like two separate vaults.</p>
          <p className="text-muted">
            This device already has its own data, and the other devices&rsquo; data shares no profile with it.
            Merging keeps everything from both — you may see two &ldquo;Personal&rdquo; profiles and repeated
            categories to tidy up. To use only the other devices&rsquo; data instead, reset this vault first
            (Settings → Danger Zone) and turn sync on again.
          </p>
          <Button variant="secondary" onClick={confirmMerge}>Merge both</Button>
        </div>
      )}
      {status === 'needs_permission' && (
        <div className="text-xs rounded-[14px] border border-line p-3 space-y-2">
          <p className="text-muted">The browser needs your permission again to use the sync folder.</p>
          <Button variant="secondary" onClick={() => void runFolderSync({ interactive: true })}>Allow access</Button>
        </div>
      )}
      {status === 'no_folder' && <p className="text-xs text-danger">The sync folder is missing. Choose it again.</p>}
      {errors.length > 0 && (
        <ul className="text-xs text-danger space-y-1">
          {errors.map((e) => <li key={e.name}><span className="font-mono">{e.name}</span>: {e.message}</li>)}
        </ul>
      )}
      {status === 'error' && message && errors.length === 0 && <p className="text-xs text-danger">{message}</p>}
      {status !== 'error' && message && <p className="text-xs text-warning">{message}</p>}

      {devices.length > 0 && (
        <div>
          <p className="fs-12.5 font-medium text-ink-soft mb-1.5">Other devices</p>
          <ul className="fs-13 space-y-1">
            {devices.map((d) => (
              <li key={d.deviceId} className="flex gap-2">
                <span className="text-ink">{d.deviceName}</span>
                <span className="text-muted ml-auto">wrote {formatDate(d.exportedAt)} {new Date(d.exportedAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {mode === 'manual' ? (
          <>
            <input
              ref={fileInput} type="file" multiple accept=".khazana-sync" className="hidden"
              onChange={(e) => {
                picked.current = Array.from(e.target.files ?? []);
                if (picked.current.length) void importSyncFiles(picked.current);
                e.target.value = '';
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>Import other devices&rsquo; files</Button>
            <Button variant="secondary" onClick={() => void saveOwnSyncFile()} disabled={busy}>Save this device&rsquo;s file</Button>
          </>
        ) : (
          <>
            <Button onClick={() => void runFolderSync({ interactive: true })} disabled={busy}>Sync now</Button>
            <Button variant="secondary" onClick={() => void pickSyncFolder().then((n) => { if (n) void runFolderSync({ interactive: true }); })}>
              Change folder
            </Button>
          </>
        )}
        <Button variant="danger" className="ml-auto" onClick={() => void turnOff()}>Turn off sync</Button>
      </div>
      {mode === 'manual' && (
        <p className="text-xs text-muted leading-relaxed">
          Put the saved file in your shared folder; import the other devices&rsquo; <span className="font-mono">.khazana-sync</span> files from it.
        </p>
      )}
    </div>
  );
}
