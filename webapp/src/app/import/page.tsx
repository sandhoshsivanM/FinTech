'use client';
/**
 * Bulk import — assets from a broker, income and expenses from a bank.
 *
 * Every path through this screen is parse → preview → confirm. Nothing is
 * written until the user has seen a row count, a skipped count and a sample of
 * what will land, because an import is the one action in the app that can add
 * a thousand records at once and there is no undo for it.
 *
 * The institution grids select guidance, not parsers: column layouts are
 * matched generically, so choosing the wrong bank cannot reject a valid file.
 */
import { useMemo, useState } from 'react';
import { Download, Loader2, Undo2, Upload } from 'lucide-react';
import { useApp, uid, cashAcctId } from '@/lib/store';
import { STORE, type AssetType, type Dividend, type Holding, type Txn, type TxnType } from '@/lib/types';
import { useFmt } from '@/lib/useFmt';
import { readSheet } from '@/lib/sheet';
import { parseHoldingsRows, planImport, importCounts, type CsvHolding } from '@/lib/holdingsCsv';
import {
  parseTxnRows, planTxnImport, guessCategory, dividendKindOf, matchHolding,
  type ParsedTxnRow,
} from '@/lib/txnImport';
import { BROKERS, BANK_GROUPS, findBroker, findBank } from '@/lib/institutions';
import { downloadCsv, holdingsTemplate, transactionsTemplate } from '@/lib/importTemplates';
import { moneyAccounts } from '@/domain/accountLedger';
import {
  GlassCard, PageIntro, SectionHeader, Segmented, Button, Field, Select, Chip,
} from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import {
  InstitutionGrid, ExportGuide, DropZone, ErrorNote, InfoNote, PreviewTable,
} from '@/components/import/ImportBits';
import { formatDate } from '@/lib/dateFormat';

type TopTab = 'assets' | 'money';
type AssetSource = 'broker' | 'standard';
type MoneySource = 'bank' | 'standard';
type WriteMode = 'append' | 'update';

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'equity_etf', label: 'Stocks & Equity' },
  { value: 'equity_mf', label: 'Equity Funds' },
  { value: 'debt_mf', label: 'Debt Funds' },
  { value: 'gold_etf', label: 'Gold & Silver' },
  { value: 'bond', label: 'Bonds' },
  { value: 'fd', label: 'FD & RD' },
  { value: 'ppf_epf', label: 'EPF / PPF' },
  { value: 'nps', label: 'NPS' },
  { value: 'crypto', label: 'Crypto' },
];

const dateStr = formatDate;

export default function ImportPage() {
  const [tab, setTab] = useState<TopTab>('assets');

  return (
    <div className="space-y-6">
      <PageIntro title="Import" subtitle="Bulk import assets, income & expenses" />

      <Segmented
        options={[
          { value: 'assets', label: 'Assets' },
          { value: 'money', label: 'Income & Expenses' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'assets' ? <AssetsImport /> : <MoneyImport />}

      <ImportHistory />
    </div>
  );
}

/* ========================================================================== */
/* History                                                                    */
/* ========================================================================== */

/**
 * Every import run, newest first, each reversible.
 *
 * An import is the only action here that writes hundreds of records at once,
 * and until now the only way back was restoring a backup — assuming one
 * existed. Undo removes exactly what a run created.
 */
function ImportHistory() {
  const batches = useApp((s) => s.importBatches);
  const undoImportBatch = useApp((s) => s.undoImportBatch);
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');

  if (batches.length === 0) return null;

  const undo = async (b: (typeof batches)[number]) => {
    const ok = await confirm({
      title: `Undo this import?`,
      message: `Removes the ${b.created.length} record${b.created.length === 1 ? '' : 's'} this run added.`
        + (b.updatedCount > 0
          ? ` The ${b.updatedCount} it updated stay as they are — their previous values were never recorded.`
          : ''),
      confirmLabel: 'Undo import',
      danger: true,
    });
    if (!ok) return;
    setBusy(b.id);
    try { await undoImportBatch(b.id); } finally { setBusy(''); }
  };

  return (
    <GlassCard>
      <SectionHeader title="Import history" action={<span className="text-xs text-muted">{batches.length} run{batches.length === 1 ? '' : 's'}</span>} />
      <div className="mt-3 divide-y divide-[var(--line)]">
        {batches.slice(0, 10).map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{b.filename || 'Untitled file'}</div>
              <div className="text-xs text-muted">
                {formatDate(b.at)} · {b.kind === 'holdings' ? 'Holdings' : 'Transactions'} ·{' '}
                {b.created.length} added{b.updatedCount > 0 && `, ${b.updatedCount} updated`}
              </div>
            </div>
            {b.undone ? (
              <Chip>Undone</Chip>
            ) : (
              <Button variant="ghost" onClick={() => void undo(b)} disabled={busy === b.id}>
                {busy === b.id ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
                Undo
              </Button>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/* ========================================================================== */
/* Assets                                                                     */
/* ========================================================================== */

function AssetsImport() {
  const holdings = useApp((s) => s.holdings);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const recordImportBatch = useApp((s) => s.recordImportBatch);

  const [source, setSource] = useState<AssetSource>('broker');
  const [mode, setMode] = useState<WriteMode>('update');
  const [broker, setBroker] = useState('zerodha');
  const [assetType, setAssetType] = useState<AssetType>('equity_etf');

  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState('');
  const [rows, setRows] = useState<CsvHolding[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  const counts = useMemo(
    () => (rows?.length ? importCounts(rows, holdings) : null),
    [rows, holdings],
  );

  async function onFile(file: File) {
    setBusy(true);
    setError('');
    setDone(null);
    setRows(null);
    setFilename(file.name);
    try {
      const sheet = await readSheet(file);
      if (sheet.error) { setError(sheet.error); return; }
      const res = parseHoldingsRows(sheet.rows, assetType);
      if (res.error) { setError(res.error); setSkipped(res.skipped); return; }
      if (!res.rows.length) {
        setError('No usable rows found. Every row needs a symbol, a quantity and an average cost.');
        setSkipped(res.skipped);
        return;
      }
      setRows(res.rows);
      setSkipped(res.skipped);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!rows?.length) return;
    setBusy(true);
    try {
      // Append mints a fresh id for every row; update reconciles on
      // symbol+exchange. `planImport` already preserves everything a broker
      // export cannot know (purchase date, sector, hand-set asset type).
      const plan = planImport(rows, mode === 'update' ? holdings : [], {
        vaultId, newId: uid, now: Date.now(),
      });
      const existingIds = new Set(holdings.map((h) => h.id));
      const created: { type: string; id: string }[] = [];
      for (const rec of plan.records) {
        if (!existingIds.has(rec.id)) created.push({ type: STORE.holding, id: rec.id });
        await put(STORE.holding, rec as unknown as Holding & { id: string } & Record<string, unknown>);
      }
      // Recorded before the success banner: an import with no way back is the
      // one destructive action in the app.
      await recordImportBatch({
        at: Date.now(), filename, kind: 'holdings',
        created, updatedCount: plan.updated,
      });
      setDone({ created: plan.created, updated: plan.updated });
      setRows(null);
      setFilename('');
    } finally {
      setBusy(false);
    }
  }

  const inst = findBroker(broker);

  return (
    <div className="space-y-4">
      <ModeBanner mode={mode} noun="assets" />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { value: 'broker', label: 'Import from Broker' },
            { value: 'standard', label: 'Standard Import' },
          ]}
          value={source}
          onChange={setSource}
        />
        <Segmented
          options={[
            { value: 'append', label: 'Append' },
            { value: 'update', label: 'Update by Name' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {source === 'broker' ? (
        <>
          <GlassCard>
            <SectionHeader title="Select Broker" />
            <div className="mt-4">
              <InstitutionGrid institutions={BROKERS} selected={broker} onSelect={setBroker} />
            </div>
            <p className="mt-4 text-xs text-muted">
              Columns are detected automatically, so picking the wrong broker still works as long as
              the file has symbol, quantity and average-cost columns.
            </p>
          </GlassCard>
          {inst && <ExportGuide inst={inst} />}
        </>
      ) : (
        <GlassCard>
          <SectionHeader title="Step 1: Download Template" />
          <p className="mt-2 text-sm text-muted">
            Download the CSV template with example entries, fill it in, and upload it below.
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => downloadCsv('khazana-holdings-template.csv', holdingsTemplate())}>
              <Download size={16} /> Download CSV Template
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Works with any asset class: Stocks &amp; Equity, Equity Funds, Gold &amp; Silver, FD &amp; RD, EPF / PPF / NPS, etc.
          </p>
        </GlassCard>
      )}

      <GlassCard>
        <SectionHeader title={source === 'broker' ? 'Upload File' : 'Step 2: Upload File'} />
        <div className="mt-4 max-w-sm">
          <Field label="Asset class" hint="Applied to new rows. Positions you already track keep the class you chose for them.">
            <Select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
              {ASSET_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <DropZone onFile={(f) => void onFile(f)} busy={busy} filename={filename} />
        </div>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        {done && (
          <div className="mt-4">
            <InfoNote tone="ok">
              Imported <b>{done.created}</b> new {done.created === 1 ? 'position' : 'positions'}
              {done.updated > 0 && <> and updated <b>{done.updated}</b></>}. Open Holdings to review.
            </InfoNote>
          </div>
        )}

        {rows?.length ? (
          <div className="mt-4 space-y-3">
            <InfoNote>
              <b>{rows.length}</b> {rows.length === 1 ? 'row' : 'rows'} ready
              {counts && mode === 'update' && <> — {counts.created} new, {counts.updated} matched to existing positions</>}
              {mode === 'append' && <> — all will be added as new positions</>}
              {skipped > 0 && <>. <b>{skipped}</b> skipped for missing symbol, quantity or average cost.</>}
            </InfoNote>

            <PreviewTable
              headers={['Symbol', 'Exch', 'Qty', 'Avg cost', 'Last price']}
              total={rows.length}
              rows={rows.map((r) => [r.symbol, r.exchange, r.quantity, r.avgCost, r.lastPrice || '—'])}
            />

            <div className="flex gap-3">
              <Button onClick={() => void commit()} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Import {rows.length} {rows.length === 1 ? 'row' : 'rows'}
              </Button>
              <Button variant="ghost" onClick={() => { setRows(null); setFilename(''); }}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

/* ========================================================================== */
/* Income & Expenses                                                          */
/* ========================================================================== */

function MoneyImport() {
  const txns = useApp((s) => s.txns);
  const holdings = useApp((s) => s.holdings);
  const accounts = useApp((s) => s.accounts);
  const categories = useApp((s) => s.categories);
  const vaultId = useApp((s) => s.vaultId);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const putMany = useApp((s) => s.putMany);
  const recordImportBatch = useApp((s) => s.recordImportBatch);
  const fmt = useFmt();

  const money = useMemo(() => moneyAccounts(accounts), [accounts]);

  const [source, setSource] = useState<MoneySource>('bank');
  const [bank, setBank] = useState('hdfc');
  const [accountId, setAccountId] = useState('');
  const [defaultKind, setDefaultKind] = useState<TxnType>('expense');

  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState('');
  const [parsed, setParsed] = useState<ParsedTxnRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [detected, setDetected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ added: number; skippedDupes: number } | null>(null);

  const plan = useMemo(
    () => (parsed?.length ? planTxnImport(parsed, txns) : null),
    [parsed, txns],
  );

  const effectiveAccount = accountId || money[0]?.id || cashAcctId(activeProfileId);

  async function onFile(file: File) {
    setBusy(true);
    setError('');
    setDone(null);
    setParsed(null);
    setFilename(file.name);
    try {
      const sheet = await readSheet(file);
      if (sheet.error) { setError(sheet.error); return; }
      const res = parseTxnRows(sheet.rows, defaultKind);
      if (res.error) { setError(res.error); setSkipped(res.skipped); return; }
      if (!res.rows.length) {
        setError('No usable rows found. Every row needs a date and a non-zero amount.');
        setSkipped(res.skipped);
        return;
      }
      setParsed(res.rows);
      setSkipped(res.skipped);
      setDetected(res.columns.filter(Boolean));
    } finally {
      setBusy(false);
    }
  }

  /** Resolves a category name to an existing id, or falls back to 'Other'. */
  function categoryIdFor(row: ParsedTxnRow): string {
    const wanted = row.category || guessCategory(row.description, row.kind);
    const hit = categories.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
    if (hit) return hit.id;
    return categories.find((c) => c.name === 'Other')?.id ?? categories[0]?.id ?? '';
  }

  async function commit() {
    if (!plan?.fresh.length) return;
    setBusy(true);
    try {
      const now = Date.now();
      const created: { type: string; id: string }[] = [];
      // Collected and written as one batch: a row at a time meant one full
      // vault decrypt per row, and a failure partway through left half a
      // statement imported with nothing to undo the rest.
      const batch: { type: string; value: { id: string } & Record<string, unknown> }[] = [];
      for (const r of plan.fresh) {
        if (r.kind === 'transfer') {
          // Named endpoints are matched to existing accounts; an unknown name
          // falls back to the chosen account so the money still lands
          // somewhere visible rather than being dropped.
          const from = money.find((a) => a.name.toLowerCase() === r.fromAccount.toLowerCase());
          const to = money.find((a) => a.name.toLowerCase() === r.toAccount.toLowerCase());
          const transferId = uid();
          created.push({ type: STORE.transfer, id: transferId });
          batch.push({ type: STORE.transfer, value: {
            id: transferId,
            vaultId,
            amount: r.amount,
            fromAccountId: from?.id ?? effectiveAccount,
            toAccountId: to?.id ?? effectiveAccount,
            date: r.date,
            note: r.description || r.notes || null,
            createdAt: now,
          } });
        } else {
          const txnId = uid();
          created.push({ type: STORE.txn, id: txnId });
          batch.push({ type: STORE.txn, value: {
            id: txnId,
            vaultId,
            amount: r.amount,
            type: r.kind,
            categoryId: categoryIdFor(r),
            merchant: r.description || null,
            note: r.notes || null,
            date: r.date,
            createdAt: now,
            accountId: effectiveAccount,
          } satisfies Txn as unknown as Txn & { id: string } & Record<string, unknown> });

          // A dividend credit is two facts: money arrived (the transaction
          // above, which is what moves net worth) and a payout was made on a
          // position (this record, which is what the Dividends screen and the
          // yield figures read). Writing both is not double counting —
          // netWorthTotal sums transactions only and never reads dividends.
          //
          // The dividend record is only written when the narration names a
          // holding the user actually owns, so a payout can never be attached
          // to a position that does not exist.
          const dk = dividendKindOf(r.description, r.kind);
          const symbol = dk ? matchHolding(r.description, holdings) : null;
          if (dk && symbol) {
            const divId = uid();
            created.push({ type: STORE.dividend, id: divId });
            batch.push({ type: STORE.dividend, value: {
              id: divId,
              vaultId,
              symbol,
              kind: dk,
              amount: r.amount,
              perShare: null,
              exDate: null,
              payDate: r.date,
              received: true, // it is in the statement, so the money landed
            } satisfies Dividend as unknown as Dividend & { id: string } & Record<string, unknown> });
          }
        }
      }
      await putMany(batch);
      await recordImportBatch({
        at: now, filename, kind: 'transactions',
        created, updatedCount: 0,
      });
      setDone({ added: plan.fresh.length, skippedDupes: plan.duplicates.length });
      setParsed(null);
      setFilename('');
    } finally {
      setBusy(false);
    }
  }

  const inst = findBank(bank);

  return (
    <div className="space-y-4">
      <Segmented
        options={[
          { value: 'bank', label: 'Import from Bank' },
          { value: 'standard', label: 'Standard Import' },
        ]}
        value={source}
        onChange={setSource}
      />

      {source === 'bank' ? (
        <>
          <GlassCard>
            <SectionHeader title="Select bank" />
            <div className="mt-4 space-y-4">
              {BANK_GROUPS.map((g) => (
                <div key={g.country}>
                  <p className="text-xs font-semibold text-muted mb-2">{g.country}</p>
                  <InstitutionGrid institutions={g.banks} selected={bank} onSelect={setBank} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              The file is auto-detected, so picking the wrong bank still works as long as the format matches.
            </p>
          </GlassCard>
          {inst && <ExportGuide inst={inst} />}
        </>
      ) : (
        <GlassCard>
          <SectionHeader title="Step 1: Download Template" />
          <p className="mt-2 text-sm text-muted">
            Columns: date, description, amount, currency, type, category, from_account, to_account, notes
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => downloadCsv('khazana-transactions-template.csv', transactionsTemplate())}>
              <Download size={16} /> Download CSV Template
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                  <th className="text-left font-semibold px-3 py-2">Column</th>
                  <th className="text-left font-semibold px-3 py-2">What to put</th>
                  <th className="text-left font-semibold px-3 py-2">Example</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {[
                  ['type', 'IN, OUT or TRANSFER per row. INCOME / EXPENSE / CR / DR also accepted. For TRANSFER rows, fill from_account and to_account.', 'IN'],
                  ['date', 'Date of transaction. Day-first is assumed for slash formats.', '2026-02-15 or 15/02/2026'],
                  ['amount', 'Positive number. Negative values are treated as expense.', '3200'],
                  ['category', 'Optional — leave blank to auto-detect from the description.', 'Food'],
                  ['description', 'Merchant or narration. Used for category detection and duplicate matching.', 'Blinkit groceries'],
                ].map(([c, w, e]) => (
                  <tr key={c} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{c}</td>
                    <td className="px-3 py-2 text-muted">{w}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--accent)' }}>{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <SectionHeader title={source === 'bank' ? 'Upload statement' : 'Step 2: Upload File'} />

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <Field label="Import into account" hint="Income and expense rows are assigned here. TRANSFER rows use their own from/to columns.">
            <Select value={effectiveAccount} onChange={(e) => setAccountId(e.target.value)}>
              {money.length === 0 && <option value="">Cash</option>}
              {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="If the file states no direction" hint="Only used for files with a single unsigned amount column and no Dr/Cr indicator.">
            <Select value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as TxnType)}>
              <option value="expense">Treat as Expense</option>
              <option value="income">Treat as Income</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <DropZone onFile={(f) => void onFile(f)} busy={busy} filename={filename} />
        </div>

        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

        {done && (
          <div className="mt-4">
            <InfoNote tone="ok">
              Imported <b>{done.added}</b> {done.added === 1 ? 'transaction' : 'transactions'}
              {done.skippedDupes > 0 && <>; <b>{done.skippedDupes}</b> already existed and {done.skippedDupes === 1 ? 'was' : 'were'} skipped</>}.
              Open Transactions to review.
            </InfoNote>
          </div>
        )}

        {plan && parsed?.length ? (
          <div className="mt-4 space-y-3">
            <InfoNote>
              <b>{plan.fresh.length}</b> new {plan.fresh.length === 1 ? 'transaction' : 'transactions'} ready
              {plan.duplicates.length > 0 && <> — <b>{plan.duplicates.length}</b> already in your book will be skipped</>}
              {skipped > 0 && <>. <b>{skipped}</b> {skipped === 1 ? 'row' : 'rows'} could not be read (no date or no amount).</>}
              {detected.length > 0 && (
                <div className="mt-1.5 text-xs text-muted">Detected columns: {detected.join(' · ')}</div>
              )}
            </InfoNote>

            <PreviewTable
              headers={['Date', 'Description', 'Type', 'Amount', 'Category']}
              total={plan.fresh.length}
              rows={plan.fresh.map((r) => [
                dateStr(r.date),
                <span key="d" className="block max-w-[22rem] truncate">{r.description || '—'}</span>,
                r.kind === 'income' ? 'Income' : r.kind === 'transfer' ? 'Transfer' : 'Expense',
                <span key="a" className="tnum" style={{
                  color: r.kind === 'income' ? 'var(--income)' : r.kind === 'transfer' ? 'var(--muted)' : 'var(--expense)',
                }}>{fmt.money(r.amount)}</span>,
                r.category || guessCategory(r.description, r.kind) || 'Uncategorised',
              ])}
            />

            <div className="flex gap-3">
              <Button onClick={() => void commit()} disabled={busy || plan.fresh.length === 0}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Import {plan.fresh.length} {plan.fresh.length === 1 ? 'transaction' : 'transactions'}
              </Button>
              <Button variant="ghost" onClick={() => { setParsed(null); setFilename(''); }}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

/* ========================================================================== */

function ModeBanner({ mode, noun }: { mode: WriteMode; noun: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3.5 text-sm leading-relaxed">
      {mode === 'update' ? (
        <>
          <b>Update by Name mode:</b> {noun} whose names match existing ones will have their value,
          quantity and price updated. {noun[0].toUpperCase() + noun.slice(1)} not in this file are left
          untouched, and new names are added as fresh entries.
        </>
      ) : (
        <>
          <b>Append mode:</b> every row in the file is added as a new entry, even when the name matches
          something you already track. Use this for a one-off batch; use Update by Name to refresh prices.
        </>
      )}
    </div>
  );
}
