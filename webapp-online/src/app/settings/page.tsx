'use client';
/**
 * Settings for Khazana Online: the offline Settings' appearance, profiles and
 * display currency (same Zentra cards), then what only an account has: devices,
 * export, sign out. No PIN, backup file or erase-vault: the account replaces them.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, Briefcase, Check, CheckCircle2, Download, Globe, Link2, LogOut, MonitorSmartphone, Pencil, Plus,
  Sparkles, Trash2, User, Users, Heart,
} from 'lucide-react';
import { ACCENTS } from '@khazana/domain/appearance';
import { CURRENCIES } from '@khazana/domain/currency';
import type { ProfileKind } from '@khazana/domain/types';
import { Button, buttonClass, Field, GlassCard, Input, PageIntro, Segmented, SectionHeader, Select } from '@khazana/ui/ui';
import { useConfirm } from '@khazana/screens/components/Confirm';
import { getPlatform } from '@khazana/screens/platform';
import { useApp, useAppApi, type AccentName, type ThemeChoice } from '@khazana/screens/store';
import { signOutEverywhereLocal } from '@/lib/account';
import { isEmptyAccount } from '@/lib/sampleData';

type Note = { kind: 'success' | 'error'; text: string };

function StatusNote({ note }: { note: Note }) {
  const ok = note.kind === 'success';
  return (
    <div role={ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-[var(--radius-panel)] px-3.5 py-2.5 text-sm mt-3 ${ok ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'}`}>
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
      <span>{note.text}</span>
    </div>
  );
}

function AccentSwatch({ swatch, label, active, onClick }: { swatch: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} title={label} aria-label={label} aria-pressed={active}
      className={`focus-ring relative w-8 h-8 rounded-full transition-transform hover:scale-110 ${active ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)] ring-[var(--ink-soft)]' : ''}`}
      style={{ background: swatch }}
    >
      {active && <Check size={15} className="absolute inset-0 m-auto text-white" />}
    </button>
  );
}

const KIND_LABEL: Record<ProfileKind, string> = { self: 'Personal', spouse: 'Spouse', business: 'Business' };
const KIND_ICON = { self: User, spouse: Heart, business: Briefcase } as const;

export default function SettingsPage() {
  const confirm = useConfirm();
  const api = useAppApi();
  const theme = useApp((s) => s.theme);
  const accent = useApp((s) => s.accent);
  const setTheme = useApp((s) => s.setTheme);
  const setAccent = useApp((s) => s.setAccent);
  const currencyCode = useApp((s) => s.currencyCode);
  const setCurrency = useApp((s) => s.setCurrency);
  const profiles = useApp((s) => s.profiles);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const setActiveProfile = useApp((s) => s.setActiveProfile);
  const addProfile = useApp((s) => s.addProfile);
  const renameProfile = useApp((s) => s.renameProfile);
  const deleteProfile = useApp((s) => s.deleteProfile);
  const empty = useApp((s) => isEmptyAccount(s));

  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProfileKind>('self');
  const [addBusy, setAddBusy] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleNote, setSampleNote] = useState<Note | null>(null);
  const [exportNote, setExportNote] = useState<Note | null>(null);

  useEffect(() => { document.title = 'Settings · Khazana Online'; }, []);

  const commitRename = async (id: string) => {
    const name = renameMap[id]?.trim();
    if (name) await renameProfile(id, name);
    setRenameMap((m) => { const { [id]: _drop, ...rest } = m; void _drop; return rest; });
  };
  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAddBusy(true);
    try { await addProfile(newName.trim(), newKind); setNewName(''); setNewKind('self'); } finally { setAddBusy(false); }
  };
  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      message: 'Everything in this profile is deleted from this account and from every device it syncs to. This cannot be undone.',
      confirmLabel: 'Delete profile', danger: true,
    });
    if (ok) await deleteProfile(id);
  };

  const handleSample = async () => {
    const load = getPlatform().loadSampleData;
    if (!load) return;
    setSampleBusy(true);
    setSampleNote(null);
    try {
      await load();
      setSampleNote({ kind: 'success', text: 'Sample data loaded. It syncs like your own records, so remove it before you add real ones.' });
    } catch (e) {
      setSampleNote({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSampleBusy(false);
    }
  };

  /** Everything in the account as one JSON file: plain text, so keep it somewhere you trust. */
  const handleExport = async () => {
    setExportNote(null);
    const s = api.getState();
    const data = {
      exportedAt: new Date().toISOString(), app: 'Khazana Online', profiles: s.profiles, categories: s.categories, accounts: s.accounts,
      transactions: s.txns, transfers: s.transfers, budgets: s.budgets, goals: s.goals, holdings: s.holdings, lots: s.lots,
      liabilities: s.liabilities, recurring: s.recurring, insurances: s.insurances, watchlist: s.watchlist, dividends: s.dividends,
      alerts: s.alerts, snapshots: s.snapshots, fxRates: s.fxRates,
    };
    const out = await getPlatform().saveFile({
      filename: `khazana-online-${new Date().toISOString().slice(0, 10)}.json`,
      data: JSON.stringify(data, null, 2), mimeType: 'application/json',
    });
    if (out.status === 'failed') setExportNote({ kind: 'error', text: out.message });
    else if (out.status === 'saved') setExportNote({ kind: 'success', text: 'Exported. The file is not encrypted, so keep it somewhere you trust.' });
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out of this device?',
      message: 'This removes your session, your keys and the synced records from this browser. Your data stays in your account, and you can sign in again with your passkey.',
      confirmLabel: 'Sign out', danger: true,
    });
    if (!ok) return;
    await signOutEverywhereLocal().catch(() => undefined);
    window.location.replace('/sign-in/');
  };

  return (
    <div className="space-y-5">
      <PageIntro
        title="Settings"
        subtitle="Your records are encrypted on this device before they sync."
        action={<Button variant="soft" onClick={() => getPlatform().replayTour()}><Sparkles size={15} /> Take a tour</Button>}
      />

      <GlassCard>
        <SectionHeader title="Appearance" info="settings.appearance" />
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <div className="eyebrow mb-2">Theme</div>
            <Segmented<ThemeChoice>
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]}
              value={theme}
              onChange={setTheme}
            />
            <p className="text-[11.5px] text-muted mt-2">System follows your OS setting.</p>
          </div>
          <div>
            <div className="eyebrow mb-2">Accent color</div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <AccentSwatch swatch="var(--ink)" label="Ink" active={accent === 'default'} onClick={() => setAccent('default')} />
              {(Object.keys(ACCENTS) as Exclude<AccentName, 'default'>[]).map((k) => (
                <AccentSwatch key={k} swatch={ACCENTS[k].swatch} label={ACCENTS[k].label} active={accent === k} onClick={() => setAccent(k)} />
              ))}
            </div>
            <p className="text-[11.5px] text-muted mt-2">Tuned for both light and dark.</p>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Profiles" info="settings.profiles" />
        <p className="text-xs text-muted mb-4">
          Each profile keeps fully separate data — transactions, investments, liabilities, and more — inside the same account. Use profiles to track yourself, a spouse, or a business independently. They sync to all your devices.
        </p>
        <div className="divide-y divide-[var(--glass-border)]">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const isEditing = p.id in renameMap;
            const KindIcon = KIND_ICON[p.kind] ?? User;
            return (
              <div key={p.id} className="flex items-center gap-3 py-2.5 min-w-0">
                <span className="w-10 h-10 rounded-full grid place-items-center bg-accent/12 text-accent shrink-0 font-semibold text-sm select-none" aria-hidden>
                  {(p.name[0] ?? '?').toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <Input
                      autoFocus aria-label={`New name for ${p.name}`} value={renameMap[p.id]} className="h-7 py-0 text-sm"
                      onChange={(e) => setRenameMap((m) => ({ ...m, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(p.id);
                        if (e.key === 'Escape') setRenameMap((m) => { const { [p.id]: _drop, ...rest } = m; void _drop; return rest; });
                      }}
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
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted"><KindIcon size={11} /><span>{KIND_LABEL[p.kind]}</span></div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <button type="button" onClick={() => void commitRename(p.id)} className="focus-ring p-1.5 rounded-[var(--radius-btn)] text-income hover:bg-income/10 transition-colors" aria-label="Save name" title="Save name">
                      <Check size={14} />
                    </button>
                  ) : (
                    <>
                      {!isActive && (
                        <button type="button" onClick={() => void setActiveProfile(p.id)} className="focus-ring px-2.5 py-1 rounded-[var(--radius-btn)] text-[12px] font-semibold text-accent hover:bg-accent/10 border border-accent/25 transition-colors">
                          Switch
                        </button>
                      )}
                      <button type="button" onClick={() => setRenameMap((m) => ({ ...m, [p.id]: p.name }))} className="focus-ring p-1.5 rounded-[var(--radius-btn)] text-muted hover:text-ink hover:bg-[var(--glass-border)] transition-colors" aria-label={`Rename ${p.name}`} title="Rename">
                        <Pencil size={14} />
                      </button>
                      {profiles.length > 1 && (
                        <button type="button" onClick={() => void handleDelete(p.id, p.name)} className="focus-ring p-1.5 rounded-[var(--radius-btn)] text-muted hover:text-expense hover:bg-expense/10 transition-colors" aria-label={`Delete ${p.name}`} title="Delete profile">
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
        <div className="pt-4 mt-2 border-t border-[var(--glass-border)]">
          <div className="flex items-center gap-2 mb-2.5">
            <Users size={14} className="text-muted shrink-0" />
            <span className="text-xs font-semibold text-ink-soft">Add profile</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Profile name" placeholder="Profile name" value={newName} className="flex-1 min-w-[120px] h-8 text-sm py-0"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            />
            <Segmented<ProfileKind>
              value={newKind} onChange={setNewKind}
              options={[{ value: 'self', label: 'Personal' }, { value: 'spouse', label: 'Spouse' }, { value: 'business', label: 'Business' }]}
            />
            <Button variant="soft" onClick={() => void handleAdd()} disabled={addBusy || !newName.trim()}>
              <Plus size={14} />{addBusy ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Display Currency" info="settings.displayCurrency" />
        <p className="text-xs text-muted mb-3">All amounts are stored in INR and converted for display.</p>
        <Field label="Currency">
          <Select value={currencyCode} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-2 mt-2.5">
          <Globe size={14} className="text-muted" />
          <span className="text-xs text-muted">Currently displaying in <strong>{currencyCode}</strong></span>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Connections" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Bank accounts & investments</div>
            <div className="text-xs text-muted mt-0.5">Link banks, deposits, mutual funds, demat, NPS and insurance through an Account Aggregator. The data reaches this device sealed and is imported here.</div>
          </div>
          <Link href="/link" className={buttonClass('soft')}><Link2 size={15} />Link bank & investments</Link>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Devices & pairing" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Your devices</div>
            <div className="text-xs text-muted mt-0.5">See where your account is signed in, rename a device, sign one out, or approve a new one. Each device holds its own sealed copy of your data key.</div>
          </div>
          <Link href="/settings/devices" className={buttonClass('soft')}><MonitorSmartphone size={15} />Manage devices</Link>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Data" info="settings.data" />
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-sm">Export your data</div>
              <div className="text-xs text-muted mt-0.5">Everything in the account as one JSON file. It is not encrypted, so keep it somewhere you trust.</div>
            </div>
            <Button variant="soft" onClick={() => void handleExport()}><Download size={15} />Export</Button>
          </div>
          {exportNote && <StatusNote note={exportNote} />}
          {getPlatform().loadSampleData && (
            <div className="pt-4 border-t border-[var(--glass-border)] flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="font-semibold text-sm">Load sample data</div>
                <div className="text-xs text-muted mt-0.5">Fill an empty account with a realistic demo year. Never replaces your own records.</div>
              </div>
              <Button variant="soft" onClick={() => void handleSample()} disabled={sampleBusy || !empty}>
                <Sparkles size={15} />{sampleBusy ? 'Loading…' : 'Load sample data'}
              </Button>
            </div>
          )}
          {sampleNote && <StatusNote note={sampleNote} />}
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader title="Account" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Sign out of this device</div>
            <div className="text-xs text-muted mt-0.5">Removes your session, keys and the synced records from this browser. Your data stays in your account.</div>
          </div>
          <Button variant="ghost" onClick={() => void handleSignOut()}><LogOut size={15} />Sign out</Button>
        </div>
        <p className="text-xs text-muted mt-4">
          <Link href="/how" className="underline">How the encryption works</Link> · <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
        </p>
      </GlassCard>
    </div>
  );
}
