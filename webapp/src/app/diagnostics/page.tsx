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
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Stethoscope, XCircle } from 'lucide-react';
import { useApp } from '@/lib/store';
import { runDiagnostics, worstLevel, type Check } from '@khazana/domain/diagnostics';
import { GlassCard, PageIntro, SectionHeader, Chip } from '@khazana/ui/ui';

const ICON = {
  ok: <CheckCircle2 size={17} />,
  warn: <AlertTriangle size={17} />,
  error: <XCircle size={17} />,
};
const TONE = {
  ok: { c: 'var(--data-green-ink)', chip: 'success', word: 'OK' },
  warn: { c: 'var(--warn)', chip: 'warning', word: 'Check' },
  error: { c: 'var(--expense)', chip: 'danger', word: 'Error' },
} as const;

/**
 * Where each failing check is actually resolved.
 *
 * A screen that describes a problem and stops leaves the reader to work out
 * which of twenty-eight routes fixes it. Keyed by the check's stable `id`, so a
 * reworded `detail` cannot break the link — and deliberately partial: a check
 * with no user-side fix (the ledger repairs itself on next open; a decryption
 * failure needs a backup, not a screen) gets no button rather than a
 * misleading one.
 */
const FIX: Record<string, { href: string; label: string }> = {
  'lot-reconciliation': { href: '/import', label: 'Import real lots' },
  'holding-prices': { href: '/holdings', label: 'Update prices' },
  'holding-dates': { href: '/holdings', label: 'Set purchase dates' },
  'fixed-income-rates': { href: '/holdings', label: 'Add rates' },
  'txn-categories': { href: '/transactions', label: 'Recategorise' },
  'posting-accounts': { href: '/accounts', label: 'Review accounts' },
  'attachment-links': { href: '/transactions', label: 'Review entries' },
  'fx-rates': { href: '/settings', label: 'Set FX rates' },
  'fx-current': { href: '/settings', label: 'Refresh FX rates' },
  'money-values': { href: '/transactions', label: 'Review amounts' },
};

function CheckRow({ check }: { check: Check }) {
  // Only when something is actually wrong. Offering "Import real lots" beside a
  // green tick would invite work that does not need doing.
  const fix = check.level === 'ok' ? undefined : FIX[check.id];
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className="shrink-0 grid place-items-center w-9 h-9 rounded-full"
        style={{ color: TONE[check.level].c, background: `color-mix(in srgb, ${TONE[check.level].c} 12%, transparent)` }}
      >
        {ICON[check.level]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[14px] flex-1 min-w-0">{check.label}</span>
          <Chip tone={TONE[check.level].chip}>{TONE[check.level].word}</Chip>
        </div>
        <p className="text-[13px] text-muted leading-relaxed mt-0.5">{check.detail}</p>
        {fix && (
          <Link
            href={fix.href}
            className="focus-ring btn-soft mt-2 inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-semibold text-ink"
          >
            {fix.label}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        )}
        {check.offenders?.length ? (
          <details className="mt-1.5">
            <summary className="text-xs text-[var(--accent)] cursor-pointer font-semibold">
              Show affected records
            </summary>
            <pre className="mt-1.5 text-[11px] text-muted bg-[var(--surface-2)] rounded-[var(--radius-btn)] p-2 overflow-x-auto">
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
  const fxRates = useApp((s) => s.fxRates);

  const checks = useMemo(
    () => runDiagnostics({ txns, transfers, postings, accounts, categories, holdings, dividends, lots, unreadableRecords, attachmentIds, fxRates }),
    [txns, transfers, postings, accounts, categories, holdings, dividends, lots, unreadableRecords, attachmentIds, fxRates],
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
        <SectionHeader title="Record counts" info="diagnostics.recordCounts" />
        <div className="tray p-2 mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {counts.map(([label, n]) => (
            <div key={label} className="inset p-3">
              <div className="text-xs text-muted">{label}</div>
              <div className="text-xl font-light tnum mt-0.5">{n.toLocaleString('en-IN')}</div>
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
          info="diagnostics.integrityChecks"
          action={<Stethoscope size={16} className="text-muted" />}
        />
        <div className="mt-1 divide-y divide-[var(--line)]">
          {checks.map((c) => <CheckRow key={c.id} check={c} />)}
        </div>
      </GlassCard>
    </div>
  );
}
