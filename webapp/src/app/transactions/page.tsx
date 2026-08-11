'use client';
import { useState, useMemo, type ElementType } from 'react';
import Link from 'next/link';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse, Clapperboard,
  Landmark, Wallet, TrendingUp, Shapes, Trash2, Plus, Pencil, Download, ArrowRightLeft,
} from 'lucide-react';
import { useApp, cashAcctId } from '@/lib/store';
import { D } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type Transfer, type Txn, type TxnType } from '@/lib/types';
import { moneyAccounts } from '@/domain/accountLedger';
import { PageIntro, Button, Segmented, Input, Select, EmptyState, GlassCard } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { BudgetStrip } from '@/components/BudgetStrip';
import { formatDate, formatDayMonth, fromInputValue, toInputValue } from '@/lib/dateFormat';
import { PRESETS, PRESET_LABELS, type PresetKey } from '@/domain/period';
import { DateInput } from '@/components/DateInput';

// ---- Icon map ----
const ICON_MAP: Record<string, ElementType> = {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse,
  Clapperboard, Landmark, Wallet, TrendingUp, Shapes,
};

function CatIcon({ name, size = 16 }: { name?: string | null; size?: number }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Shapes;
  return <Icon size={size} />;
}

type Filter = 'all' | TxnType | 'transfer';

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'investment', label: 'Investments' },
  { value: 'transfer', label: 'Transfers' },
];

/**
 * One timeline over two entities.
 *
 * Transfers are stored separately from transactions on purpose — see the
 * `Transfer` type — but they are still things that happened to your money on a
 * date, so hiding them from this list would leave an unexplained gap between
 * two account balances.
 */
type Entry =
  | { kind: 'txn'; id: string; date: number; txn: Txn }
  | { kind: 'transfer'; id: string; date: number; transfer: Transfer };


/**
 * Does a search term look like the money figure on this row?
 *
 * Reconciling against a spreadsheet means searching for the amount — "1500",
 * "1,500", "₹1500.00" are all the same row to a person. The stored value is a
 * Decimal string ("1500.00"), so both forms are compared and separators are
 * dropped. Without this, searching an amount silently matched nothing and the
 * transaction looked missing.
 */
function amountMatches(amount: string, needle: string): boolean {
  const n = needle.replace(/[₹$,\s]/g, '');
  if (!n || !/^[0-9]*\.?[0-9]*$/.test(n)) return false;
  const raw = amount.replace(/[^0-9.]/g, '');
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw.includes(n);
  return raw.includes(n) || String(num).includes(n) || num.toFixed(2).includes(n);
}


/**
 * Ranges people actually reconcile against, resolved from the shared period
 * model so "last 3 months" here means the same days it means on Reports.
 * Computed on click rather than at module load, so a long-lived tab does not
 * go stale across a month boundary.
 */
const DATE_PRESETS: { label: string; key: PresetKey }[] = [
  { label: PRESET_LABELS.thisMonth, key: 'thisMonth' },
  { label: PRESET_LABELS.lastMonth, key: 'lastMonth' },
  { label: PRESET_LABELS.last3Months, key: 'last3Months' },
  { label: PRESET_LABELS.financialYear, key: 'financialYear' },
];

const presetInputRange = (key: PresetKey): [string, string] => {
  const r = PRESETS[key]();
  return [toInputValue(r.start), toInputValue(r.end)];
};

export default function TransactionsPage() {
  const txns = useApp((s) => s.txns);
  const transfers = useApp((s) => s.transfers);
  const categories = useApp((s) => s.categories);
  const accounts = useApp((s) => s.accounts);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const ghost = useApp((s) => s.ghost);
  const del = useApp((s) => s.del);
  const fmt = useFmt();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Statement controls: a date window, and paging so a long book stays usable.
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [accountFilter, setAccountFilter] = useState('all');

  const catById = useMemo(() => {
    const m = new Map<string, { name: string; icon?: string | null }>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const acctById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const pickable = useMemo(() => moneyAccounts(accounts), [accounts]);
  const defaultCash = cashAcctId(activeProfileId);
  const acctName = (id?: string | null) => acctById.get(id ?? defaultCash) ?? 'Cash';

  const PAGE_SIZE = 50;

  /** Categories that actually appear in the book, most used first. */
  const categoriesPresent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of txns) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, n]) => ({ id, name: catById.get(id)?.name ?? 'Uncategorised', count: n }))
      .sort((a, b) => b.count - a.count);
  }, [txns, catById]);
  const fromMs = useMemo(() => fromInputValue(from), [from]);
  const toMs = useMemo(() => {
    const ms = fromInputValue(to);
    return ms == null ? null : ms + 86_399_999; // end of that day
  }, [to]);

  const filtered = useMemo<Entry[]>(() => {
    const q = search.trim().toLowerCase();
    const entries: Entry[] = [
      ...txns.map((t): Entry => ({ kind: 'txn', id: t.id, date: t.date, txn: t })),
      ...transfers.map((t): Entry => ({ kind: 'transfer', id: t.id, date: t.date, transfer: t })),
    ];
    return entries
      .sort((a, b) => b.date - a.date)
      .filter((e) => {
        if (filter !== 'all') {
          if (filter === 'transfer' ? e.kind !== 'transfer' : e.kind !== 'txn' || e.txn.type !== filter) return false;
        }
        if (accountFilter !== 'all') {
          const touches = e.kind === 'txn'
            ? (e.txn.accountId ?? defaultCash) === accountFilter
            : e.transfer.fromAccountId === accountFilter || e.transfer.toAccountId === accountFilter;
          if (!touches) return false;
        }
        // Inclusive on both ends: "01/08 to 31/08" must contain the 31st, which
        // is what anyone reconciling a monthly statement expects.
        // A transfer has no category, so any category filter excludes it —
        // filtering by "Food" and still seeing transfers would be noise.
        if (categoryFilter !== 'all') {
          if (e.kind !== 'txn' || e.txn.categoryId !== categoryFilter) return false;
        }
        if (fromMs != null && e.date < fromMs) return false;
        if (toMs != null && e.date > toMs) return false;
        if (!q) return true;
        // Date in the app's own format, so what the row shows is what you can
        // search — reconciling by date is as common as reconciling by amount.
        const dateText = formatDate(e.date).toLowerCase();
        if (e.kind === 'transfer') {
          return (e.transfer.note ?? '').toLowerCase().includes(q)
            || acctName(e.transfer.fromAccountId).toLowerCase().includes(q)
            || acctName(e.transfer.toAccountId).toLowerCase().includes(q)
            || dateText.includes(q)
            || amountMatches(e.transfer.amount, q);
        }
        const cat = catById.get(e.txn.categoryId);
        return (
          (e.txn.merchant ?? '').toLowerCase().includes(q) ||
          (e.txn.note ?? '').toLowerCase().includes(q) ||
          (cat?.name ?? '').toLowerCase().includes(q) ||
          acctName(e.txn.accountId).toLowerCase().includes(q) ||
          dateText.includes(q) ||
          amountMatches(e.txn.amount, q)
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- acctName is derived from acctById
  }, [txns, transfers, filter, accountFilter, categoryFilter, search, catById, acctById, defaultCash, fromMs, toMs]);

  async function handleDelete(e: Entry) {
    const isTransfer = e.kind === 'transfer';
    if (!(await confirm({
      title: isTransfer ? 'Delete this transfer?' : 'Delete this transaction?',
      message: isTransfer ? 'Both account balances move back.' : undefined,
      confirmLabel: 'Delete', danger: true,
    }))) return;
    await del(isTransfer ? STORE.transfer : STORE.txn, e.id);
  }

  function exportCsv() {
    const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const header = ['Date', 'Type', 'Account', 'Category', 'Merchant', 'Note', 'Amount (INR)'];
    const rows = filtered.map((e) => (e.kind === 'transfer'
      ? [
        new Date(e.date).toISOString().slice(0, 10),
        'transfer',
        `${acctName(e.transfer.fromAccountId)} → ${acctName(e.transfer.toAccountId)}`,
        '', '',
        e.transfer.note ?? '',
        D(e.transfer.amount).toFixed(2),
      ]
      : [
        new Date(e.date).toISOString().slice(0, 10),
        e.txn.type,
        acctName(e.txn.accountId),
        catById.get(e.txn.categoryId)?.name ?? '',
        e.txn.merchant ?? '',
        e.txn.note ?? '',
        D(e.txn.amount).toFixed(2),
      ]).map((v) => esc(String(v))).join(','));
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `khazana-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Group by day
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Filters can shrink the result under a reader sitting on page 9; clamp
  // rather than showing an empty page they cannot navigate out of.
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const dayHeaders: Set<string> = new Set();

  return (
    <div className="space-y-4">
      <PageIntro
        title="Cash Flow"
        subtitle={`${txns.length} transaction${txns.length !== 1 ? 's' : ''}${transfers.length > 0 ? ` · ${transfers.length} transfer${transfers.length !== 1 ? 's' : ''}` : ''}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="soft" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download size={15} /> Export CSV
            </Button>
            <Link href="/add">
              <Button variant="primary">
                <Plus size={16} /> Add
              </Button>
            </Link>
          </div>
        }
      />

      {/* Budget awareness, right where a spend is about to be logged.
          Deliberately no review-queue banner here: browsers cannot read SMS, so
          the web app has no capture queue at all. Rendering a greyed-out one
          would advertise a feature this platform does not have. */}
      <BudgetStrip />

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          className="flex-1"
          placeholder="Search merchant, amount, date, category…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={(f) => { setFilter(f); setPage(0); }} />
        {categoriesPresent.length > 1 && (
          <div className="sm:w-[190px]">
            <Select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
            >
              <option value="all">All categories</option>
              {categoriesPresent.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
              ))}
            </Select>
          </div>
        )}
        {pickable.length > 1 && (
          <div className="sm:w-[190px]">
            <Select aria-label="Filter by account" value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setPage(0); }}>
              <option value="all">All accounts</option>
              {pickable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
        )}
      </div>

      {/* Statement window. Presets cover the ranges people actually reconcile;
          the two fields handle everything else. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[150px]">
          <label className="text-xs font-semibold text-muted" htmlFor="stmt-from">From</label>
          <div className="mt-1"><DateInput id="stmt-from" value={from} onChange={(v) => { setFrom(v); setPage(0); }} max={to || undefined} /></div>
        </div>
        <div className="w-[150px]">
          <label className="text-xs font-semibold text-muted" htmlFor="stmt-to">To</label>
          <div className="mt-1"><DateInput id="stmt-to" value={to} onChange={(v) => { setTo(v); setPage(0); }} min={from || undefined} /></div>
        </div>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { const [f, t] = presetInputRange(p.key); setFrom(f); setTo(t); setPage(0); }}
              className="px-2.5 py-1.5 rounded-[var(--radius-btn)] border border-line text-[12px] font-semibold text-muted hover:text-ink hover:border-[var(--accent)] transition-colors"
            >
              {p.label}
            </button>
          ))}
          {(from || to) && (
            <button
              type="button"
              onClick={() => { setFrom(''); setTo(''); setPage(0); }}
              className="px-2.5 py-1.5 rounded-[var(--radius-btn)] border border-line text-[12px] font-semibold text-[var(--accent)] hover:underline"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<Shapes size={22} />}
            title="No transactions found"
            hint={
              txns.length === 0
                ? 'Load sample data from Settings, or tap Add to create your first transaction.'
                : 'Try a different search or filter.'
            }
            action={
              txns.length === 0 ? (
                <Link href="/add">
                  <Button variant="soft">
                    <Plus size={15} /> Add Transaction
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </GlassCard>
      ) : (
        <GlassCard className="p-0 overflow-hidden">
          <div className="divide-y divide-[var(--glass-border)]">
            {pageRows.map((e) => {
              const isTransfer = e.kind === 'transfer';
              const income = e.kind === 'txn' && e.txn.type === 'income';
              const cat = e.kind === 'txn' ? catById.get(e.txn.categoryId) : undefined;
              const dayKey = new Date(e.date).toDateString();
              const showHeader = !dayHeaders.has(dayKey);
              if (showHeader) dayHeaders.add(dayKey);

              // Transfers are painted neutral, never red or green: the money did
              // not leave or arrive, it moved.
              const tone = isTransfer ? 'var(--ink-soft)' : income ? 'var(--income)' : 'var(--expense)';

              return (
                <div key={e.id}>
                  {showHeader && (
                    <div className="px-5 py-2 bg-[var(--fill)] border-b border-[var(--glass-border)]">
                      <span className="text-xs font-semibold text-ink-soft tracking-wide">
                        {formatDate(e.date)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--fill)] transition group">
                    <span
                      className="w-9 h-9 rounded-full grid place-items-center shrink-0"
                      style={{ background: tone + '1a', color: tone }}
                    >
                      {isTransfer ? <ArrowRightLeft size={16} /> : <CatIcon name={cat?.icon} size={16} />}
                    </span>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {isTransfer
                          ? `${acctName(e.transfer.fromAccountId)} → ${acctName(e.transfer.toAccountId)}`
                          : (e.txn.merchant || cat?.name || 'Other')}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {isTransfer ? 'Transfer' : cat?.name}
                        {!isTransfer && <> · <span className="text-ink-soft">{acctName(e.txn.accountId)}</span></>}
                        {(isTransfer ? e.transfer.note : e.txn.note) ? ` · ${isTransfer ? e.transfer.note : e.txn.note}` : ''}
                        {' · '}
                        {formatDayMonth(e.date)}
                      </div>
                    </div>

                    {/* Amount */}
                    <span
                      className="font-bold text-sm tnum whitespace-nowrap"
                      style={{ color: tone }}
                    >
                      {isTransfer
                        ? (ghost ? '••••••' : fmt.money(D(e.transfer.amount)))
                        : ghost
                          ? (income ? '+' : '-') + '••••••'
                          : fmt.signed(D(e.txn.amount), income)}
                    </span>

                    {/* Edit + Delete */}
                    <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition ml-1">
                      <Link
                        href={`/add?id=${e.id}`}
                        className="p-1.5 rounded-[var(--radius-card)] text-ink-soft hover:text-ink hover:bg-[var(--fill)] transition"
                        aria-label={isTransfer ? 'Edit transfer' : 'Edit transaction'}
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        className="p-1.5 rounded-[var(--radius-card)] text-expense hover:bg-expense/10 transition"
                        aria-label={isTransfer ? 'Delete transfer' : 'Delete transaction'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--glass-border)]">
              <span className="text-xs text-muted tnum">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString('en-IN')}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="soft" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
                  Previous
                </Button>
                <span className="text-xs text-muted tnum">Page {safePage + 1} of {pageCount}</span>
                <Button variant="soft" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
