'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import {
  ShieldCheck, CloudOff, KeyRound, Download, Upload,
  Globe, Lock, Trash2, Sparkles, CheckCircle2, AlertCircle,
  Users, Plus, Pencil, Check, Briefcase, User, Heart, FlaskConical,
  HardDrive, ShieldAlert,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { TOUR_EVENT } from '@/components/Tour';
import { useApp, ACCENTS, type AccentName, type ThemeChoice } from '@/lib/store';
import { requestPersistence } from '@/lib/db';
import { loadSampleData } from '@/lib/sampleData';
import {
  CURRENCIES, findCurrency, isRateStale, rateAsOf, resolveRate,
} from '@/domain/currency';
import { GlassCard, SectionHeader, Button, Field, Select, PageIntro, Input, Segmented } from '@/components/ui';
import { useDemoData } from '@/components/DemoBadge';
import { useConfirm } from '@/components/Confirm';
import { STORE, type FxRate, type ProfileKind } from '@/lib/types';
import { NumberInput } from '@/components/NumberInput';
import { formatDate } from '@/lib/dateFormat';
import { useNow } from '@/lib/useNow';
import { D } from '@/lib/money';
import { BackupError } from '@/lib/backupError';
import { type NotifyCategory, type NotifyPrefs } from '@/domain/notificationScheduler';
import {
  getNotifyPrefsServerSnapshot, getNotifyPrefsSnapshot, saveNotifyPrefs, subscribeNotifyPrefs,
} from '@/lib/notifyPrefs';
import {
  notifyPermission, notifyPermissionChanged, requestNotifyPermission, subscribePermission,
  type NotifyPermission,
} from '@/lib/notify';

type NoteKind = 'success' | 'error';
interface Note { kind: NoteKind; text: string }

function StatusNote({ note }: { note: Note }) {
  const isOk = note.kind === 'success';
  return (
    <div className={`flex items-start gap-2 rounded-[var(--radius-panel)] px-3.5 py-2.5 text-sm mt-3 ${isOk ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'}`}>
      {isOk ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
      <span>{note.text}</span>
    </div>
  );
}

function AccentSwatch({ swatch, label, active, onClick }: { swatch: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={`relative w-8 h-8 rounded-full transition-transform hover:scale-110 ${active ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)] ring-[var(--ink-soft)]' : ''}`}
      style={{ background: swatch }}>
      {active && <Check size={15} className="absolute inset-0 m-auto text-white" />}
    </button>
  );
}

export default function SettingsPage() {
  const confirm = useConfirm();
  const lock = useApp((s) => s.lock);
  const wipe = useApp((s) => s.wipe);
  const exportBackup = useApp((s) => s.exportBackup);
  const importBackup = useApp((s) => s.importBackup);
  const currencyCode = useApp((s) => s.currencyCode);
  const setCurrency = useApp((s) => s.setCurrency);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const accent = useApp((s) => s.accent);
  const setAccent = useApp((s) => s.setAccent);

  // Profiles
  const profiles = useApp((s) => s.profiles);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const addProfile = useApp((s) => s.addProfile);
  const renameProfile = useApp((s) => s.renameProfile);
  const deleteProfile = useApp((s) => s.deleteProfile);

  // Add-profile form state
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProfileKind>('self');
  const [addBusy, setAddBusy] = useState(false);

  // Per-profile rename state: profileId -> draft name (undefined = not editing)
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});

  const handleAddProfile = async () => {
    const name = newName.trim();
    if (!name) return;
    setAddBusy(true);
    try {
      await addProfile(name, newKind);
      setNewName('');
      setNewKind('self');
    } finally {
      setAddBusy(false);
    }
  };

  const startRename = (id: string, current: string) =>
    setRenameMap((m) => ({ ...m, [id]: current }));

  const cancelRename = (id: string) =>
    setRenameMap((m) => { const n = { ...m }; delete n[id]; return n; });

  const commitRename = async (id: string) => {
    const name = (renameMap[id] ?? '').trim();
    if (name) await renameProfile(id, name);
    cancelRename(id);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({
      title: `Delete profile “${name}”?`,
      message: 'This permanently removes all of its transactions, investments, and liabilities. This cannot be undone.',
      confirmLabel: 'Delete profile',
      danger: true,
    }))) return;
    await deleteProfile(id);
  };

  const [exportNote, setExportNote] = useState<Note | null>(null);
  const [restoreNote, setRestoreNote] = useState<Note | null>(null);
  const [sampleNote, setSampleNote] = useState<Note | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // A backup encrypted with this PIN can be opened on any device. Left blank,
  // the export falls back to the old vault-bound format.
  const [backupPin, setBackupPin] = useState('');
  // Restore has its own PIN box. The export PIN lives in the section above and
  // is not necessarily the same one — a backup is opened by the PIN it was
  // written with, which may be older than the PIN in use today.
  const [restorePin, setRestorePin] = useState('');
  // Held so a backup that arrived without a PIN can be retried by typing one,
  // instead of making the user hunt for the file again on a phone.
  const [pendingBackup, setPendingBackup] = useState<string | null>(null);

  // ---- Export ----
  const handleExport = async () => {
    setExportBusy(true);
    setExportNote(null);
    try {
      const b64 = await exportBackup(backupPin.trim() || undefined);
      const blob = new Blob([b64], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `khazana-backup-${new Date().toISOString().slice(0, 10)}.ftos`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportNote({
        kind: 'success',
        text: backupPin.trim()
          ? 'Backup exported. It is encrypted with the PIN you just entered and can be restored on any device using that same PIN.'
          : 'Backup exported using the older format. It can only be restored into THIS vault — enter a PIN above to make a backup you can move to another device.',
      });
    } catch (e) {
      setExportNote({ kind: 'error', text: `Export failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setExportBusy(false);
    }
  };

  // ---- Restore ----
  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runRestore(await file.text());
    if (fileRef.current) fileRef.current.value = '';
  };

  const runRestore = async (text: string) => {
    setRestoreNote(null);
    try {
      const n = await importBackup(text, restorePin.trim() || undefined);
      setPendingBackup(null);
      setRestoreNote({ kind: 'success', text: `Restored ${n} record${n !== 1 ? 's' : ''}. This vault now matches the backup.` });
    } catch (err) {
      // Say what actually went wrong, and — when the fix is "type your PIN" —
      // keep the file so the retry is one tap rather than a second file hunt.
      if (err instanceof BackupError && err.reason === 'needs-pin') {
        setPendingBackup(text);
        setRestoreNote({
          kind: 'error',
          text: 'This backup is PIN-protected. Type the PIN it was exported with in the box below, then press Restore.',
        });
        return;
      }
      setPendingBackup(err instanceof BackupError && err.reason === 'wrong-pin' ? text : null);
      setRestoreNote({
        kind: 'error',
        text: err instanceof BackupError
          ? err.message
          : `Restore failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  // ---- Sample data ----
  const handleSample = async () => {
    setSampleBusy(true);
    setSampleNote(null);
    try {
      await loadSampleData();
      setSampleNote({ kind: 'success', text: 'Sample data loaded. Explore the dashboard to see it in action.' });
    } catch (e) {
      setSampleNote({ kind: 'error', text: `Failed to load sample data: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSampleBusy(false);
    }
  };

  // ---- Wipe ----
  const handleWipe = async () => {
    if (!(await confirm({
      title: 'Erase this vault?',
      message: 'This permanently erases all data in this vault. This cannot be undone.',
      confirmLabel: 'Erase everything',
      danger: true,
    }))) return;
    await wipe();
  };

  return (
    <div className="space-y-5">
      <PageIntro
        title="Settings & Privacy"
        subtitle="Your data never leaves this device."
        action={
          <Button variant="soft" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
            <Sparkles size={15} /> Take a tour
          </Button>
        }
      />

      {/* Appearance */}
      <GlassCard>
        <SectionHeader title="Appearance" />
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <div className="eyebrow mb-2">Theme</div>
            <Segmented<ThemeChoice>
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              value={theme}
              onChange={setTheme}
            />
            <p className="text-[11.5px] text-muted mt-2">System follows your OS setting.</p>
          </div>
          <div>
            <div className="eyebrow mb-2">Accent color</div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <AccentSwatch swatch="#34406b" label="Indigo" active={accent === 'default'} onClick={() => setAccent('default')} />
              {(Object.keys(ACCENTS) as Exclude<AccentName, 'default'>[]).map((k) => (
                <AccentSwatch key={k} swatch={ACCENTS[k].swatch} label={ACCENTS[k].label} active={accent === k} onClick={() => setAccent(k)} />
              ))}
            </div>
            <p className="text-[11.5px] text-muted mt-2">Tuned for both light and dark.</p>
          </div>
        </div>
      </GlassCard>

      {/* Profiles */}
      <GlassCard>
        <SectionHeader title="Profiles" />
        <p className="text-xs text-muted mb-4">
          Each profile keeps fully separate data — transactions, investments, liabilities, and more — inside the same encrypted vault. Use profiles to track yourself, a spouse, or a business independently.
        </p>

        {/* Profile rows */}
        <div className="divide-y divide-[var(--glass-border)]">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const isEditing = p.id in renameMap;
            const kindLabel = p.kind === 'self' ? 'Personal' : p.kind === 'spouse' ? 'Spouse' : 'Business';
            const KindIcon = p.kind === 'spouse' ? Heart : p.kind === 'business' ? Briefcase : User;
            const initial = (p.name[0] ?? '?').toUpperCase();

            return (
              <div key={p.id} className="flex items-center gap-3 py-2.5 min-w-0">
                {/* Avatar */}
                <span className="w-8 h-8 rounded-full grid place-items-center bg-accent/12 text-accent shrink-0 font-semibold text-sm select-none">
                  {initial}
                </span>

                {/* Name / rename input */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={renameMap[p.id]}
                      onChange={(e) => setRenameMap((m) => ({ ...m, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(p.id);
                        if (e.key === 'Escape') cancelRename(p.id);
                      }}
                      className="h-7 py-0 text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-income/12 text-income shrink-0">
                          <Check size={10} />Active
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted">
                    <KindIcon size={11} />
                    <span>{kindLabel}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => void commitRename(p.id)}
                        className="p-1.5 rounded-[var(--radius-btn)] text-income hover:bg-income/10 transition-colors"
                        title="Save name"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => cancelRename(p.id)}
                        className="p-1.5 rounded-[var(--radius-btn)] text-muted hover:bg-[var(--glass-border)] transition-colors text-xs font-medium"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      {!isActive && (
                        <button
                          onClick={() => void setActiveProfile(p.id)}
                          className="px-2.5 py-1 rounded-[var(--radius-btn)] text-[12px] font-semibold text-accent hover:bg-accent/10 border border-accent/25 transition-colors"
                        >
                          Switch
                        </button>
                      )}
                      <button
                        onClick={() => startRename(p.id, p.name)}
                        className="p-1.5 rounded-[var(--radius-btn)] text-muted hover:text-ink hover:bg-[var(--glass-border)] transition-colors"
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </button>
                      {profiles.length > 1 && (
                        <button
                          onClick={() => void handleDelete(p.id, p.name)}
                          className="p-1.5 rounded-[var(--radius-btn)] text-muted hover:text-expense hover:bg-expense/10 transition-colors"
                          title="Delete profile"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add profile form */}
        <div className="pt-4 mt-2 border-t border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-2.5">
            <Users size={14} className="text-muted shrink-0" />
            <span className="text-xs font-semibold text-ink-soft">Add profile</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Profile name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAddProfile(); }}
              className="flex-1 min-w-[120px] h-8 text-sm py-0"
            />
            <Segmented<ProfileKind>
              value={newKind}
              onChange={setNewKind}
              options={[
                { value: 'self', label: 'Personal' },
                { value: 'spouse', label: 'Spouse' },
                { value: 'business', label: 'Business' },
              ]}
            />
            <Button variant="soft" onClick={() => void handleAddProfile()} disabled={addBusy || !newName.trim()}>
              <Plus size={14} />
              {addBusy ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Notifications */}
      <GlassCard>
        <SectionHeader title="Notifications" />
        <NotificationsSection />
      </GlassCard>

      {/* Privacy & Backup */}
      <GlassCard>
        <SectionHeader title="Privacy & Backup" />
        <div className="space-y-1 mb-5">
          <PrivacyRow
            icon={<ShieldCheck size={18} />}
            title="Encrypted on this device"
            sub="Your vault is secured with AES-256-GCM encryption using your PIN as the key."
          />
          <PrivacyRow
            icon={<CloudOff size={18} />}
            title="No cloud, no tracking"
            sub="Zero telemetry, zero servers. All data lives in your browser's IndexedDB, offline-first."
          />
          <PrivacyRow
            icon={<KeyRound size={18} />}
            title="You hold the only key — your PIN"
            sub="Nobody, not even us, can read your vault without your PIN. There is no recovery option."
          />
          <StorageDurabilityRow />
        </div>

        <DemoDataRow />

        {/* Export */}
        <div className="pt-4 border-t border-[var(--glass-border)]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sm">Export encrypted backup</div>
              <div className="text-xs text-muted mt-0.5">Downloads a <code className="font-mono">.ftos</code> file. Set a backup PIN to make it restorable on another device.</div>
            </div>
            <Button variant="soft" onClick={handleExport} disabled={exportBusy}>
              <Download size={15} />
              {exportBusy ? 'Exporting…' : 'Export backup'}
            </Button>
          </div>
          <div className="mt-3 max-w-sm">
            <label className="text-xs font-semibold text-muted" htmlFor="backup-pin">Backup PIN</label>
            <input
              id="backup-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={backupPin}
              onChange={(e) => setBackupPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Used for both export and restore"
              className="mt-1 w-full rounded-[var(--radius-card)] border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              A backup carries its own salt, so this PIN — not your current vault — is what reopens it.
              Leave blank to write the old vault-bound format, which only ever restores into this exact install.
            </p>
          </div>
          {exportNote && <StatusNote note={exportNote} />}
        </div>

        {/* Restore */}
        <div className="pt-4 mt-4 border-t border-[var(--glass-border)]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sm">Restore from backup</div>
              <div className="text-xs text-muted mt-0.5">
                Select a <code className="font-mono">.ftos</code> backup file. Restoring
                <b> replaces </b> this vault with the backup, so anything recorded since it
                was taken will be gone. The file is fully checked first &mdash; if it fails,
                nothing here changes.
              </div>
            </div>
            <Button variant="soft" onClick={() => fileRef.current?.click()}>
              <Upload size={15} />
              {pendingBackup ? 'Choose another file' : 'Choose file'}
            </Button>
          </div>

          <div className="mt-3 max-w-sm">
            <label className="text-xs font-semibold text-muted" htmlFor="restore-pin">Backup PIN</label>
            <div className="flex gap-2 mt-1">
              <input
                id="restore-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={restorePin}
                onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, ''))}
                placeholder="PIN this backup was exported with"
                onKeyDown={(e) => { if (e.key === 'Enter' && pendingBackup) void runRestore(pendingBackup); }}
                className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              {pendingBackup && (
                <Button variant="soft" onClick={() => void runRestore(pendingBackup)} disabled={!restorePin.trim()}>
                  Restore
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">
              Fill this in <b>before</b> choosing the file. Leave it blank only for an older backup being
              restored into the very same install that created it.
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleRestore}
          />
          {restoreNote && <StatusNote note={restoreNote} />}
        </div>
      </GlassCard>

      {/* Display currency */}
      <GlassCard>
        <SectionHeader title="Display Currency" />
        <p className="text-xs text-muted mb-3">
          All amounts are stored in INR and converted for display. Rates are yours to set, below.
        </p>
        <Field label="Currency">
          <Select
            value={currencyCode}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.symbol})
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2 mt-2.5">
          <Globe size={14} className="text-muted" />
          <span className="text-xs text-muted">Currently displaying in <strong>{currencyCode}</strong></span>
        </div>
      </GlassCard>

      {/* Exchange rates */}
      <ExchangeRates />

      {/* Data */}
      <GlassCard>
        <SectionHeader title="Data" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Load sample data</div>
            <div className="text-xs text-muted mt-0.5">Populate this vault with realistic demo transactions, holdings, and liabilities.</div>
          </div>
          <Button variant="soft" onClick={handleSample} disabled={sampleBusy}>
            <Sparkles size={15} />
            {sampleBusy ? 'Loading…' : 'Load sample data'}
          </Button>
        </div>
        {sampleNote && <StatusNote note={sampleNote} />}
      </GlassCard>

      {/* Danger zone */}
      <GlassCard>
        <SectionHeader title="Danger Zone" />
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sm">Lock vault</div>
              <div className="text-xs text-muted mt-0.5">Clears decrypted data from memory. You will need your PIN to unlock again.</div>
            </div>
            <Button variant="ghost" onClick={lock}>
              <Lock size={15} />
              Lock now
            </Button>
          </div>

          <div className="pt-3 border-t border-[var(--glass-border)] flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sm text-expense">Erase this vault</div>
              <div className="text-xs text-muted mt-0.5">Permanently deletes all records. This cannot be undone. Export a backup first.</div>
            </div>
            <Button variant="danger" onClick={handleWipe}>
              <Trash2 size={15} />
              Erase vault
            </Button>
          </div>
        </div>
      </GlassCard>

      <p className="text-center text-xs text-muted italic px-6 pb-4">
        {APP_NAME} is fully offline. Nothing leaves this device without your explicit action.
      </p>
    </div>
  );
}

/**
 * The demo-market-data switch.
 *
 * Khazana never fetches quotes, index levels or headlines, so the screens that
 * would need them (Markets, News, day-change columns) are filled with figures
 * generated on this device. This is the control that turns those surfaces off
 * — it is the reason the DemoBadge can be trusted.
 */
function DemoDataRow() {
  const [on, setOn] = useDemoData();
  return (
    <div className="pt-4 border-t border-[var(--line)]">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full grid place-items-center bg-violet-soft text-violet shrink-0">
          <FlaskConical size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Demo market data</div>
          <div className="text-xs text-muted mt-0.5 leading-relaxed">
            Markets, News and the day-change columns need a price feed, and Khazana never contacts one — asking a
            provider for a quote would tell it exactly what you own. With this on, those surfaces show figures
            generated on this device and labelled <b className="text-violet font-semibold">DEMO</b>. Turn it off and
            they show nothing rather than something misleading.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Demo market data"
          onClick={() => setOn(!on)}
          className={`focus-ring relative w-11 h-6 rounded-full shrink-0 transition-colors duration-[250ms] ${on ? 'bg-accent' : 'bg-fill-strong'}`}
        >
          <span
            className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full transition-transform duration-[250ms] ${on ? 'translate-x-5 bg-white' : 'bg-muted'}`}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * Tells the user whether the browser has promised to keep their vault.
 *
 * With no server, IndexedDB is not a cache — it is the only copy. Browsers
 * evict ordinary origin storage under pressure, and Safari clears it for sites
 * that have not been visited in about a week. That is a real way to lose a
 * month of records, so it is stated plainly rather than hidden behind an
 * assumption of durability, and the user is pointed at the export that fixes
 * it. If the browser said no, retrying is worth offering: installing the app or
 * bookmarking it often flips the answer.
 */
function StorageDurabilityRow() {
  const persistence = useApp((s) => s.persistence);
  const [busy, setBusy] = useState(false);
  const setState = useApp.setState;

  const retry = async () => {
    setBusy(true);
    try {
      setState({ persistence: await requestPersistence() });
    } finally {
      setBusy(false);
    }
  };

  const persisted = persistence === 'persisted';
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${
          persisted ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning'
        }`}
      >
        {persisted ? <HardDrive size={18} /> : <ShieldAlert size={18} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {persisted ? 'Storage marked permanent' : 'Storage is not guaranteed'}
        </div>
        <div className="text-xs text-muted mt-0.5 leading-relaxed">
          {persisted
            ? 'This browser has agreed not to clear your vault to reclaim space. Keep exporting backups anyway — a permanent mark is not a copy.'
            : 'This browser may clear your vault to reclaim space, and Safari clears storage for sites left unvisited for about a week. Install Khazana or bookmark it to improve your odds, and export a backup you keep yourself.'}
        </div>
      </div>
      {!persisted && persistence !== 'unsupported' && (
        <Button variant="ghost" onClick={retry} disabled={busy}>
          {busy ? 'Asking…' : 'Ask again'}
        </Button>
      )}
    </div>
  );
}

function PrivacyRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-9 h-9 rounded-full grid place-items-center bg-income/12 text-income shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
      <CheckCircle2 size={18} className="text-income shrink-0" />
    </div>
  );
}

/**
 * Exchange rates, as dated observations the user owns.
 *
 * Rates used to be constants in `domain/currency.ts` — `USD: 83.3` — with no way
 * to change them, while the copy above claimed they could be "updated in the
 * Market Data settings", a screen that did not exist. Every dollar-denominated
 * holding was therefore valued at 83.30 forever, and nothing on screen admitted
 * it.
 *
 * Only currencies actually in use are listed. A settings screen offering ten
 * rates to somebody who holds one foreign asset is a chore, not a feature.
 */
function ExchangeRates() {
  const holdings = useApp((s) => s.holdings);
  const fxRates = useApp((s) => s.fxRates);
  const currencyCode = useApp((s) => s.currencyCode);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const now = useNow(60_000);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const inUse = Array.from(new Set([
    ...holdings.map((h) => h.currency ?? 'INR'),
    currencyCode,
  ])).filter((c) => c !== 'INR').sort();

  if (inUse.length === 0) return null;

  const save = async (code: string) => {
    const raw = draft[code];
    if (!raw || !(D(raw).gt(0))) return;
    await put(STORE.fxRate, {
      id: code, code, rateToInr: D(raw).toString(),
      asOf: Date.now(), source: 'manual',
    } as unknown as FxRate & { id: string } & Record<string, unknown>);
    setDraft((d) => ({ ...d, [code]: '' }));
  };

  return (
    <GlassCard>
      <SectionHeader title="Exchange rates" />
      <p className="text-xs text-muted mb-4">
        Khazana has no price feed, so a rate is only as good as the last time you set it.
        Each one shows the day it was recorded.
      </p>
      <div className="grid gap-4">
        {inUse.map((code) => {
          const cur = findCurrency(code);
          const rate = resolveRate(code, fxRates);
          const at = rateAsOf(code, fxRates);
          const stale = now ? isRateStale(code, fxRates, now) : false;
          return (
            <div key={code} className="flex items-end gap-3 flex-wrap">
              <div className="min-w-[7rem]">
                <div className="text-[13px] font-semibold">{code} → INR</div>
                <div className="text-[11px] text-muted">{cur.name}</div>
              </div>
              <Field label={`₹ per 1 ${cur.symbol}`}>
                <NumberInput
                  value={draft[code] ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, [code]: v }))}
                  placeholder={rate.toString()}
                />
              </Field>
              <Button variant="soft" onClick={() => void save(code)} disabled={!draft[code]}>
                Set rate
              </Button>
              <div className="text-[11px] leading-relaxed pb-2.5">
                <span className="tnum font-medium">₹{rate.toString()}</span>{' '}
                {/* An unrecorded rate is a built-in guess and says so — the
                    difference between "we know" and "we assumed" is the whole
                    point of showing this at all. */}
                {at == null ? (
                  <span className="text-warn">built-in default, never set</span>
                ) : stale ? (
                  <span className="text-warn">set {formatDate(at)} — likely stale</span>
                ) : (
                  <span className="text-muted">set {formatDate(at)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

/**
 * Notification settings.
 *
 * Also where permission is asked for — on a click, having read what it does.
 * A web permission prompt fired on load is how an origin gets permanently
 * denied, and the user cannot undo that from inside the app.
 */
function NotificationsSection() {
  // useSyncExternalStore, not an effect: localStorage and Notification are both
  // undefined while the static export is prerendered, and reading them in an
  // effect to call setState causes a cascading render. This is the shape React
  // provides for a store that only exists on the client.
  const prefs = useSyncExternalStore(
    subscribeNotifyPrefs, getNotifyPrefsSnapshot, getNotifyPrefsServerSnapshot,
  );
  const permission = useSyncExternalStore(
    subscribePermission, notifyPermission, () => 'unsupported' as NotifyPermission,
  );

  const update = (next: NotifyPrefs) => saveNotifyPrefs(next);

  const toggleMaster = async (on: boolean) => {
    if (on) {
      const result = await requestNotifyPermission();
      notifyPermissionChanged();
      // Recording "on" while the browser says no would leave a switch claiming
      // something the app cannot do.
      if (result !== 'granted') return;
    }
    update({ ...prefs, enabled: on });
  };

  const toggleCategory = (c: NotifyCategory, on: boolean) => update({
    ...prefs,
    categories: on ? [...prefs.categories, c] : prefs.categories.filter((x) => x !== c),
  });

  const CATEGORIES: { key: NotifyCategory; title: string; sub: string }[] = [
    { key: 'bills', title: 'Bills and recurring', sub: 'When a scheduled transaction is due' },
    { key: 'renewals', title: 'Insurance renewals', sub: 'When a policy is about to renew' },
    { key: 'goals', title: 'Goal target dates', sub: 'As a savings goal reaches its date' },
    { key: 'budget', title: 'Budget thresholds', sub: 'When a transaction crosses one' },
    { key: 'market', title: 'Price and weight alerts', sub: 'Against the last price you entered' },
    { key: 'digest', title: 'While you were away', sub: 'What passed since your last visit' },
  ];

  if (permission === 'unsupported') {
    return (
      <div className="text-xs text-muted leading-relaxed">
        This browser does not offer notifications. On iPhone and iPad they are available from iOS 16.4,
        but only once Khazana has been added to the Home Screen.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NotifyToggle
        title="Show system notifications"
        sub="Posted by this browser, about data already decrypted on this device. Nothing is sent anywhere."
        on={prefs.enabled}
        onChange={(v) => { void toggleMaster(v); }}
      />

      {permission === 'denied' && (
        <div className="text-xs text-danger leading-relaxed">
          Your browser is blocking notifications for Khazana. That has to be changed in the browser&rsquo;s
          site settings — a page cannot ask again once it has been refused.
        </div>
      )}

      <div className="space-y-1 pt-1">
        {CATEGORIES.map((c) => (
          <NotifyToggle
            key={c.key}
            title={c.title}
            sub={c.sub}
            on={prefs.categories.includes(c.key)}
            disabled={!prefs.enabled}
            onChange={(v) => toggleCategory(c.key, v)}
          />
        ))}
      </div>

      <NotifyToggle
        title="Keep amounts out of the notification"
        sub="A notification preview is the one place Khazana's data is visible without your PIN."
        on={prefs.hideAmounts}
        disabled={!prefs.enabled}
        onChange={(v) => update({ ...prefs, hideAmounts: v })}
      />

      <div className="text-xs text-muted leading-relaxed pt-3 border-t border-[var(--line)]">
        <b className="text-ink font-semibold">What this cannot do.</b> The web has no way to run a
        notification while its tab is closed: there is no server here to push one, and the browser API
        for scheduling one locally was never shipped. So Khazana notifies you the moment a rule fires
        while a window is open, and on your next visit tells you what passed in between. The Android
        and iOS apps do not have this limit — there the phone&rsquo;s own scheduler holds the reminder,
        so bills, renewals and goal dates arrive with the app closed.
      </div>
    </div>
  );
}

function NotifyToggle({ title, sub, on, onChange, disabled = false }: {
  title: string; sub: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted mt-0.5 leading-relaxed">{sub}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`focus-ring relative w-11 h-6 rounded-full shrink-0 transition-colors duration-[250ms] ${on ? 'bg-accent' : 'bg-fill-strong'} ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full transition-transform duration-[250ms] ${on ? 'translate-x-5 bg-white' : 'bg-muted'}`}
        />
      </button>
    </div>
  );
}
