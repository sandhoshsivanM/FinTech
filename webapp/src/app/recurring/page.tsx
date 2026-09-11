'use client';
import { useState, useMemo, type ElementType } from 'react';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse, Clapperboard,
  Landmark, Wallet, TrendingUp, Shapes, Trash2, RefreshCw, Plus, ChevronDown, ChevronUp,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type TxnType, type Frequency, type RecurringRule } from '@/lib/types';
import { FREQ_LABEL } from '@/domain/recurrence';
import { moneyAccounts } from '@/domain/accountLedger';
import {
  PageIntro, GlassCard, Button, Segmented, Field, Input, Select, EmptyState, StatStrip,
} from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { DateInput } from '@/components/DateInput';
import { formatDate, toInputValue, fromInputValue } from '@/lib/dateFormat';
import { NumberInput } from '@/components/NumberInput';

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

export default function RecurringPage() {
  const categories = useApp((s) => s.categories);
  const recurring = useApp((s) => s.recurring);
  const vaultId = useApp((s) => s.vaultId);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const accounts = useApp((s) => s.accounts);
  const confirm = useConfirm();
  const processRecurring = useApp((s) => s.processRecurring);
  const postRecurringOnce = useApp((s) => s.postRecurringOnce);

  // Run-due state
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Post-one state. The rule being posted, with the date and amount it will be
  // posted at — both editable, because the schedule is a prediction and the
  // posting is a record of what actually happened.
  const [posting, setPosting] = useState<{ rule: RecurringRule; date: string; amount: string } | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<TxnType>('expense');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formMerchant, setFormMerchant] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formFrequency, setFormFrequency] = useState<Frequency>('monthly');
  const [formFirstRun, setFormFirstRun] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const pickable = useMemo(() => moneyAccounts(accounts), [accounts]);

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

    // The figure this screen exists to surface. A ₹649 subscription is
    // invisible at monthly scale and ₹7,788 a year — the annual number is the
    // one that changes what someone does about it.
    const annualOut = monthlyOut.mul(12);

    // The same money as a ratio: how much of what comes in is already spoken
    // for before any decision is made. Null when nothing recurring arrives,
    // because a share of zero income is not zero — it is undefined.
    const committedShare = monthlyIn.gt(0)
      ? monthlyOut.div(monthlyIn).times(100).toNumber()
      : null;

    return { monthlyOut, monthlyIn, dueSoonCount, annualOut, committedShare };
  }, [recurring]);

  function openPost(rule: RecurringRule) {
    setRunMsg(null);
    setPosting({
      rule,
      // Defaults to the scheduled occurrence, so confirming without editing
      // gives exactly what the batch run would have produced for this rule.
      date: toInputValue(rule.nextRun),
      amount: rule.amount,
    });
  }

  async function handlePostOne() {
    if (!posting) return;
    const amt = parseFloat(posting.amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) return;
    // A half-typed date parses to null. Falling back to the scheduled date
    // keeps the post correct rather than dating the entry to the epoch.
    const when = fromInputValue(posting.date) ?? posting.rule.nextRun;
    setPostBusy(true);
    try {
      const ok = await postRecurringOnce(posting.rule.id, { date: when, amount: String(amt) });
      const name = posting.rule.merchant || 'Rule';
      setRunMsg(ok ? `Posted ${name}. Nothing else was run.` : 'Could not post — the rule no longer exists.');
      setPosting(null);
    } finally {
      setPostBusy(false);
    }
  }

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
        accountId: formAccountId || null,
      });
      // Reset form
      setFormAmount('');
      setFormType('expense');
      setFormCategoryId('');
      setFormMerchant('');
      setFormAccountId('');
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
          className="rounded-[var(--radius-panel)] px-4 py-2.5 text-sm font-medium"
          style={{ background: 'var(--income)', color: '#fff' }}
        >
          {runMsg}
        </div>
      )}

      {/* Post one rule. Date and amount default to the schedule and are
          editable, because an obligation that landed late or for a different
          figure did not happen the way the rule predicted. */}
      {posting && (
        <GlassCard>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
              Post {posting.rule.merchant || 'this rule'}
            </h2>
            <span className="text-xs text-muted">
              Scheduled for {formatDate(posting.rule.nextRun)} · nothing else will run
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Date it actually happened">
              <DateInput
                value={posting.date}
                onChange={(date) => setPosting((p) => (p ? { ...p, date } : p))}
              />
            </Field>
            <Field label="Amount">
              <NumberInput
                value={posting.amount}
                onChange={(amount) => setPosting((p) => (p ? { ...p, amount } : p))}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button onClick={() => void handlePostOne()} disabled={postBusy}>
                {postBusy ? 'Posting…' : 'Post'}
              </Button>
              <Button variant="soft" onClick={() => setPosting(null)} disabled={postBusy}>
                Cancel
              </Button>
            </div>
          </div>
          <p className="text-[12.5px] leading-snug text-[var(--ink-soft)] mt-3">
            The next run stays on its schedule — {FREQ_LABEL[posting.rule.frequency].toLowerCase()} from{' '}
            {formatDate(posting.rule.nextRun)} — so posting late once does not move every future occurrence.
          </p>
        </GlassCard>
      )}

      {/* StatStrip — 4-metric summary */}
      {recurring.length > 0 && (
        <StatStrip
          items={[
            {
              // Leads the strip, ahead of the monthly figure it is derived
              // from: the annual number is the one nobody works out for
              // themselves, and it is the point of the screen.
              label: 'Committed a year',
              value: mask(fmt.money(stats.annualOut)),
              sub: `${mask(fmt.money(stats.monthlyOut))} / mo · every month`,
              accent: 'var(--expense)',
            },
            {
              label: 'Monthly in',
              value: mask(fmt.money(stats.monthlyIn)),
              sub: 'recurring income / mo',
              accent: stats.monthlyIn.gt(0) ? 'var(--income)' : undefined,
            },
            {
              label: 'Committed share',
              value: stats.committedShare == null ? '—' : `${stats.committedShare.toFixed(0)}%`,
              sub: stats.committedShare == null
                ? 'add recurring income to compare'
                : 'of recurring income, before any choice',
              accent: stats.committedShare != null && stats.committedShare > 70
                ? 'var(--warn)' : undefined,
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
                <NumberInput
                  placeholder="0.00"
                  value={formAmount}
                  onChange={setFormAmount}
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
              {pickable.length > 0 && (
                <Field label="Account" hint="Which account these land in">
                  <Select value={formAccountId} onChange={(e) => setFormAccountId(e.target.value)}>
                    {pickable.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
              )}
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
                <DateInput value={formFirstRun} onChange={setFormFirstRun} />
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

                {/* Post this one, and only this one. */}
                <button
                  type="button"
                  onClick={() => openPost(rule)}
                  title={`Post ${rule.merchant || cat?.name || 'this'} on its own`}
                  className={clsx(
                    'ml-1 px-2 py-1.5 rounded-[var(--radius-btn)] text-[11.5px] font-semibold whitespace-nowrap transition shrink-0',
                    'border border-line-strong hover:border-[var(--accent)] hover:text-accent',
                    // Always reachable on an overdue rule: that is the one the
                    // user came to the page for, and hiding its action behind a
                    // hover is why the batch button looked like the only way.
                    overdue || dueSoon ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  )}
                >
                  Post now
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(rule.id)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 ml-1 p-1.5 rounded-[var(--radius-card)] text-expense hover:bg-expense/10 transition shrink-0"
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
