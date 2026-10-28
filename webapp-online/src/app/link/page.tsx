'use client';
/**
 * Link bank & investments (Account Aggregator, ADR 0008). Choose what to share,
 * approve it at the AA, and the data arrives sealed to a key only this
 * account's devices hold. It is opened and imported here, on the device.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, CheckCircle2, Link2, RefreshCw, ShieldCheck, Unlink,
} from 'lucide-react';
import { Button, Chip, EmptyState, Field, GlassCard, Input, PageIntro, SectionHeader } from '@khazana/ui/ui';
import { useReady } from '@/lib/useReady';
import { linker } from '@/lib/aa';
import type { Consent, ConsentStatus, ProviderInfo } from '@/lib/aa/api';
import type { LinkRecord } from '@/lib/aa/link';
import { DATA_GROUPS, TYPE_LABEL, importSummary, linkError } from '@/lib/aa/copy';

const STATUS: Record<ConsentStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  active: { label: 'Active', tone: 'success' },
  pending: { label: 'Waiting for approval', tone: 'warning' },
  paused: { label: 'Paused at your AA', tone: 'warning' },
  revoked: { label: 'Revoked', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  rejected: { label: 'Not approved', tone: 'danger' },
};

/** Set before leaving for the AA's approval screen, read when the user comes back. */
const PENDING_KEY = 'khazana-aa-pending-consent';

const OPEN: ConsentStatus[] = ['pending', 'active', 'paused'];

type Note = { kind: 'success' | 'error'; text: string };

function StatusNote({ note }: { note: Note }) {
  const ok = note.kind === 'success';
  return (
    <div role={ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-[var(--radius-panel)] px-3.5 py-2.5 text-sm mt-3 ${ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> : <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />}
      <span>{note.text}</span>
    </div>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';

export default function LinkPage() {
  const { ready, error: readyError } = useReady();
  const [provider, setProvider] = useState<ProviderInfo>();
  const [consents, setConsents] = useState<Consent[]>();
  const [links, setLinks] = useState<Map<string, LinkRecord>>(new Map());
  const [chosen, setChosen] = useState<Set<string>>(new Set(['bank', 'funds']));
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<Note | null>(null);
  const [revoking, setRevoking] = useState<string>();
  const [removeData, setRemoveData] = useState(false);
  const mobileId = useId();
  const resumed = useRef(false);

  useEffect(() => { document.title = 'Link bank & investments · Khazana Online'; }, []);

  const load = useCallback(async () => {
    const l = linker();
    const [p, c, r] = await Promise.all([l.provider(), l.consents(), l.linkRecords()]);
    setProvider(p);
    setConsents(c);
    setLinks(r);
  }, []);

  /** Runs one step with a live status line; errors become a plain-words alert. */
  const run = useCallback(async (label: string, work: () => Promise<string | void>) => {
    setBusy(label);
    setNote(null);
    try {
      const done = await work();
      if (done) setNote({ kind: 'success', text: done });
    } catch (e) {
      setNote({ kind: 'error', text: linkError(e) });
    } finally {
      setBusy(undefined);
      await load().catch(() => undefined);
    }
  }, [load]);

  /** After approval: fetch, then import on this device. */
  const fetchAndImport = useCallback(async (id: string) => {
    setBusy('Fetching your data from the Account Aggregator…');
    const { fetch, report } = await linker().refresh(id);
    if (fetch.state === 'fresh' && report.payloads === 0 && !report.failed) return 'Already up to date: this link was fetched in the last day.';
    if (fetch.state === 'failed') return `The fetch did not finish (${fetch.error_code ?? 'error'}). ${importSummary(report)}`.trim();
    if (report.failed) return `${importSummary(report)} ${report.failed} payload${report.failed === 1 ? '' : 's'} could not be opened on this device yet; it stays waiting for a device that can.`.trim();
    return importSummary(report);
  }, []);

  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    void (async () => {
      await load().catch((e) => setNote({ kind: 'error', text: linkError(e) }));
      // Back from the AA's approval screen.
      let pending: string | null = null;
      try { pending = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch { /* private mode */ }
      if (pending) {
        const id = pending;
        await run('Checking your approval…', async () => {
          const c = await linker().waitWhilePending(id, 60_000);
          if (c.status !== 'active') return undefined;
          return fetchAndImport(id);
        });
        return;
      }
      // Anything a scheduled fetch left waiting.
      try {
        const report = await linker().importInbox();
        if (report.payloads) setNote({ kind: 'success', text: importSummary(report) });
      } catch {
        // Shown again on the next visit; nothing is lost on the server.
      }
    })();
  }, [ready, load, run, fetchAndImport]);

  const supported = new Set(provider?.fi_types ?? []);
  const typesFor = (key: string) => (DATA_GROUPS.find((g) => g.key === key)?.types ?? []).filter((t) => supported.has(t));
  const fiTypes = [...chosen].flatMap(typesFor);
  const mobileOk = !provider?.needs_aa_handle || /^[6-9]\d{9}$/.test(mobile);

  const toggle = (key: string) => setChosen((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const startLink = () => run('Asking for your consent…', async () => {
    const consent = await linker().createConsent(fiTypes, provider?.needs_aa_handle ? mobile : undefined);
    if (consent.status === 'pending' && consent.redirect_url && !provider?.sample) {
      const url = new URL(consent.redirect_url);
      if (url.protocol !== 'https:') throw new Error('The approval link is not secure; nothing was opened.');
      try { sessionStorage.setItem(PENDING_KEY, consent.id); } catch { /* private mode: the list still shows it */ }
      window.location.assign(url.toString());
      return undefined;
    }
    setBusy('Waiting for approval…');
    const approved = await linker().waitWhilePending(consent.id, 30_000);
    if (approved.status !== 'active') return undefined;
    return fetchAndImport(consent.id);
  });

  const refresh = (id: string) => run('Refreshing…', () => fetchAndImport(id));

  const confirmRevoke = (id: string) => run('Revoking…', async () => {
    const removed = await linker().revoke(id, removeData);
    setRevoking(undefined);
    setRemoveData(false);
    return removed
      ? `Revoked. The ${removed} records this link imported were removed from every device.`
      : 'Revoked. Nothing more will be fetched; what was already imported stays until you delete it.';
  });

  const open = consents?.filter((c) => OPEN.includes(c.status)) ?? [];
  const ended = consents?.filter((c) => !OPEN.includes(c.status)) ?? [];

  return (
    <div className="space-y-5">
      <PageIntro
        title="Link bank & investments"
        subtitle="Through an RBI-licensed Account Aggregator. Your data reaches this device sealed, and is opened only here."
      />

      <p role="status" aria-live="polite" className="sr-only">{busy ?? ''}</p>
      {readyError && <StatusNote note={{ kind: 'error', text: readyError }} />}
      {!ready && !readyError && <p className="text-sm text-muted">Unlocking your account…</p>}

      {ready && provider?.sample && (
        <GlassCard>
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <div className="text-sm">
              <div className="font-semibold">Sample Account Aggregator</div>
              <div className="text-ink-soft mt-0.5">
                This server links to a sample AA: approval is instant and the banks, funds and policies are realistic sample
                data, not yours. It goes through exactly the same sealed, on-device import as a real link.
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {ready && (
        <GlassCard>
          <SectionHeader title="Choose what to link" />
          <fieldset>
            <legend className="sr-only">Data to link</legend>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {DATA_GROUPS.map((g) => {
                const available = typesFor(g.key).length > 0;
                const Icon = g.icon;
                const extra = g.key === 'retirement' && provider && !supported.has('EPF') ? ' EPF and PPF are not on the AA network yet.' : '';
                return (
                  <label
                    key={g.key}
                    className={`flex items-start gap-3 rounded-[var(--radius-panel)] border border-[var(--glass-border)] px-3.5 py-3 ${available ? 'cursor-pointer' : 'opacity-60'}`}
                  >
                    <input
                      type="checkbox" className="mt-1 focus-ring" checked={available && chosen.has(g.key)}
                      disabled={!available || !!busy} onChange={() => toggle(g.key)}
                    />
                    <Icon size={18} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{g.label}</span>
                      <span className="block text-xs text-muted mt-0.5">{available ? g.hint + extra : 'Not offered by this Account Aggregator.'}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {provider?.needs_aa_handle && (
            <div className="mt-4 max-w-sm">
              <Field label="Mobile number linked to your bank" hint="Your Account Aggregator sends an OTP to it. It is passed on once and not stored.">
                <Input
                  id={mobileId} inputMode="numeric" autoComplete="tel-national" maxLength={10} value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} aria-invalid={mobile.length > 0 && !mobileOk}
                />
              </Field>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Button onClick={() => void startLink()} disabled={!!busy || !provider || fiTypes.length === 0 || !mobileOk}>
              <Link2 size={15} aria-hidden />{busy ?? 'Link'}
            </Button>
            <span className="text-xs text-muted">Consent lasts a year. You can revoke it here or at your AA at any time.</span>
          </div>
          {note && <StatusNote note={note} />}
        </GlassCard>
      )}

      {ready && (
        <GlassCard>
          <SectionHeader title="Linked" />
          {consents === undefined && <p className="text-sm text-muted">Loading your links…</p>}
          {consents?.length === 0 && (
            <EmptyState icon={<Link2 size={20} aria-hidden />} title="Nothing linked yet" hint="Choose what to link above. Nothing is shared until you approve it at your Account Aggregator." />
          )}
          <ul className="space-y-3">
            {[...open, ...ended].map((c) => {
              const s = STATUS[c.status];
              const link = links.get(c.id);
              const headingId = `consent-${c.id}`;
              return (
                <li key={c.id} aria-labelledby={headingId} className="rounded-[var(--radius-panel)] border border-[var(--glass-border)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div id={headingId} className="font-semibold text-sm">{c.fi_types.map((t) => TYPE_LABEL[t] ?? t).join(', ')}</div>
                      <div className="text-xs text-muted mt-1">
                        Linked {when(c.created_at)} · expires {when(c.expires_at)} · last fetched {when(c.last_fetched_at)}
                        {link?.lastImportedAt ? ` · imported here ${when(link.lastImportedAt)}` : ''}
                        {c.provider === 'fake' ? ' · sample data' : ''}
                      </div>
                    </div>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </div>
                  {OPEN.includes(c.status) && revoking !== c.id && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {c.status === 'active' && (
                        <Button variant="soft" onClick={() => void refresh(c.id)} disabled={!!busy}><RefreshCw size={15} aria-hidden />Refresh now</Button>
                      )}
                      <Button variant="ghost" onClick={() => { setRevoking(c.id); setRemoveData(false); }} disabled={!!busy}><Unlink size={15} aria-hidden />Revoke</Button>
                    </div>
                  )}
                  {revoking === c.id && (
                    <div className="mt-3 rounded-[var(--radius-panel)] bg-[var(--card-2)] px-3.5 py-3 text-sm" role="group" aria-label="Revoke this link">
                      <p>Revoking stops every future fetch and deletes anything still waiting on the server. What was already imported stays in your records unless you remove it.</p>
                      <label className="flex items-center gap-2 mt-2.5">
                        <input type="checkbox" className="focus-ring" checked={removeData} onChange={(e) => setRemoveData(e.target.checked)} />
                        <span>Also delete what this link imported{link ? ` (${link.imported.accounts} accounts and their transactions, ${link.imported.holdings} holdings, ${link.imported.policies} policies)` : ''}</span>
                      </label>
                      <div className="mt-3 flex gap-2">
                        <Button variant="danger" onClick={() => void confirmRevoke(c.id)} disabled={!!busy}>Revoke</Button>
                        <Button variant="ghost" onClick={() => setRevoking(undefined)} disabled={!!busy}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted mt-4">
            The server sees which kinds of data you linked and when, never the data: it is sealed to a key only your devices
            hold. <Link href="/how" className="underline">How the encryption works</Link>
          </p>
        </GlassCard>
      )}
    </div>
  );
}
