'use client';
import { useEffect, useState, type ElementType } from 'react';
import { useRouter } from 'next/navigation';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse, Clapperboard,
  Landmark, Wallet, TrendingUp, Shapes, Sparkles, X,
} from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type TxnType } from '@/lib/types';
import { parseQuickAdd } from '@/domain/nlp';
import {
  GlassCard, PageIntro, Button, Segmented, Field, Input, Select,
} from '@/components/ui';

// ---- Icon map: category.icon string → lucide component ----
const ICON_MAP: Record<string, ElementType> = {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse,
  Clapperboard, Landmark, Wallet, TrendingUp, Shapes,
};

function CatIcon({ name, size = 18 }: { name?: string | null; size?: number }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Shapes;
  return <Icon size={size} />;
}

const TYPE_OPTIONS: { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export default function AddTransactionPage() {
  const router = useRouter();
  const categories = useApp((s) => s.categories);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const fmt = useFmt();

  // Form state
  const [type, setType] = useState<TxnType>('expense');
  const [amountRaw, setAmountRaw] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Quick-add state
  const [quickText, setQuickText] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit mode: prefill from ?id= (read off the URL to avoid Suspense constraints)
  const [editId, setEditId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const t = useApp.getState().txns.find((x) => x.id === id);
    if (!t) return;
    setEditId(id);
    setType(t.type);
    setAmountRaw(String(t.amount));
    setCategoryId(t.categoryId);
    setMerchant(t.merchant ?? '');
    setNote(t.note ?? '');
    setDate(new Date(t.date).toISOString().slice(0, 10));
    setCreatedAt(t.createdAt ?? Date.now());
  }, []);

  // Derived
  const amountNum = parseFloat(amountRaw.replace(/,/g, ''));
  const amountValid = !isNaN(amountNum) && amountNum > 0;

  function handleQuickParse() {
    const parsed = parseQuickAdd(quickText, categories.map((c) => c.name));
    if (parsed.amount) setAmountRaw(parsed.amount);
    setType(parsed.type);
    if (parsed.merchant) setMerchant(parsed.merchant);
    if (parsed.note) setNote(parsed.note);
    if (parsed.categoryName) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === parsed.categoryName!.toLowerCase(),
      );
      if (match) setCategoryId(match.id);
    }
  }

  async function handleSave() {
    if (!amountValid) return;
    setSaving(true);
    try {
      await put(STORE.txn, {
        id: editId ?? uid(),
        vaultId,
        amount: String(D(amountRaw.replace(/,/g, '')).toFixed(2)),
        type,
        categoryId,
        merchant: merchant.trim() || null,
        note: note.trim() || null,
        date: new Date(date).getTime(),
        createdAt,
      });
      router.push(editId ? '/transactions' : '/dashboard');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageIntro
        title={editId ? 'Edit Transaction' : 'Add Transaction'}
        action={
          <Button variant="ghost" onClick={() => router.back()}>
            <X size={16} /> Cancel
          </Button>
        }
      />

      {/* Quick-add bar */}
      <GlassCard>
        <p className="text-xs font-semibold text-ink-soft mb-2">Quick add</p>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="e.g. spent 450 on groceries at bigbasket"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickParse()}
          />
          <Button variant="soft" onClick={handleQuickParse} disabled={!quickText.trim()}>
            <Sparkles size={15} /> Parse
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="space-y-5">
        {/* Expense / Income toggle */}
        <div className="flex justify-center">
          <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
        </div>

        {/* Big amount input */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span
              className="text-4xl font-extrabold font-display"
              style={{ color: type === 'income' ? 'var(--income)' : 'var(--expense)' }}
            >
              {fmt.symbol}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              className="text-4xl font-extrabold font-display w-52 bg-transparent outline-none tnum text-center"
              style={{ color: type === 'income' ? 'var(--income)' : 'var(--expense)' }}
              aria-label="Amount"
            />
          </div>
          {amountRaw && !amountValid && (
            <p className="text-xs text-expense">Enter a valid amount</p>
          )}
          <p className="text-[11px] text-muted">Amount is stored in INR</p>
        </div>

        {/* Category grid */}
        <div>
          <p className="text-xs font-semibold text-ink-soft mb-2">Category</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {categories.map((cat) => {
              const selected = categoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className="flex flex-col items-center gap-1 p-2 rounded-[14px] border transition text-xs font-medium"
                  style={{
                    background: selected ? 'var(--accent)' : 'var(--surface-2)',
                    borderColor: selected ? 'var(--accent)' : 'var(--line)',
                    color: selected ? '#fff' : 'var(--ink)',
                    boxShadow: selected ? '0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent)' : undefined,
                  }}
                  aria-pressed={selected}
                >
                  <span
                    className="w-8 h-8 rounded-[10px] grid place-items-center"
                    style={{
                      background: selected ? 'rgba(255,255,255,0.25)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
                      color: selected ? '#fff' : 'var(--accent)',
                    }}
                  >
                    <CatIcon name={cat.icon} size={16} />
                  </span>
                  <span className="truncate w-full text-center leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fields row */}
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Merchant (optional)">
            <Input
              placeholder="e.g. BigBasket"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
          </Field>
          <Field label="Note (optional)">
            <Input
              placeholder="e.g. Weekly groceries"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!amountValid || saving}
          >
            {saving ? 'Saving…' : editId ? 'Update Transaction' : 'Save Transaction'}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
