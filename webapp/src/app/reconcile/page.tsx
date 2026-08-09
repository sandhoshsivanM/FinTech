'use client';
/**
 * Tick the book against a bank statement.
 *
 * Replaces exporting to a spreadsheet and comparing two columns by eye. The
 * ledger already knows what every entry did to every account; all this adds is
 * a mark for "the bank has processed this" and the arithmetic that turns the
 * two into a single difference figure.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, Scale } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { STORE, type Transfer, type Txn } from '@/lib/types';
import { moneyAccounts } from '@/domain/accountLedger';
import { explainDifference, reconcile } from '@/domain/reconcile';
import { formatDate, todayInputValue, fromInputValue } from '@/lib/dateFormat';
import { DateInput } from '@/components/DateInput';
import { NumberInput } from '@/components/NumberInput';
import {
  GlassCard, PageIntro, SectionHeader, Field, Select, EmptyState, Chip,
} from '@/components/ui';

export default function ReconcilePage() {
  const txns = useApp((s) => s.txns);
  const transfers = useApp((s) => s.transfers);
  const postings = useApp((s) => s.postings);
  const accounts = useApp((s) => s.accounts);
  const categories = useApp((s) => s.categories);
  const put = useApp((s) => s.put);
  const fmt = useFmt();

  const money = useMemo(() => moneyAccounts(accounts), [accounts]);
  const [accountId, setAccountId] = useState('');
  const [asOfValue, setAsOf] = useState(todayInputValue);
  const [statement, setStatement] = useState('');

  const account = money.find((a) => a.id === accountId) ?? money[0];
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const result = useMemo(() => {
    if (!account) return null;
    return reconcile({
      account, txns, transfers, postings,
      // A cleared date field means "no upper bound", not "today": reading the
      // clock during render is impure, and silently capping at today would
      // hide future-dated entries the user cleared deliberately.
      asOf: fromInputValue(asOfValue) ?? Number.MAX_SAFE_INTEGER,
      statementBalance: statement.trim() ? D(statement) : null,
      describe: (e) => ('merchant' in e
        ? (e.merchant || e.note || catName.get(e.categoryId) || 'Transaction')
        : (e.note || 'Transfer')),
    });
  }, [account, txns, transfers, postings, asOfValue, statement, catName]);

  const suggestions = result ? explainDifference(result) : [];

  const toggle = async (id: string, kind: 'txn' | 'transfer', cleared: boolean) => {
    const store = kind === 'txn' ? STORE.txn : STORE.transfer;
    const rec = kind === 'txn'
      ? txns.find((t) => t.id === id)
      : transfers.find((t) => t.id === id);
    if (!rec) return;
    await put(store, { ...rec, cleared } as unknown as (Txn | Transfer) & { id: string } & Record<string, unknown>);
  };

  if (money.length === 0) {
    return (
      <div className="space-y-6">
        <PageIntro title="Reconcile" subtitle="Match your book against a bank statement" />
        <GlassCard>
          <EmptyState
            icon={<Scale size={22} />}
            title="No bank or cash accounts yet"
            hint="Add an account, then come back to tick its entries off against a statement."
          />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reconcile"
        subtitle="Match your book against a bank statement"
        action={result?.reconciled
          ? <Chip tone="success"><CheckCircle2 size={11} /> Reconciled</Chip>
          : undefined}
      />

      <GlassCard>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Account">
            <Select value={account?.id ?? ''} onChange={(e) => setAccountId(e.target.value)}>
              {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Statement date" hint="Entries up to and including this day">
            <DateInput value={asOfValue} onChange={setAsOf} />
          </Field>
          <Field label="Statement closing balance" hint="The figure your bank shows">
            <NumberInput value={statement} onChange={setStatement} allowNegative placeholder="109920.00" />
          </Field>
        </div>
      </GlassCard>

      {result && (
        <>
          <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-4">
            <Tile label="Opening balance" value={fmt.money(result.opening)} />
            <Tile label="Cleared balance" value={fmt.money(result.clearedBalance)}
              hint={`${result.clearedCount} entr${result.clearedCount === 1 ? 'y' : 'ies'} ticked`} />
            <Tile label="Book balance" value={fmt.money(result.bookBalance)}
              hint="Everything recorded" />
            <Tile
              label="Difference"
              value={result.difference == null ? '—' : fmt.money(result.difference)}
              hint={result.difference == null
                ? 'Enter the statement balance'
                : result.reconciled ? 'Book and bank agree' : 'Bank minus cleared'}
              color={result.difference == null ? undefined
                : result.reconciled ? 'var(--income)' : 'var(--warn)'}
            />
          </div>

          {suggestions.length > 0 && (
            <GlassCard>
              <SectionHeader title="This would explain the difference" />
              <p className="mt-1 text-xs text-muted">
                {suggestions.length === 1 ? 'This entry matches' : 'Each of these matches'} the gap exactly.
                Tick {suggestions.length === 1 ? 'it' : 'one'} if your bank has processed it.
              </p>
              <div className="mt-3 space-y-1.5">
                {suggestions.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-sm rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2">
                    <span className="text-muted tnum">{formatDate(e.date)}</span>
                    <span className="flex-1 min-w-0 truncate">{e.description}</span>
                    <span className="tnum font-semibold">{fmt.money(e.delta)}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard padded={false}>
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <SectionHeader
                title="Entries"
                action={<span className="text-xs text-muted">{result.unclearedCount} not yet cleared</span>}
              />
            </div>
            {result.entries.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted">
                No entries touch this account on or before that date.
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {result.entries.map((e) => (
                  <label key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm cursor-pointer hover:bg-[var(--surface-2)]">
                    <input
                      type="checkbox"
                      checked={e.cleared}
                      onChange={(ev) => void toggle(e.id, e.kind, ev.target.checked)}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    <span className="text-muted tnum w-[92px] shrink-0">{formatDate(e.date)}</span>
                    <span className="flex-1 min-w-0 truncate">{e.description}</span>
                    <span
                      className="tnum font-semibold"
                      style={{ color: e.delta.gte(0) ? 'var(--income)' : 'var(--expense)' }}
                    >
                      {fmt.money(e.delta)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <GlassCard className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="text-xl font-extrabold tnum" style={color ? { color } : undefined}>{value}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </GlassCard>
  );
}
