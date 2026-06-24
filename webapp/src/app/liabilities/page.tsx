'use client';
import { useState, useMemo } from 'react';
import { CreditCard, Landmark, Trash2, Plus, AlertTriangle, Pencil } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type LiabilityKind } from '@/lib/types';
import { emi, simulatePayoff, type PayoffStrategy } from '@/domain/finance';
import {
  PageIntro, GlassCard, SectionHeader, EmptyState,
  Button, Field, Input, Select, Segmented, ProgressBar,
} from '@/components/ui';

// ---- Kind badge ----
function KindBadge({ kind }: { kind: LiabilityKind }) {
  const isCc = kind === 'credit_card';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${isCc ? 'bg-violet/12 text-violet' : 'bg-accent/12 text-accent'}`}
    >
      {isCc ? <CreditCard size={10} /> : <Landmark size={10} />}
      {isCc ? 'Credit Card' : 'Loan'}
    </span>
  );
}

// ---- Format months as "Xy Ym" ----
function formatMonths(m: number): string {
  if (m <= 0) return '0 months';
  const y = Math.floor(m / 12);
  const mo = m % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y}y`);
  if (mo > 0) parts.push(`${mo}m`);
  return parts.join(' ');
}

const KIND_OPTIONS: { value: LiabilityKind; label: string }[] = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'loan', label: 'Loan' },
];

const STRATEGY_OPTIONS: { value: PayoffStrategy; label: string }[] = [
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'snowball', label: 'Snowball' },
];

function SummaryTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 text-[22px] font-bold tracking-tight tnum" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function LiabilitiesPage() {
  const liabilities = useApp((s) => s.liabilities);
  const ghost = useApp((s) => s.ghost);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);

  const fmt = useFmt();
  const mask = (s: string) => (ghost ? '••••••' : s);

  // Delete
  async function deleteLiability(id: string) {
    if (!window.confirm('Delete this liability?')) return;
    await del(STORE.liability, id);
  }

  // Add / Edit form state
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addKind, setAddKind] = useState<LiabilityKind>('loan');
  const [addPrincipal, setAddPrincipal] = useState('');
  const [addApr, setAddApr] = useState('');
  const [addTermMonths, setAddTermMonths] = useState('');
  const [addCreditLimit, setAddCreditLimit] = useState('');

  function resetForm() {
    setAddName('');
    setAddKind('loan');
    setAddPrincipal('');
    setAddApr('');
    setAddTermMonths('');
    setAddCreditLimit('');
    setEditingId(null);
    setShowAdd(false);
  }

  function startEdit(liabilityId: string) {
    const l = liabilities.find((x) => x.id === liabilityId);
    if (!l) return;
    setEditingId(liabilityId);
    setAddName(l.name);
    setAddKind(l.kind);
    setAddPrincipal(D(l.principal).toString());
    setAddApr(D(l.aprPct).toString());
    setAddTermMonths(l.termMonths ? String(l.termMonths) : '');
    setAddCreditLimit(l.creditLimit ? D(l.creditLimit).toString() : '');
    setShowAdd(true);
  }

  async function handleSaveLiability() {
    const principal = parseFloat(addPrincipal);
    const aprPct = parseFloat(addApr);
    if (!addName.trim() || isNaN(principal) || principal <= 0 || isNaN(aprPct) || aprPct < 0) return;

    const termMonths = addKind === 'loan' ? parseInt(addTermMonths, 10) : undefined;
    const creditLimit = addKind === 'credit_card' && addCreditLimit ? parseFloat(addCreditLimit) : undefined;

    await put(STORE.liability, {
      id: editingId ?? uid(),
      vaultId,
      name: addName.trim(),
      kind: addKind,
      principal: D(principal).toString(),
      aprPct: D(aprPct).toString(),
      termMonths: termMonths && !isNaN(termMonths) ? termMonths : undefined,
      creditLimit: creditLimit && !isNaN(creditLimit) ? D(creditLimit).toString() : undefined,
    });

    resetForm();
  }

  // Portfolio-level debt metrics
  const m = useMemo(() => {
    const totalDebt = liabilities.reduce((s, l) => s.plus(D(l.principal)), ZERO);
    const loans = liabilities.filter((l) => l.kind === 'loan');
    const cards = liabilities.filter((l) => l.kind === 'credit_card');
    const monthlyObligation = loans.reduce(
      (s, l) => (l.termMonths && l.termMonths > 0 ? s.plus(emi(D(l.principal), D(l.aprPct), l.termMonths)) : s),
      ZERO,
    );
    const ccBalance = cards.reduce((s, l) => s.plus(D(l.principal)), ZERO);
    const ccLimit = cards.reduce((s, l) => s.plus(D(l.creditLimit ?? '0')), ZERO);
    const utilPct = ccLimit.gt(0) ? Math.round(ccBalance.div(ccLimit).times(100).toNumber()) : null;
    const wAvgApr = totalDebt.gt(0)
      ? liabilities.reduce((s, l) => s + D(l.principal).times(D(l.aprPct)).toNumber(), 0) / totalDebt.toNumber()
      : 0;
    return { totalDebt, monthlyObligation, utilPct, wAvgApr, loans: loans.length, cards: cards.length };
  }, [liabilities]);
  const totalDebt = m.totalDebt;

  // Payoff simulator state
  const [simBudget, setSimBudget] = useState('');
  const [simStrategy, setSimStrategy] = useState<PayoffStrategy>('avalanche');

  const simResult = useMemo(() => {
    const budget = parseFloat(simBudget);
    if (isNaN(budget) || budget <= 0 || liabilities.length === 0) return null;
    return simulatePayoff(liabilities, D(budget), simStrategy);
  }, [liabilities, simBudget, simStrategy]);

  return (
    <div className="space-y-6">
      <PageIntro
        title="Liabilities"
        subtitle={`${liabilities.length} liabilit${liabilities.length !== 1 ? 'ies' : 'y'} tracked`}
        action={
          <Button variant="primary" onClick={() => { setEditingId(null); setShowAdd(true); }}>
            <Plus size={16} /> Add Liability
          </Button>
        }
      />

      {/* Debt summary strip */}
      {liabilities.length > 0 && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[var(--line)]">
            <SummaryTile label="Total outstanding" value={mask(fmt.money(m.totalDebt))} accent="var(--expense)" sub={`${m.loans} loan${m.loans !== 1 ? 's' : ''} · ${m.cards} card${m.cards !== 1 ? 's' : ''}`} />
            <SummaryTile label="Monthly obligation" value={mask(fmt.money(m.monthlyObligation))} sub="Loan EMIs per month" />
            <SummaryTile label="Credit utilization" value={m.utilPct == null ? '—' : `${m.utilPct}%`} accent={m.utilPct != null && m.utilPct > 70 ? 'var(--expense)' : m.utilPct != null && m.utilPct >= 30 ? 'var(--warn)' : 'var(--income)'} sub="Across credit cards" />
            <SummaryTile label="Avg interest rate" value={`${m.wAvgApr.toFixed(1)}%`} sub="Balance-weighted APR" />
          </div>
        </GlassCard>
      )}

      {/* Liability cards */}
      {liabilities.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<CreditCard size={22} />}
            title="No liabilities"
            hint="Track credit cards and loans to see your total debt and plan payoff."
            action={
              <Button variant="soft" onClick={() => { setEditingId(null); setShowAdd(true); }}>
                <Plus size={15} /> Add Liability
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {liabilities.map((l) => {
            const principal = D(l.principal);
            const aprPct = D(l.aprPct);

            const monthlyEmi =
              l.kind === 'loan' && l.termMonths && l.termMonths > 0
                ? emi(principal, aprPct, l.termMonths)
                : null;

            const utilizationFraction =
              l.kind === 'credit_card' && l.creditLimit
                ? Math.min(1, principal.div(D(l.creditLimit)).toNumber())
                : null;

            const utilizationPct =
              utilizationFraction !== null ? Math.round(utilizationFraction * 100) : null;

            return (
              <GlassCard key={l.id} className="flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-9 h-9 rounded-[12px] grid place-items-center"
                      style={{
                        background: l.kind === 'credit_card' ? 'var(--violet)22' : 'var(--accent)22',
                        color: l.kind === 'credit_card' ? 'var(--violet)' : 'var(--accent)',
                      }}
                    >
                      {l.kind === 'credit_card' ? <CreditCard size={17} /> : <Landmark size={17} />}
                    </span>
                    <div>
                      <div className="font-bold text-sm">{l.name}</div>
                      <KindBadge kind={l.kind} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1.5 rounded-[10px] text-ink-soft hover:bg-black/5 transition"
                      aria-label="Edit liability"
                      onClick={() => startEdit(l.id)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-[10px] text-expense hover:bg-expense/10 transition"
                      aria-label="Delete liability"
                      onClick={() => deleteLiability(l.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Principal + APR */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-muted">Balance</div>
                    <div className="font-extrabold text-base tnum" style={{ color: 'var(--expense)' }}>
                      {mask(fmt.money(principal))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">APR</div>
                    <div className="font-bold text-base tnum">{aprPct.toFixed(2)}%</div>
                  </div>
                </div>

                {/* Credit card utilization */}
                {l.kind === 'credit_card' && l.creditLimit && utilizationFraction !== null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted">Utilization</span>
                      <span
                        className="text-xs font-bold tnum"
                        style={{ color: utilizationPct! > 70 ? 'var(--expense)' : utilizationPct! >= 30 ? 'var(--warn)' : 'var(--income)' }}
                      >
                        {utilizationPct}%
                      </span>
                    </div>
                    <ProgressBar fraction={utilizationFraction} />
                    <div className="text-[11px] text-muted mt-1 tnum">
                      Limit: {mask(fmt.money(D(l.creditLimit)))}
                    </div>
                  </div>
                )}

                {/* Loan EMI */}
                {l.kind === 'loan' && monthlyEmi && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Monthly EMI</span>
                    <span className="font-bold tnum">{mask(fmt.money(monthlyEmi))}</span>
                  </div>
                )}

                {l.kind === 'loan' && l.termMonths && (
                  <div className="text-[11px] text-muted">{l.termMonths} month term</div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* Add / Edit liability form */}
      {showAdd && (
        <GlassCard>
          <SectionHeader title={editingId ? 'Edit Liability' : 'New Liability'} />
          <div className="space-y-4">
            <Field label="Name">
              <Input
                type="text"
                placeholder="e.g. HDFC Credit Card"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </Field>
            <Field label="Type">
              <Segmented<LiabilityKind>
                options={KIND_OPTIONS}
                value={addKind}
                onChange={setAddKind}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Outstanding Balance">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 50000"
                  value={addPrincipal}
                  onChange={(e) => setAddPrincipal(e.target.value)}
                />
              </Field>
              <Field label="APR (%)" hint="Annual percentage rate">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 18"
                  value={addApr}
                  onChange={(e) => setAddApr(e.target.value)}
                />
              </Field>
            </div>
            {addKind === 'loan' && (
              <Field label="Term (months)">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 36"
                  value={addTermMonths}
                  onChange={(e) => setAddTermMonths(e.target.value)}
                />
              </Field>
            )}
            {addKind === 'credit_card' && (
              <Field label="Credit Limit" hint="Optional">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 100000"
                  value={addCreditLimit}
                  onChange={(e) => setAddCreditLimit(e.target.value)}
                />
              </Field>
            )}
            <div className="flex gap-3">
              <Button
                variant="primary"
                disabled={!addName.trim() || !addPrincipal || !addApr}
                onClick={handleSaveLiability}
              >
                <Plus size={15} /> {editingId ? 'Update' : 'Save'}
              </Button>
              <Button variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Debt Payoff Simulator */}
      {liabilities.length > 0 && (
        <GlassCard>
          <SectionHeader title="Debt Payoff Simulator" />
          <p className="text-xs text-muted mb-4">
            Calculate how long it takes to pay off all debts given a fixed monthly payment.
          </p>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Monthly Budget">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 10000"
                  value={simBudget}
                  onChange={(e) => setSimBudget(e.target.value)}
                />
              </Field>
              <Field label="Strategy">
                <Segmented<PayoffStrategy>
                  options={STRATEGY_OPTIONS}
                  value={simStrategy}
                  onChange={setSimStrategy}
                />
              </Field>
            </div>

            {simResult && (
              <div className="rounded-[14px] bg-black/[0.03] p-4 space-y-3">
                {!simResult.feasible ? (
                  <div className="flex items-start gap-2 text-expense">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-sm">Budget too low to cover interest</div>
                      <div className="text-xs text-muted mt-0.5">
                        Increase your monthly payment to make progress on this debt.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] text-muted">Payoff Time</div>
                      <div className="font-extrabold text-xl tnum" style={{ color: 'var(--income)' }}>
                        {formatMonths(simResult.months)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">Total Interest</div>
                      <div className="font-extrabold text-xl tnum" style={{ color: 'var(--expense)' }}>
                        {mask(fmt.money(simResult.totalInterest))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-muted pt-1 border-t border-[var(--glass-border)]">
                  <strong>Avalanche</strong>: pays highest-APR first (less interest). <strong>Snowball</strong>: pays smallest balance first (faster wins).
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
