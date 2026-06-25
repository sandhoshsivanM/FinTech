'use client';
import { useState, useMemo, type ElementType } from 'react';
import Link from 'next/link';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse, Clapperboard,
  Landmark, Wallet, TrendingUp, Shapes, Trash2, Plus, Pencil, Download,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { D } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type TxnType } from '@/lib/types';
import { PageIntro, Button, Segmented, Input, EmptyState, GlassCard } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';

// ---- Icon map ----
const ICON_MAP: Record<string, ElementType> = {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse,
  Clapperboard, Landmark, Wallet, TrendingUp, Shapes,
};

function CatIcon({ name, size = 16 }: { name?: string | null; size?: number }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Shapes;
  return <Icon size={size} />;
}

type Filter = 'all' | TxnType;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

function formatDay(epoch: number) {
  return new Date(epoch).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function isSameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

export default function TransactionsPage() {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const del = useApp((s) => s.del);
  const fmt = useFmt();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const catById = useMemo(() => {
    const m = new Map<string, { name: string; icon?: string | null }>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...txns]
      .sort((a, b) => b.date - a.date)
      .filter((t) => {
        if (filter !== 'all' && t.type !== filter) return false;
        if (!q) return true;
        const cat = catById.get(t.categoryId);
        return (
          (t.merchant ?? '').toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q) ||
          (cat?.name ?? '').toLowerCase().includes(q)
        );
      });
  }, [txns, filter, search, catById]);

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this transaction?', confirmLabel: 'Delete', danger: true }))) return;
    await del(STORE.txn, id);
  }

  function exportCsv() {
    const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const header = ['Date', 'Type', 'Category', 'Merchant', 'Note', 'Amount (INR)'];
    const rows = filtered.map((t) => [
      new Date(t.date).toISOString().slice(0, 10),
      t.type,
      catById.get(t.categoryId)?.name ?? '',
      t.merchant ?? '',
      t.note ?? '',
      D(t.amount).toFixed(2),
    ].map((v) => esc(String(v))).join(','));
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintech-os-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Group by day
  const dayHeaders: Set<string> = new Set();

  return (
    <div className="space-y-4">
      <PageIntro
        title="Cash Flow"
        subtitle={`${txns.length} transaction${txns.length !== 1 ? 's' : ''}`}
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

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          className="flex-1"
          placeholder="Search merchant, category, note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
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
            {filtered.map((t) => {
              const income = t.type === 'income';
              const cat = catById.get(t.categoryId);
              const dayKey = new Date(t.date).toDateString();
              const showHeader = !dayHeaders.has(dayKey);
              if (showHeader) dayHeaders.add(dayKey);

              return (
                <div key={t.id}>
                  {showHeader && (
                    <div className="px-5 py-2 bg-[var(--fill)] border-b border-[var(--glass-border)]">
                      <span className="text-xs font-semibold text-ink-soft tracking-wide">
                        {formatDay(t.date)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--fill)] transition group">
                    {/* Category icon avatar */}
                    <span
                      className="w-9 h-9 rounded-full grid place-items-center shrink-0"
                      style={{
                        background: (income ? 'var(--income)' : 'var(--expense)') + '1a',
                        color: income ? 'var(--income)' : 'var(--expense)',
                      }}
                    >
                      <CatIcon name={cat?.icon} size={16} />
                    </span>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {t.merchant || cat?.name || 'Other'}
                      </div>
                      <div className="text-xs text-muted truncate">
                        {cat?.name}
                        {t.note ? ` · ${t.note}` : ''}
                        {' · '}
                        {new Date(t.date).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short',
                        })}
                      </div>
                    </div>

                    {/* Amount */}
                    <span
                      className="font-bold text-sm tnum whitespace-nowrap"
                      style={{ color: income ? 'var(--income)' : 'var(--expense)' }}
                    >
                      {ghost
                        ? (income ? '+' : '-') + '••••••'
                        : fmt.signed(D(t.amount), income)}
                    </span>

                    {/* Edit + Delete */}
                    <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition ml-1">
                      <Link
                        href={`/add?id=${t.id}`}
                        className="p-1.5 rounded-[10px] text-ink-soft hover:text-ink hover:bg-[var(--fill)] transition"
                        aria-label="Edit transaction"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 rounded-[10px] text-expense hover:bg-expense/10 transition"
                        aria-label="Delete transaction"
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
