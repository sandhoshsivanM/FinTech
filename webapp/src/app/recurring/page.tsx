'use client';
import { useState, useMemo, type ElementType } from 'react';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse, Clapperboard,
  Landmark, Wallet, TrendingUp, Shapes, Trash2, RefreshCw, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type TxnType, type Frequency } from '@/lib/types';
import { FREQ_LABEL } from '@/domain/recurrence';
import {
  PageIntro, GlassCard, Button, Segmented, Field, Input, Select, EmptyState, StatStrip,
} from '@/components/ui';
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

const TYPE_OPTIONS: { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// Monthly-equivalent multipliers
const MONTHLY_FACTOR: Record<Frequency, number> = {
  daily: 30,
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
};

function formatDate(epoch: number) {
  return new Date(epoch).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function RecurringPage() {
  const categories = useApp((s) => s.categories);
  const recurring = useApp((s) => s.recurring);
  const vaultId = useApp((s) => s.vaultId);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const confirm = useConfirm();
  const processRecurring = useApp((s) => s.processRecurring);

  // Run-due state
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<TxnType>('expense');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formMerchant, setFormMerchant] = useState('');
  const [formFrequency, setFormFrequency] = useState<Frequency>('monthly');
  const [formFirstRun, setFormFirstRun] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const amountNum = parseFloat(formAmount.replace(/,/g, ''));
  const formValid = !isNaN(amountNum) && amountNum > 0 && !!formCategoryId;

  const sorted = useMemo(() => [...recurring].sort((a, b) => a.nextRun - b.nextRun), [recurring]);

  // ---- StatStrip metrics ----
  const stats = useMemo(() => {
    const now = Date.now();
    const sevenDays = now + 7 * 86400000;
    let monthlyOut = ZERO;
    let monthlyIn = ZERO;
    let dueSoonCount = 0;

    for (const r of recurring) {
      const monthly = D(r.amount).mul(MONTHLY_FACTOR[r.frequency]);
      if (r.type === 'income') {
        monthlyIn = monthlyIn.plus(monthly);
      } else {
        monthlyOut = monthlyOut.plus(monthly);
      }
      if (r.nextRun <= sevenDays) dueSoonCount++;
    }

    return { monthlyOut, monthlyIn, dueSoonCount };
  }, [recurring]);

  async function handleRunDue() {
    setRunning(true);
    setRunMsg(null);
    try {
      const n = await processRecurring();
      setRunMsg(n === 0 ? 'No transactions due right now.' : `Posted ${n} transaction${n !== 1 ? 's' : ''}.`);
    } finally {
      setRunning(false);
    }
  }

  async function handleSave() {
    if (!formValid) return;
    setSaving(true);
    try {
      await put(STORE.recurring, {
        id: uid(),
        vaultId,
        amount: String(D(formAmount.replace(/,/g, '')).toFixed(2)),
        type: formType,
        categoryId: formCategoryId,
        merchant: formMerchant.trim() || null,
        frequency: formFrequency,
        nextRun: new Date(formFirstRun).getTime(),
      });
      // Reset form
      setFormAmount('');
      setFormType('expense');
      setFormCategoryId('');
      setFormMerchant('');
      setFormFrequency('monthly');
      setFormFirstRun(new Date().toISOString().slice(0, 10));
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this recurring rule?', confirmLabel: 'Delete', danger: true }))) return;
    await del(STORE.recurring, id);
  }

  const mask = (s: string) => (ghost ? '••••••' : s);

  return (
    <div className="space-y-5">
      <PageIntro
        title="Recurring"
        subtitle="Scheduled bills, subscriptions, and income."
        action={
          <Button
            variant="soft"
            onClick={handleRunDue}
            disabled={running}
          >
            <RefreshCw size={15} className={running ? 'animate-spin' : ''} />
            Run due now
          </Button>
        }
      />

      {/* Run feedback */}
      {runMsg && (
        <div
          className="rounded-[14px] px-4 py-2.5 text-sm font-medium"
          style={{ background: 'var(--income)', color: '#fff' }}
        >
          {runMsg}
        </div>
      )}

      {/* StatStrip — 4-metric summary */}
      {recurring.length > 0 && (
        <StatStrip
          items={[
            {
              label: 'Monthly out',
              value: mask(fmt.money(stats.monthlyOut)),
              sub: 'recurring expenses / mo',
              accent: 'var(--expense)',
            },
            {
              label: 'Monthly in',
              value: mask(fmt.money(stats.monthlyIn)),
              sub: 'recurring income / mo',
              accent: stats.monthlyIn.gt(0) ? 'var(--income)' : undefined,
            },
            {
              label: 'Due in 7 days',
              value: String(stats.dueSoonCount),
              sub: stats.dueSoonCount === 0 ? 'nothing coming up' : `rule${stats.dueSoonCount !== 1 ? 's' : ''} upcoming`,
              accent: stats.dueSoonCount > 0 ? 'var(--warn)' : undefined,
            },
            {
              label: 'Total rules',
              value: String(recurring.length),
              sub: `${recurring.filter((r) => r.type === 'expense').length} expense · ${recurring.filter((r) => r.type === 'income').length} income`,
            },
          ]}
        />
      )}

      {/* Add recurring toggle */}
      <GlassCard>
        <button
          type="button"
          className="w-full flex items-center justify-between text-sm font-semibold text-accent"
          onClick={() => setShowForm((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Plus size={16} /> Add recurring rule
          </span>
          {showForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showForm && (
          <div className="mt-4 space-y-4 border-t border-[var(--glass-border)] pt-4">
            {/* Type toggle */}
            <div className="flex justify-center">
              <Segmented options={TYPE_OPTIONS} value={formType} onChange={setFormType} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Amount">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                />
              </Field>
              <Field label="Merchant (optional)">
                <Input
                  placeholder="e.g. Netflix"
                  value={formMerchant}
                  onChange={(e) => setFormMerchant(e.target.value)}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Frequency">
                <Select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as Frequency)}
                >
                  {FREQ_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="First run date">
                <Input
                  type="date"
                  value={formFirstRun}
                  onChange={(e) => setFormFirstRun(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={!formValid || saving}>
                {saving ? 'Saving…' : 'Save Rule'}
              </Button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Rules list — 2-column grid on lg */}
      {sorted.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<RefreshCw size={22} />}
            title="No recurring rules yet"
            hint="Add your first recurring bill or income source above."
          />
        </GlassCard>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {sorted.map((rule) => {
            const income = rule.type === 'income';
            const cat = categories.find((c) => c.id === rule.categoryId);
            const now = Date.now();
            const overdue = rule.nextRun <= now;
            const dueSoon = !overdue && rule.nextRun <= now + 7 * 86400000;
            const monthlyEq = D(rule.amount).mul(MONTHLY_FACTOR[rule.frequency]);

            return (
              <div
                key={rule.id}
                className="card px-4 py-3.5 flex items-center gap-3 group"
                style={overdue ? { borderColor: 'var(--expense)', borderWidth: 1 } : undefined}
              >
                {/* Icon avatar */}
                <span
                  className="w-10 h-10 rounded-full grid place-items-center shrink-0"
                  style={{
                    background: (income ? 'var(--income)' : 'var(--expense)') + '1a',
                    color: income ? 'var(--income)' : 'var(--expense)',
                  }}
                >
                  <CatIcon name={cat?.icon} size={18} />
                </span>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {rule.merchant || cat?.name || 'Other'}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span
                      className="inline-block whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        background: (income ? 'var(--income)' : 'var(--expense)') + '1a',
                        color: income ? 'var(--income)' : 'var(--expense)',
                      }}
                    >
                      {FREQ_LABEL[rule.frequency]}
                    </span>
                    {overdue ? (
                      <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--expense)' }}>
                        Overdue · {formatDate(rule.nextRun)}
                      </span>
                    ) : dueSoon ? (
                      <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--warn)' }}>
                        Due soon · {formatDate(rule.nextRun)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted whitespace-nowrap">
                        Next · {formatDate(rule.nextRun)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount column */}
                <div className="text-right shrink-0">
                  <div
                    className="font-bold text-sm tnum whitespace-nowrap"
                    style={{ color: income ? 'var(--income)' : 'var(--expense)' }}
                  >
                    {ghost
                      ? (income ? '+' : '-') + '••••••'
                      : fmt.signed(D(rule.amount), income)}
                  </div>
                  <div className="text-[10.5px] text-muted tnum whitespace-nowrap">
                    {ghost ? '••••••' : `~${fmt.money(monthlyEq)}/mo`}
                  </div>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(rule.id)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 ml-1 p-1.5 rounded-[10px] text-expense hover:bg-expense/10 transition shrink-0"
                  aria-label="Delete recurring rule"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
