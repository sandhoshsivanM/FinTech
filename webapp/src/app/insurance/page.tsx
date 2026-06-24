'use client';
import { useState, useMemo } from 'react';
import { Shield, Pencil, Trash2, Plus } from 'lucide-react';
import { useApp, uid } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type Insurance, type InsuranceType } from '@/lib/types';
import {
  PageIntro,
  GlassCard,
  SectionHeader,
  EmptyState,
  Button,
  Field,
  Input,
  Select,
  ProgressBar,
  StatStrip,
} from '@/components/ui';
import {
  coverageGaps,
  annualPremiumTotal,
  LIFE_COVER_MULTIPLE,
} from '@/domain/insurance';

// ---- Insurance type config ----

interface TypeMeta {
  label: string;
  color: string;
}

const TYPE_META: Record<InsuranceType, TypeMeta> = {
  life:    { label: 'Life',    color: 'var(--accent)' },
  health:  { label: 'Health',  color: 'var(--income)' },
  term:    { label: 'Term',    color: 'var(--accent-deep)' },
  vehicle: { label: 'Vehicle', color: 'var(--warn)' },
  home:    { label: 'Home',    color: 'var(--violet)' },
  other:   { label: 'Other',   color: 'var(--muted)' },
};

const TYPE_OPTIONS: { value: InsuranceType; label: string }[] = [
  { value: 'life',    label: 'Life' },
  { value: 'health',  label: 'Health' },
  { value: 'term',    label: 'Term' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'home',    label: 'Home' },
  { value: 'other',   label: 'Other' },
];

// ---- Helpers ----

function epochToDateInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatRenewal(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function daysUntil(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86400000);
}

// ---- Type badge ----

function TypeBadge({ type }: { type: InsuranceType }) {
  const meta = TYPE_META[type];
  return (
    <span
      className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: meta.color + '1a', color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ---- Main page ----

export default function InsurancePage() {
  const insurances = useApp((s) => s.insurances);
  const txns      = useApp((s) => s.txns);
  const vaultId   = useApp((s) => s.vaultId);
  const put        = useApp((s) => s.put);
  const del        = useApp((s) => s.del);
  const ghost      = useApp((s) => s.ghost);

  const fmt = useFmt();
  const mask = (s: string) => (ghost ? '••••••' : s);

  // ---- Form state ----
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [fName, setFName]             = useState('');
  const [fType, setFType]             = useState<InsuranceType>('life');
  const [fProvider, setFProvider]     = useState('');
  const [fCover, setFCover]           = useState('');
  const [fPremium, setFPremium]       = useState('');
  const [fRenewal, setFRenewal]       = useState('');

  function resetForm() {
    setEditingId(null);
    setFName('');
    setFType('life');
    setFProvider('');
    setFCover('');
    setFPremium('');
    setFRenewal('');
    setShowForm(false);
  }

  function startEdit(p: Insurance) {
    setEditingId(p.id);
    setFName(p.name);
    setFType(p.type);
    setFProvider(p.provider ?? '');
    setFCover(p.coverAmount);
    setFPremium(p.premium);
    setFRenewal(epochToDateInput(p.renewalDate));
    setShowForm(true);
  }

  async function savePolicy() {
    const coverAmount = fCover.trim();
    const premium     = fPremium.trim();
    if (!fName.trim() || !coverAmount || !premium) return;
    const renewalDate = fRenewal ? new Date(fRenewal).getTime() : null;
    const policy: Insurance = {
      id:          editingId ?? uid(),
      vaultId,
      name:        fName.trim(),
      type:        fType,
      provider:    fProvider.trim() || null,
      coverAmount: D(coverAmount).toString(),
      premium:     D(premium).toString(),
      renewalDate,
    };
    await put(STORE.insurance, policy as unknown as { id: string } & Record<string, unknown>);
    resetForm();
  }

  async function deletePolicy(id: string, name: string) {
    if (!window.confirm(`Delete policy "${name}"? This cannot be undone.`)) return;
    await del(STORE.insurance, id);
  }

  // ---- Derived data ----

  // Estimate annual income from income-type txns in the last 365 days
  const annualIncome = useMemo(() => {
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    return txns
      .filter((t) => t.type === 'income' && t.date >= cutoff)
      .reduce((s, t) => s.plus(D(t.amount)), ZERO);
  }, [txns]);

  const totalCover = useMemo(
    () => insurances.reduce((s, p) => s.plus(D(p.coverAmount || '0')), ZERO),
    [insurances],
  );

  const annualPremium = useMemo(() => annualPremiumTotal(insurances), [insurances]);

  const gaps = useMemo(
    () => coverageGaps(insurances, annualIncome),
    [insurances, annualIncome],
  );

  const lifeGap = gaps.find((g) => g.kind === 'life');

  const formValid = fName.trim() !== '' && fCover.trim() !== '' && fPremium.trim() !== '';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageIntro
        title="Insurance"
        subtitle="Track your policies, review coverage gaps, and stay on top of renewals."
        action={
          <Button
            variant="primary"
            onClick={() => {
              if (showForm && !editingId) {
                resetForm();
              } else {
                setEditingId(null);
                setFName('');
                setFType('life');
                setFProvider('');
                setFCover('');
                setFPremium('');
                setFRenewal('');
                setShowForm(true);
              }
            }}
          >
            <Plus size={15} />
            {showForm && !editingId ? 'Close' : 'Add Policy'}
          </Button>
        }
      />

      {/* Add / Edit form */}
      {showForm && (
        <GlassCard>
          <SectionHeader title={editingId ? 'Edit Policy' : 'Add Policy'} />
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-1">
            <Field label="Policy Name">
              <Input
                type="text"
                placeholder="e.g. HDFC Click 2 Protect"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
              />
            </Field>
            <Field label="Type">
              <Select value={fType} onChange={(e) => setFType(e.target.value as InsuranceType)}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Provider" hint="Optional">
              <Input
                type="text"
                placeholder="e.g. LIC, Star Health"
                value={fProvider}
                onChange={(e) => setFProvider(e.target.value)}
              />
            </Field>
            <Field label="Cover Amount (INR)">
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 10000000"
                value={fCover}
                onChange={(e) => setFCover(e.target.value)}
              />
            </Field>
            <Field label="Annual Premium (INR)">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 12500"
                value={fPremium}
                onChange={(e) => setFPremium(e.target.value)}
              />
            </Field>
            <Field label="Renewal Date" hint="Optional">
              <Input
                type="date"
                value={fRenewal}
                onChange={(e) => setFRenewal(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-3 mt-5">
            <Button variant="primary" onClick={savePolicy} disabled={!formValid}>
              {editingId ? 'Update Policy' : 'Save Policy'}
            </Button>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </GlassCard>
      )}

      {insurances.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<Shield size={22} />}
            title="No policies yet"
            hint="Add your insurance policies to track coverage, spot gaps, and monitor renewals."
            action={
              <Button variant="primary" onClick={() => setShowForm(true)}>
                <Plus size={15} /> Add Policy
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <>
          {/* Stat strip */}
          <StatStrip
            items={[
              {
                label: 'Total cover',
                value: mask(fmt.money(totalCover)),
                sub: `${insurances.length} polic${insurances.length !== 1 ? 'ies' : 'y'}`,
              },
              {
                label: 'Annual premium',
                value: mask(fmt.money(annualPremium)),
                sub: 'sum of all premiums',
              },
              {
                label: 'Policies',
                value: String(insurances.length),
                sub: 'tracked',
              },
              {
                label: 'Life cover gap',
                value: lifeGap
                  ? lifeGap.gap.gt(0)
                    ? mask(fmt.money(lifeGap.gap))
                    : 'Covered'
                  : '—',
                sub: lifeGap && lifeGap.gap.gt(0)
                  ? `${lifeGap.coveredPct}% of recommended`
                  : lifeGap
                  ? 'guideline met'
                  : undefined,
                accent: lifeGap
                  ? lifeGap.gap.gt(0)
                    ? 'var(--expense)'
                    : 'var(--income)'
                  : undefined,
              },
            ]}
          />

          {/* Coverage gap analysis */}
          <GlassCard>
            <SectionHeader title="Coverage gap analysis" />
            <p className="text-[12px] text-muted mb-4 leading-relaxed">
              Guidelines only — not financial advice. Life cover guideline: {LIFE_COVER_MULTIPLE}× annual income.
              Health cover guideline: ₹5L or 50% of annual income, whichever is higher.
              Consult a certified financial planner for personal advice.
            </p>
            {annualIncome.isZero() && (
              <p className="text-[12px] text-warn mb-4">
                No income transactions found in the last 365 days — gap calculations use zero income as the baseline.
              </p>
            )}
            <div className="space-y-5">
              {gaps.map((g) => {
                const barColor =
                  g.coveredPct >= 100
                    ? 'var(--income)'
                    : g.coveredPct >= 60
                    ? 'var(--warn)'
                    : 'var(--expense)';
                const verdict =
                  g.coveredPct >= 100
                    ? 'Well covered'
                    : `${mask(fmt.money(g.gap))} short of the recommended ${
                        g.kind === 'life'
                          ? `${LIFE_COVER_MULTIPLE}× income guideline`
                          : '₹5L health cover guideline'
                      }`;

                return (
                  <div key={g.kind}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13.5px] font-semibold text-ink">{g.label}</span>
                      <span
                        className="text-[11.5px] font-semibold"
                        style={{ color: barColor }}
                      >
                        {g.coveredPct}%
                      </span>
                    </div>
                    <ProgressBar fraction={g.coveredPct / 100} color={barColor} height={6} />
                    <div className="mt-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-muted">
                        Current: {mask(fmt.money(g.current))} · Recommended: {mask(fmt.money(g.recommended))}
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: barColor }}
                      >
                        {verdict}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Policy cards grid */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {insurances.map((p) => {
              const renewingSoon =
                p.renewalDate != null &&
                p.renewalDate > Date.now() &&
                daysUntil(p.renewalDate) <= 30;
              const overdue =
                p.renewalDate != null && p.renewalDate <= Date.now();

              return (
                <GlassCard key={p.id} className="flex flex-col gap-3">
                  {/* Header: badge + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <TypeBadge type={p.type} />
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        className="p-1.5 rounded-[9px] text-ink-soft hover:bg-black/5 transition-colors"
                        aria-label="Edit policy"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-[9px] text-muted hover:text-expense hover:bg-[rgba(192,73,47,0.08)] transition-colors"
                        aria-label="Delete policy"
                        onClick={() => deletePolicy(p.id, p.name)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Name + provider */}
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-ink leading-tight truncate">
                      {p.name}
                    </div>
                    {p.provider && (
                      <div className="text-[12px] text-muted mt-0.5 truncate">{p.provider}</div>
                    )}
                  </div>

                  {/* Cover amount */}
                  <div>
                    <div className="eyebrow">Sum assured</div>
                    <div className="text-[22px] font-bold tracking-tight tnum mt-0.5">
                      {mask(fmt.money(D(p.coverAmount)))}
                    </div>
                  </div>

                  {/* Premium + renewal in a tight row */}
                  <div className="flex items-end justify-between gap-2 pt-1 border-t border-[var(--line)]">
                    <div>
                      <div className="eyebrow">Annual premium</div>
                      <div className="text-[14px] font-semibold tnum mt-0.5">
                        {mask(fmt.money(D(p.premium)))}
                      </div>
                    </div>
                    {p.renewalDate != null && (
                      <div className="text-right">
                        <div className="eyebrow">Renewal</div>
                        <div
                          className="text-[12px] font-semibold mt-0.5"
                          style={{
                            color: overdue
                              ? 'var(--expense)'
                              : renewingSoon
                              ? 'var(--warn)'
                              : 'var(--ink-soft)',
                          }}
                        >
                          {formatRenewal(p.renewalDate)}
                          {renewingSoon && !overdue && (
                            <span className="ml-1 text-[11px]">
                              ({daysUntil(p.renewalDate)}d)
                            </span>
                          )}
                          {overdue && (
                            <span className="ml-1 text-[11px]">(overdue)</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </>
      )}

      {/* Disclaimer */}
      {insurances.length > 0 && (
        <p className="text-xs text-muted px-1">
          Coverage recommendations are rule-of-thumb guidelines and do not constitute financial or insurance advice.
          Consult a licensed advisor for your personal situation.
        </p>
      )}
    </div>
  );
}
