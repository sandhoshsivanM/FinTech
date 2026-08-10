'use client';
/**
 * What the vault knows about itself.
 *
 * Exists because a day of real use produced problems that were plainly visible
 * in the data and reported by nothing: records filed under a profile id from
 * another device, an amount carrying a stray space, a sector override no code
 * path read. Each was diagnosed by reading source. This screen answers those
 * questions without that.
 *
 * Read-only on purpose. A page that silently repaired what it found would
 * destroy the evidence of how the vault got that way.
 */
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Stethoscope, XCircle } from 'lucide-react';
import { useApp } from '@/lib/store';
import { runDiagnostics, worstLevel, type Check } from '@/domain/diagnostics';
import { GlassCard, PageIntro, SectionHeader, Chip } from '@/components/ui';

const ICON = {
  ok: <CheckCircle2 size={17} style={{ color: 'var(--income)' }} />,
  warn: <AlertTriangle size={17} style={{ color: 'var(--warn)' }} />,
  error: <XCircle size={17} style={{ color: 'var(--expense)' }} />,
};

function CheckRow({ check }: { check: Check }) {
  return (
    <div className="flex gap-3 py-3">
      <span className="shrink-0 mt-0.5">{ICON[check.level]}</span>
      <div className="min-w-0">
        <div className="font-semibold text-sm">{check.label}</div>
        <p className="text-[13px] text-muted leading-relaxed mt-0.5">{check.detail}</p>
        {check.offenders?.length ? (
          <details className="mt-1.5">
            <summary className="text-xs text-[var(--accent)] cursor-pointer font-semibold">
              Show affected records
            </summary>
            <pre className="mt-1.5 text-[11px] text-muted bg-[var(--surface-2)] rounded-lg p-2 overflow-x-auto">
              {check.offenders.join('\n')}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default function DiagnosticsPage() {
  const txns = useApp((s) => s.txns);
  const transfers = useApp((s) => s.transfers);
  const postings = useApp((s) => s.postings);
  const accounts = useApp((s) => s.accounts);
  const categories = useApp((s) => s.categories);
  const holdings = useApp((s) => s.holdings);
  const dividends = useApp((s) => s.dividends);
  const profiles = useApp((s) => s.profiles);
  const importBatches = useApp((s) => s.importBatches);
  const lots = useApp((s) => s.lots);
  const unreadableRecords = useApp((s) => s.unreadableRecords);
  const attachmentIds = useApp((s) => s.attachmentIds);

  const checks = useMemo(
    () => runDiagnostics({ txns, transfers, postings, accounts, categories, holdings, dividends, lots, unreadableRecords, attachmentIds }),
    [txns, transfers, postings, accounts, categories, holdings, dividends, lots, unreadableRecords, attachmentIds],
  );
  const level = worstLevel(checks);

  const counts: [string, number][] = [
    ['Transactions', txns.length],
    ['Transfers', transfers.length],
    ['Postings', postings.length],
    ['Accounts', accounts.length],
    ['Categories', categories.length],
    ['Holdings', holdings.length],
    ['Dividends', dividends.length],
    ['Purchase lots', lots.length],
    ['Profiles', profiles.length],
    ['Imports', importBatches.length],
  ];

  return (
    <div className="space-y-6">
      <PageIntro
        title="Diagnostics"
        subtitle="What this vault knows about itself. Nothing here is sent anywhere."
        action={
          <Chip tone={level === 'error' ? 'danger' : level === 'warn' ? 'warning' : 'success'}>
            {level === 'error' ? 'Needs attention' : level === 'warn' ? 'Minor issues' : 'All clear'}
          </Chip>
        }
      />

      <GlassCard>
        <SectionHeader title="Record counts" />
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 min-[1100px]:grid-cols-5 gap-3">
          {counts.map(([label, n]) => (
            <div key={label} className="rounded-xl border border-[var(--line)] p-3">
              <div className="text-xs text-muted">{label}</div>
              <div className="text-xl font-bold tnum mt-0.5">{n.toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted leading-relaxed">
          These are the records in the <b>active profile</b>. A restored backup whose records
          landed under another profile shows up here as a count of zero while the data is still
          in the vault — switch profiles at the top left to check.
        </p>
      </GlassCard>

      <GlassCard>
        <SectionHeader
          title="Integrity checks"
          action={<Stethoscope size={16} className="text-muted" />}
        />
        <div className="mt-1 divide-y divide-[var(--line)]">
          {checks.map((c) => <CheckRow key={c.id} check={c} />)}
        </div>
      </GlassCard>
    </div>
  );
}
