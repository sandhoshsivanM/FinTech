'use client';
import { useState, useMemo } from 'react';
import { PiggyBank, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE } from '@/lib/types';
import {
  spentForCategory, evaluateBudget, budgetRollover, DEFAULT_ALERT_THRESHOLD_PCT,
} from '@/domain/finance';
import { currentMonth } from '@/domain/period';
import { useNow } from '@/lib/useNow';
import {
  PageIntro, GlassCard, SectionHeader, EmptyState,
  Button, Field, Input, Select, ProgressBar, StatStrip,
} from '@/components/ui';
import { useConfirm } from '@/components/Confirm';

// ---- Status pill ----
function StatusPill({ status }: { status: 'ok' | 'warning' | 'over' }) {
  const cfg = {
    ok: { label: 'On track', bg: 'bg-income/12', text: 'text-income' },
    warning: { label: 'Warning', bg: 'bg-warn/12', text: 'text-warn' },
    over: { label: 'Over budget', bg: 'bg-expense/12', text: 'text-expense' },
  }[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ---- Inline edit row ----
interface EditState {
  amountLimit: string;
  alertThresholdPct: string;
}

export default function BudgetPage() {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const budgets = useApp((s) => s.budgets);
  const ghost = useApp((s) => s.ghost);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const confirm = useConfirm();

  const fmt = useFmt();

  // Tied to the clock, not memoised on mount: a tab left open overnight into a
  // new month used to keep showing the old month's window under a "this month"
  // heading.
  // `useNow` reports 0 until its first tick; falling back to the default keeps
  // the prerender on the real current month rather than January 1970.
  const now = useNow(60_000);
  const month = useMemo(() => currentMonth(now || undefined), [now]);

  // Per-budget evaluated progress
  const evaluated = useMemo(() =>
    budgets.map((b) => {
      const spent = spentForCategory(txns, b.categoryId, month);
      const rollover = budgetRollover(b, txns, month);
      return {
        ...evaluateBudget(b, spent, rollover),
        catName: categories.find((c) => c.id === b.categoryId)?.name ?? 'Unknown',
      };
    }),
    [budgets, txns, categories, month],
  );

  // Summary totals. Budgeted counts rollover, so it matches what the per-budget
  // rows are measured against.
  const totalBudgeted = useMemo(() =>
    evaluated.reduce((s, e) => s.plus(e.limit), ZERO),
    [evaluated],
  );
  const totalSpent = useMemo(() =>
    evaluated.reduce((s, e) => s.plus(e.spent), ZERO),
    [evaluated],
  );
  const totalRemaining = totalBudgeted.minus(totalSpent);
  const overallFraction = totalBudgeted.isZero() ? 0 : totalSpent.div(totalBudgeted).toNumber();
  const overBudgetCount = useMemo(() => evaluated.filter((e) => e.status === 'over').length, [evaluated]);

  const mask = (s: string) => (ghost ? '••••••' : s);

  // Editing state
  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ amountLimit: '', alertThresholdPct: '' });

  function startEdit(id: string, amountLimit: string, alertThresholdPct: number) {
    setEditId(id);
    setEditState({ amountLimit, alertThresholdPct: String(alertThresholdPct) });
  }

  async function saveEdit(budget: (typeof budgets)[number]) {
    const limit = parseFloat(editState.amountLimit);
    const pct = parseFloat(editState.alertThresholdPct);
    if (isNaN(limit) || limit <= 0) return;
    await put(STORE.budget, {
      ...budget,
      amountLimit: D(limit).toString(),
      alertThresholdPct: isNaN(pct) ? budget.alertThresholdPct : Math.min(100, Math.max(0, pct)),
      vaultId,
    });
    setEditId(null);
  }

  async function deleteBudget(id: string) {
    if (!(await confirm({ title: 'Delete this budget?', confirmLabel: 'Delete', danger: true }))) return;
    await del(STORE.budget, id);
  }

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState('');
  const [addLimit, setAddLimit] = useState('');
  const [addThreshold, setAddThreshold] = useState(String(DEFAULT_ALERT_THRESHOLD_PCT));
  const [addRollover, setAddRollover] = useState(false);

  // Categories not already budgeted
  const availableCategories = useMemo(() => {
    const budgetedIds = new Set(budgets.map((b) => b.categoryId));
    return categories.filter((c) => !budgetedIds.has(c.id));
  }, [categories, budgets]);

  async function handleAddBudget() {
    const limit = parseFloat(addLimit);
    if (!addCategoryId || isNaN(limit) || limit <= 0) return;
    const pct = parseFloat(addThreshold);
    await put(STORE.budget, {
      id: uid(),
      vaultId,
      categoryId: addCategoryId,
      amountLimit: D(limit).toString(),
      rolloverEnabled: addRollover,
      alertThresholdPct: isNaN(pct) ? DEFAULT_ALERT_THRESHOLD_PCT : Math.min(100, Math.max(1, pct)),
    });
    setAddCategoryId('');
    setAddLimit('');
    setAddThreshold(String(DEFAULT_ALERT_THRESHOLD_PCT));
    setAddRollover(false);
    setShowAdd(false);
  }

  const usedPct = totalBudgeted.isZero()
    ? '—'
    : `${Math.round(overallFraction * 100)}%`;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Budget"
        subtitle={`${budgets.length} budget${budgets.length !== 1 ? 's' : ''} · ${month.label} · Monthly`}
        action={
          <Button variant="primary" onClick={() => { setShowAdd(true); }}>
            <Plus size={16} /> Add Budget
          </Button>
        }
      />

      {/* StatStrip — 4-metric summary */}
      {budgets.length > 0 && (
        <StatStrip
          items={[
            {
              label: 'Budgeted',
              value: mask(fmt.money(totalBudgeted)),
              sub: `${budgets.length} categor${budgets.length !== 1 ? 'ies' : 'y'}`,
            },
            {
              label: 'Spent this month',
              value: mask(fmt.money(totalSpent)),
              sub: `${usedPct} of budget`,
              accent: overallFraction > 1 ? 'var(--expense)' : undefined,
            },
            {
              label: 'Remaining',
              value: mask(fmt.money(totalRemaining.abs())),
              sub: totalRemaining.gte(0) ? 'available' : 'over limit',
              accent: totalRemaining.lt(0) ? 'var(--expense)' : 'var(--income)',
            },
            {
              label: 'Over budget',
              value: String(overBudgetCount),
              sub: overBudgetCount === 0 ? 'all on track' : `categor${overBudgetCount !== 1 ? 'ies' : 'y'} exceeded`,
              accent: overBudgetCount > 0 ? 'var(--expense)' : undefined,
            },
          ]}
        />
      )}

      {/* 50/30/20 guidance card */}
      {budgets.length > 0 && (
        <GlassCard>
          <SectionHeader title="50/30/20 Guidance" />
          <p className="text-xs text-muted mb-3">A simple framework: 50% Needs, 30% Wants, 20% Savings.</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Needs', pct: 50, color: 'var(--accent)' },
              { label: 'Wants', pct: 30, color: 'var(--violet)' },
              { label: 'Savings', pct: 20, color: 'var(--income)' },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 rounded-[14px] bg-[var(--fill)]">
                <div className="text-lg font-extrabold" style={{ color: item.color }}>{item.pct}%</div>
                <div className="text-xs text-ink-soft mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Per-category budgets — 2-col grid on large screens */}
      {budgets.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<PiggyBank size={22} />}
            title="No budgets yet"
            hint="Set spending limits per category to track where your money goes each month."
            action={
              <Button variant="soft" onClick={() => setShowAdd(true)}>
                <Plus size={15} /> Add Budget
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {evaluated.map(({ budget, spent, remaining, fraction, status, catName }) => {
            const isEditing = editId === budget.id;
            return (
              <GlassCard key={budget.id} className="p-0 overflow-hidden">
                <div className="px-5 py-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="font-semibold text-sm">{catName}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Monthly Limit">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={editState.amountLimit}
                            onChange={(e) => setEditState((s) => ({ ...s, amountLimit: e.target.value }))}
                          />
                        </Field>
                        <Field label="Alert at (%)">
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={editState.alertThresholdPct}
                            onChange={(e) => setEditState((s) => ({ ...s, alertThresholdPct: e.target.value }))}
                          />
                        </Field>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="primary" onClick={() => saveEdit(budget)}>
                          <Check size={14} /> Save
                        </Button>
                        <Button variant="ghost" onClick={() => setEditId(null)}>
                          <X size={14} /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Header row: category name + pill + actions */}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-sm truncate">{catName}</span>
                          <StatusPill status={status} />
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            className="p-1.5 rounded-[10px] text-ink-soft hover:bg-black/5 transition"
                            aria-label="Edit budget"
                            onClick={() => startEdit(budget.id, budget.amountLimit, budget.alertThresholdPct)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded-[10px] text-expense hover:bg-expense/10 transition"
                            aria-label="Delete budget"
                            onClick={() => deleteBudget(budget.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <ProgressBar fraction={fraction} />

                      {/* Spent / limit / remaining row */}
                      <div className="flex items-center justify-between mt-2 text-xs tnum">
                        <span className="text-muted">
                          <span style={{ color: 'var(--expense)' }}>{mask(fmt.money(spent))}</span>
                          {' '}spent
                        </span>
                        <span className="text-muted">
                          limit{' '}
                          <span className="text-ink font-semibold">{mask(fmt.money(D(budget.amountLimit)))}</span>
                        </span>
                        <span
                          className="font-semibold whitespace-nowrap"
                          style={{ color: remaining.gte(0) ? 'var(--income)' : 'var(--expense)' }}
                        >
                          {mask(fmt.money(remaining.abs()))}{' '}{remaining.gte(0) ? 'left' : 'over'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add budget form */}
      {showAdd && (
        <GlassCard>
          <SectionHeader title="New Budget" />
          {availableCategories.length === 0 ? (
            <p className="text-sm text-muted py-2">All categories already have a budget.</p>
          ) : (
            <div className="space-y-4">
              <Field label="Category">
                <Select value={addCategoryId} onChange={(e) => setAddCategoryId(e.target.value)}>
                  <option value="">Select category…</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Monthly Limit">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 5000"
                    value={addLimit}
                    onChange={(e) => setAddLimit(e.target.value)}
                  />
                </Field>
                <Field label="Alert threshold (%)" hint="Warn at this share of the limit">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    placeholder="90"
                    value={addThreshold}
                    onChange={(e) => setAddThreshold(e.target.value)}
                  />
                </Field>
              </div>
              {/* Off by default (§4.3): rollover changes what next month's limit
                  means, so it is opted into per category rather than assumed. */}
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={addRollover}
                  onChange={(e) => setAddRollover(e.target.checked)}
                />
                <span>
                  Roll over what is left
                  <span className="block text-xs text-muted">
                    Adds last month&rsquo;s unspent amount to this month&rsquo;s limit. Overspending
                    is never carried forward.
                  </span>
                </span>
              </label>
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  disabled={!addCategoryId || !addLimit}
                  onClick={handleAddBudget}
                >
                  <Plus size={15} /> Save Budget
                </Button>
                <Button variant="ghost" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
