'use client';
import { useRef, useState } from 'react';
import {
  ShieldCheck, CloudOff, KeyRound, Download, Upload,
  Globe, Lock, Trash2, Sparkles, CheckCircle2, AlertCircle,
  Users, Plus, Pencil, Check, Briefcase, User, Heart, FlaskConical,
} from 'lucide-react';
import { APP_NAME } from '@/lib/brand';
import { TOUR_EVENT } from '@/components/Tour';
import { useApp, ACCENTS, type AccentName, type ThemeChoice } from '@/lib/store';
import { loadSampleData } from '@/lib/sampleData';
import { CURRENCIES } from '@/domain/currency';
import { GlassCard, SectionHeader, Button, Field, Select, PageIntro, Input, Segmented } from '@/components/ui';
import { useDemoData } from '@/components/DemoBadge';
import { useConfirm } from '@/components/Confirm';
import type { ProfileKind } from '@/lib/types';
import { BackupError } from '@/lib/backupError';

type NoteKind = 'success' | 'error';
interface Note { kind: NoteKind; text: string }

function StatusNote({ note }: { note: Note }) {
  const isOk = note.kind === 'success';
  return (
    <div className={`flex items-start gap-2 rounded-[12px] px-3.5 py-2.5 text-sm mt-3 ${isOk ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'}`}>
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
      setRestoreNote({ kind: 'success', text: `Restored ${n} record${n !== 1 ? 's' : ''} from backup.` });
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
                        className="p-1.5 rounded-[8px] text-income hover:bg-income/10 transition-colors"
                        title="Save name"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => cancelRename(p.id)}
                        className="p-1.5 rounded-[8px] text-muted hover:bg-[var(--glass-border)] transition-colors text-xs font-medium"
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
                          className="px-2.5 py-1 rounded-[8px] text-[12px] font-semibold text-accent hover:bg-accent/10 border border-accent/25 transition-colors"
                        >
                          Switch
                        </button>
                      )}
                      <button
                        onClick={() => startRename(p.id, p.name)}
                        className="p-1.5 rounded-[8px] text-muted hover:text-ink hover:bg-[var(--glass-border)] transition-colors"
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </button>
                      {profiles.length > 1 && (
                        <button
                          onClick={() => void handleDelete(p.id, p.name)}
                          className="p-1.5 rounded-[8px] text-muted hover:text-expense hover:bg-expense/10 transition-colors"
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
              onChange={(e) => setBackupPin(e.target.value)}
              placeholder="Used for both export and restore"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
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
              <div className="text-xs text-muted mt-0.5">Select a <code className="font-mono">.ftos</code> backup file to merge records into this vault.</div>
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
                onChange={(e) => setRestorePin(e.target.value)}
                placeholder="PIN this backup was exported with"
                onKeyDown={(e) => { if (e.key === 'Enter' && pendingBackup) void runRestore(pendingBackup); }}
                className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
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
          All amounts are stored in INR and converted for display using built-in exchange rates. Rates can be updated in the Market Data settings.
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
