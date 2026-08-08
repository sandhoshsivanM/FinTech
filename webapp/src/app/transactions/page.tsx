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
import { formatDate, formatDayMonth } from '@/lib/dateFormat';

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
  }, [txns, transfers, filter, accountFilter, search, catById, acctById, defaultCash]);

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
          onChange={(e) => setSearch(e.target.value)}
        />
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        {pickable.length > 1 && (
          <div className="sm:w-[190px]">
            <Select aria-label="Filter by account" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="all">All accounts</option>
              {pickable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
        )}
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
            {filtered.map((e) => {
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
                        className="p-1.5 rounded-[10px] text-ink-soft hover:text-ink hover:bg-[var(--fill)] transition"
                        aria-label={isTransfer ? 'Edit transfer' : 'Edit transaction'}
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(e)}
                        className="p-1.5 rounded-[10px] text-expense hover:bg-expense/10 transition"
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
        </GlassCard>
      )}
    </div>
  );
}
