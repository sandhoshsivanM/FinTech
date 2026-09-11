'use client';
/**
 * The export control on Reports: one period in, a spreadsheet or a printable
 * document out.
 *
 * Gated on `formattedExports`, which is a Pro feature. The raw CSV dump on the
 * Transactions page stays free and untouched — `pro-gates.json` lists
 * `csvDumpAll` under `alwaysFree` on the principle that nothing which gets a
 * user's own data *out* is ever behind a payment. What Pro buys here is the
 * presentation: statements, roll-ups and a formatted workbook, not access to
 * the records themselves.
 */
import { useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { useApp, APP_VERSION } from '@/lib/store';
import type { DateRange } from '@/domain/period';
import { buildReport, type ReportInput } from '@/lib/reports/model';
import { downloadXlsx } from '@/lib/reports/xlsx';
import { downloadPdf } from '@/lib/reports/pdf';
import { Button } from '@/components/ui';

export function ExportReport({ range }: { range: DateRange }) {
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const txns = useApp((s) => s.txns);
  const transfers = useApp((s) => s.transfers);
  const categories = useApp((s) => s.categories);
  const holdings = useApp((s) => s.holdings);
  const currencyCode = useApp((s) => s.currencyCode);
  const profiles = useApp((s) => s.profiles);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const ghost = useApp((s) => s.ghost);

  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const input = (): ReportInput => ({
    accounts,
    postings,
    txns,
    transfers,
    categories,
    holdings,
    currencyCode,
    profileName: profiles.find((p) => p.id === activeProfileId)?.name ?? 'Self',
    appVersion: APP_VERSION,
  });

  // Every branch reports its own outcome. Saving can be declined at the native
  // dialog or fail outright, and a button that silently does nothing is the
  // exact failure this whole path was rebuilt to remove.
  const run = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind);
    setNote(null);
    // Yield a frame so the busy label paints before the main thread is occupied
    // building the workbook, which is synchronous and slow on a large ledger.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const report = buildReport(input(), range);
      const outcome = kind === 'xlsx'
        ? await downloadXlsx(report)
        : await downloadPdf(report);

      if (outcome.status === 'cancelled') setNote('Cancelled — nothing was saved.');
      else if (outcome.status === 'failed') setNote(`Could not save: ${outcome.message}`);
      else if (outcome.path) setNote(`Saved to ${outcome.path}`);
      else setNote(kind === 'xlsx' ? 'Workbook saved.' : 'PDF saved.');
    } catch (e) {
      setNote(`Could not build the report: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="soft" onClick={() => void run('xlsx')} disabled={busy !== null || ghost}>
          <FileSpreadsheet className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          {busy === 'xlsx' ? 'Building…' : 'Export Excel'}
        </Button>
        <Button variant="soft" onClick={() => void run('pdf')} disabled={busy !== null || ghost}>
          <Printer className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          {busy === 'pdf' ? 'Preparing…' : 'Export PDF'}
        </Button>
      </div>

      {note && (
        <p className="text-[12.5px] leading-snug text-[var(--ink)]" role="status">{note}</p>
      )}

      <p className="text-[12.5px] leading-snug text-[var(--ink-soft)]">
        {ghost
          // Ghost mode hides balances on screen; exporting the very figures it
          // conceals would defeat it, so the control is disabled rather than
          // quietly producing a file full of what the user asked to hide.
          ? 'Turn off ghost mode to export — the report contains the balances it is hiding.'
          : <>Covers <strong>{range.label}</strong>: transactions, expenses by category,
            month by month, cash flow, balance sheet and holdings. Both are real
            files, generated on this device.</>}
      </p>
    </div>
  );
}
