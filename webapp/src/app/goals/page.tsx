'use client';
import { useState, useMemo } from 'react';
import { Target, Trash2, Plus, PiggyBank, Home, Car, Plane, GraduationCap, Pencil } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type GoalType } from '@/lib/types';
import {
  PageIntro, GlassCard, SectionHeader, EmptyState,
  Button, Field, Input, Select, Ring, StatStrip,
} from '@/components/ui';

// ---- Goal type config ----
const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'emergency_fund', label: 'Emergency Fund' },
  { value: 'house', label: 'House' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'education', label: 'Education' },
  { value: 'custom', label: 'Custom' },
];

const GOAL_ICON_MAP: Record<GoalType, React.ReactNode> = {
  emergency_fund: <PiggyBank size={18} />,
  house: <Home size={18} />,
  vehicle: <Car size={18} />,
  vacation: <Plane size={18} />,
  education: <GraduationCap size={18} />,
  custom: <Target size={18} />,
};

const GOAL_COLOR_MAP: Record<GoalType, string> = {
  emergency_fund: 'var(--income)',
  house: 'var(--accent)',
  vehicle: 'var(--violet)',
  vacation: 'var(--warn)',
  education: 'var(--accent-deep)',
  custom: 'var(--muted)',
};

function goalLabel(type: GoalType): string {
  return GOAL_TYPES.find((g) => g.value === type)?.label ?? type;
}

// Months between now and a future epoch
function monthsUntil(epochMs: number): number {
  const now = new Date();
  const target = new Date(epochMs);
  const diff =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(0, diff);
}

// Format epoch ms as YYYY-MM-DD for <input type="date">
function epochToDateInput(epochMs: number): string {
  const d = new Date(epochMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function GoalsPage() {
  const goals = useApp((s) => s.goals);
  const ghost = useApp((s) => s.ghost);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);

  const fmt = useFmt();

  // Per-goal contribution state: goalId -> input string
  const [contributeAmounts, setContributeAmounts] = useState<Record<string, string>>({});

  async function handleContribute(goalId: string) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const amt = parseFloat(contributeAmounts[goalId] ?? '');
    if (isNaN(amt) || amt <= 0) return;
    await put(STORE.goal, {
      ...goal,
      currentAmount: D(goal.currentAmount).plus(D(amt)).toString(),
      vaultId,
    });
    setContributeAmounts((prev) => ({ ...prev, [goalId]: '' }));
  }

  async function deleteGoal(id: string) {
    if (!window.confirm('Delete this goal?')) return;
    await del(STORE.goal, id);
  }

  // Add / Edit form state
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState<GoalType>('custom');
  const [addTarget, setAddTarget] = useState('');
  const [addCurrent, setAddCurrent] = useState('0');
  const [addDate, setAddDate] = useState('');

  function resetForm() {
    setAddName('');
    setAddType('custom');
    setAddTarget('');
    setAddCurrent('0');
    setAddDate('');
    setEditingId(null);
    setShowAdd(false);
  }

  function startEdit(goalId: string) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    setEditingId(goalId);
    setAddName(goal.name);
    setAddType(goal.goalType);
    setAddTarget(D(goal.targetAmount).toString());
    setAddCurrent(D(goal.currentAmount).toString());
    setAddDate(goal.targetDate ? epochToDateInput(goal.targetDate) : '');
    setShowAdd(true);
  }

  // Derived totals across goals (for StatStrip)
  const totalTarget = useMemo(
    () => goals.reduce((s, g) => s.plus(D(g.targetAmount)), ZERO),
    [goals],
  );
  const totalCurrent = useMemo(
    () => goals.reduce((s, g) => s.plus(D(g.currentAmount)), ZERO),
    [goals],
  );
  const overallPct = useMemo(() => {
    if (totalTarget.isZero()) return 0;
    return Math.min(100, Math.round(totalCurrent.div(totalTarget).toNumber() * 100));
  }, [totalTarget, totalCurrent]);
  const completedCount = useMemo(
    () => goals.filter((g) => D(g.currentAmount).gte(D(g.targetAmount))).length,
    [goals],
  );

  const mask = (s: string) => (ghost ? '••••••' : s);

  async function handleSaveGoal() {
    const target = parseFloat(addTarget);
    if (!addName.trim() || isNaN(target) || target <= 0) return;
    const current = parseFloat(addCurrent);
    const targetDate = addDate ? new Date(addDate).getTime() : null;

    await put(STORE.goal, {
      id: editingId ?? uid(),
      vaultId,
      name: addName.trim(),
      goalType: addType,
      targetAmount: D(target).toString(),
      currentAmount: D(isNaN(current) ? 0 : current).toString(),
      targetDate: targetDate ?? undefined,
    });
    resetForm();
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Goals"
        subtitle={`${goals.length} goal${goals.length !== 1 ? 's' : ''} tracked`}
        action={
          <Button variant="primary" onClick={() => { setEditingId(null); setShowAdd(true); }}>
            <Plus size={16} /> Add Goal
          </Button>
        }
      />

      {/* StatStrip — 4-metric summary */}
      {goals.length > 0 && (
        <StatStrip
          items={[
            {
              label: 'Total saved',
              value: mask(fmt.money(totalCurrent)),
              sub: 'across all goals',
              accent: 'var(--income)',
            },
            {
              label: 'Total target',
              value: mask(fmt.money(totalTarget)),
              sub: `${goals.length} goal${goals.length !== 1 ? 's' : ''}`,
            },
            {
              label: 'Overall progress',
              value: `${overallPct}%`,
              sub: totalTarget.isZero() ? 'no target set' : `${mask(fmt.money(totalTarget.minus(totalCurrent)))} to go`,
              accent: overallPct >= 100 ? 'var(--income)' : overallPct >= 50 ? 'var(--accent)' : undefined,
            },
            {
              label: 'Completed',
              value: String(completedCount),
              sub: completedCount === goals.length && goals.length > 0 ? 'all done!' : `of ${goals.length}`,
              accent: completedCount > 0 ? 'var(--income)' : undefined,
            },
          ]}
        />
      )}

      {/* Goals grid */}
      {goals.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<Target size={22} />}
            title="No goals yet"
            hint="Create savings goals to stay motivated — emergency fund, house, vacation, and more."
            action={
              <Button variant="soft" onClick={() => { setEditingId(null); setShowAdd(true); }}>
                <Plus size={15} /> Add Goal
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const current = D(goal.currentAmount);
            const target = D(goal.targetAmount);
            const fraction = target.isZero() ? 0 : Math.min(1, current.div(target).toNumber());
            const pct = Math.round(fraction * 100);
            const remaining = target.minus(current);
            const color = GOAL_COLOR_MAP[goal.goalType];
            const achieved = remaining.lte(0);

            // On-track calculation
            let trackHint = '';
            if (goal.targetDate) {
              const months = monthsUntil(goal.targetDate);
              if (months <= 0) {
                trackHint = remaining.gt(0) ? 'Target date reached' : 'Goal achieved!';
              } else if (remaining.gt(0)) {
                const needed = remaining.div(months);
                trackHint = `Save ${mask(fmt.money(needed))}/mo to reach goal`;
              } else {
                trackHint = 'Goal achieved!';
              }
            } else if (achieved) {
              trackHint = 'Goal achieved!';
            } else {
              trackHint = `${mask(fmt.money(remaining))} to go`;
            }

            const contribVal = contributeAmounts[goal.id] ?? '';

            return (
              <GlassCard key={goal.id} className="flex flex-col gap-4">
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
                      style={{ background: color + '22', color }}
                    >
                      {GOAL_ICON_MAP[goal.goalType]}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm leading-tight truncate">{goal.name}</div>
                      <div className="text-[11px] text-muted">{goalLabel(goal.goalType)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      className="p-1.5 rounded-[10px] text-ink-soft hover:bg-black/5 transition"
                      aria-label="Edit goal"
                      onClick={() => startEdit(goal.id)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-[10px] text-expense hover:bg-expense/10 transition"
                      aria-label="Delete goal"
                      onClick={() => deleteGoal(goal.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Ring + amounts */}
                <div className="flex items-center gap-4">
                  <Ring fraction={fraction} size={80} stroke={8} color={color}>
                    <span className="text-sm font-extrabold" style={{ color }}>{pct}%</span>
                  </Ring>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted">Saved</div>
                    <div className="font-extrabold text-base tnum leading-tight">{mask(fmt.money(current))}</div>
                    <div className="text-xs text-muted mt-1">Target</div>
                    <div className="font-semibold text-sm tnum text-ink-soft">{mask(fmt.money(target))}</div>
                  </div>
                </div>

                {/* Target date */}
                {goal.targetDate && (
                  <div className="text-xs text-muted">
                    Target date:{' '}
                    <span className="text-ink-soft font-medium">
                      {new Date(goal.targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                )}

                {/* Track hint pill */}
                <div
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-[10px] truncate"
                  style={{ background: color + '18', color }}
                >
                  {trackHint}
                </div>

                {/* Contribute inline — hidden when goal achieved */}
                {!achieved && (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Add amount…"
                      className="flex-1 text-sm"
                      value={contribVal}
                      onChange={(e) =>
                        setContributeAmounts((prev) => ({ ...prev, [goal.id]: e.target.value }))
                      }
                    />
                    <Button
                      variant="soft"
                      disabled={!contribVal || parseFloat(contribVal) <= 0}
                      onClick={() => handleContribute(goal.id)}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add / Edit goal form */}
      {showAdd && (
        <GlassCard>
          <SectionHeader title={editingId ? 'Edit Goal' : 'New Goal'} />
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Goal Name">
                <Input
                  type="text"
                  placeholder="e.g. Emergency Fund"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </Field>
              <Field label="Goal Type">
                <Select value={addType} onChange={(e) => setAddType(e.target.value as GoalType)}>
                  {GOAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Target Amount">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 100000"
                  value={addTarget}
                  onChange={(e) => setAddTarget(e.target.value)}
                />
              </Field>
              <Field label="Current Amount" hint="What you've already saved">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={addCurrent}
                  onChange={(e) => setAddCurrent(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Target Date" hint="Optional — helps compute monthly savings needed">
              <Input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
              />
            </Field>
            <div className="flex gap-3">
              <Button
                variant="primary"
                disabled={!addName.trim() || !addTarget}
                onClick={handleSaveGoal}
              >
                <Plus size={15} /> {editingId ? 'Update Goal' : 'Save Goal'}
              </Button>
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
