'use client';
/**
 * Target vs actual asset allocation.
 *
 * The user's targets are one record per profile (`STORE.allocationTarget`).
 * Everything else is computed from holdings by `targetVsActual`, shared with
 * the Flutter app through domain/allocation.ts.
 *
 * "Add ₹X" only suggests where new money or a SIP should go; "Over by ₹X" is
 * deliberately not "Sell". Nothing on this page moves money.
 */
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Target, Plus, Minus } from 'lucide-react';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { useDarkMode } from '@khazana/screens/lib/useDarkMode';
import { STORE } from '@khazana/domain/types';
import { ASSET_GROUP_META, ASSET_GROUP_ORDER, ASSET_META, portfolioSummary, type AssetGroup } from '@khazana/domain/portfolio';
import {
  DEFAULT_ALLOCATION_TOLERANCE, allocationTargetId, suggestTargets, targetVsActual, validateTargets,
  type AllocationRow, type AllocationTargetRecord, type AllocationTargets,
} from '@khazana/domain/allocation';
import { monthlyTotal, isoOf } from '@khazana/domain/sip';
import { PageIntro, Button, Chip, Field, Select, EmptyState, GlassCard, buttonClass } from '@khazana/ui/ui';
import { InfoNote } from '@khazana/screens/components/import/ImportBits';
import { NumberInput } from '@khazana/screens/components/NumberInput';

const TOLERANCES = [1, 2, 3, 5];

function gapTone(r: AllocationRow): 'warning' | 'accent' | 'success' {
  return r.status === 'under' ? 'warning' : r.status === 'over' ? 'accent' : 'success';
}

function gapText(r: AllocationRow): string {
  const g = r.gapPct;
  return `${g.gt(0) ? '+' : g.lt(0) ? '−' : ''}${g.abs().toString()}%`;
}

export default function AllocationPage() {
  const holdings = useApp((s) => s.holdings);
  const fxRates = useApp((s) => s.fxRates);
  const records = useApp((s) => s.allocationTargets);
  const sipPlans = useApp((s) => s.sipPlans);
  const vaultId = useApp((s) => s.vaultId);
  const profileId = useApp((s) => s.activeProfileId);
  const put = useApp((s) => s.put);
  const fmt = useFmt();
  const dark = useDarkMode();

  const record: AllocationTargetRecord | undefined = records[0];
  const targets = record?.targets ?? {};
  const tolerance = record?.tolerance ?? DEFAULT_ALLOCATION_TOLERANCE;

  const report = useMemo(() => {
    const views = portfolioSummary(holdings, undefined, fxRates).views;
    return targetVsActual(views.map((v) => ({ type: v.holding.assetType, value: v.current })), targets, tolerance);
  }, [holdings, fxRates, targets, tolerance]);

  const [open, setOpen] = useState<Partial<Record<AssetGroup, boolean>>>({});
  const [editing, setEditing] = useState<{ targets: Record<AssetGroup, string>; tolerance: number } | null>(null);

  const sipMonthly = useMemo(() => monthlyTotal(sipPlans, isoOf(new Date())), [sipPlans]);

  const startEdit = () => {
    const base: AllocationTargets = report.hasTargets ? targets : suggestTargets(report);
    const t = Object.fromEntries(ASSET_GROUP_ORDER.map((g) => [g, String(base[g] ?? 0)])) as Record<AssetGroup, string>;
    setEditing({ targets: t, tolerance });
  };

  const draft: AllocationTargets | null = editing
    ? Object.fromEntries(ASSET_GROUP_ORDER.map((g) => [g, Number(editing.targets[g] || 0)])) as AllocationTargets
    : null;
  const draftTotal = draft ? Object.values(draft).reduce<number>((a, b) => a + (b ?? 0), 0) : 0;
  const draftError = draft ? validateTargets(draft) : null;

  const save = async () => {
    if (!editing || !draft || draftError) return;
    // Zero targets are kept out of the record: "no target" and "0%" read the same.
    const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => (v ?? 0) > 0)) as AllocationTargets;
    const rec: AllocationTargetRecord = {
      id: record?.id ?? allocationTargetId(profileId), vaultId, profileId,
      targets: clean, tolerance: editing.tolerance, updatedAt: Date.now(),
    };
    await put(STORE.allocationTarget, rec as unknown as AllocationTargetRecord & Record<string, unknown>);
    setEditing(null);
  };

  const step = (g: AssetGroup, by: number) => {
    if (!editing) return;
    const v = Math.min(100, Math.max(0, Number(editing.targets[g] || 0) + by));
    setEditing({ ...editing, targets: { ...editing.targets, [g]: String(v) } });
  };

  const under = report.rows.filter((r) => r.status === 'under');
  const dot = (g: AssetGroup) => (dark ? ASSET_GROUP_META[g].dark : ASSET_GROUP_META[g].light);

  return (
    <div className="grid gap-6">
      <PageIntro
        title="Allocation"
        subtitle="Target vs actual, and where new money should go"
        action={!editing && (
          <div className="flex flex-wrap gap-2">
            <Link href="/sips" className={buttonClass('ghost')}>SIPs · {fmt.money(sipMonthly)}/mo</Link>
            <Button onClick={startEdit}><Target size={16} />{report.hasTargets ? 'Edit targets' : 'Set targets'}</Button>
          </div>
        )}
      />

      {editing && draft && (
        <GlassCard>
          <h2 className="fs-16 font-medium">Edit targets</h2>
          <p className="text-xs text-muted mt-0.5">Whole percents. They must add up to 100%.</p>
          <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-4">
            {ASSET_GROUP_ORDER.map((g) => (
              <Field key={g} label={ASSET_GROUP_META[g].label}>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={`Lower ${ASSET_GROUP_META[g].label}`} className={buttonClass('ghost')} onClick={() => step(g, -1)}><Minus size={14} /></button>
                  <NumberInput
                    aria-label={`${ASSET_GROUP_META[g].label} target %`}
                    decimals={0}
                    value={editing.targets[g]}
                    onChange={(v) => setEditing({ ...editing, targets: { ...editing.targets, [g]: v } })}
                    className="w-20 text-right rounded-[var(--radius-card)] border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <button type="button" aria-label={`Raise ${ASSET_GROUP_META[g].label}`} className={buttonClass('ghost')} onClick={() => step(g, 1)}><Plus size={14} /></button>
                </div>
              </Field>
            ))}
            <Field label="On track within">
              <Select value={String(editing.tolerance)} onChange={(e) => setEditing({ ...editing, tolerance: Number(e.target.value) })}>
                {TOLERANCES.map((t) => <option key={t} value={t}>±{t}%</option>)}
              </Select>
            </Field>
          </div>
          <p role="status" className={`mt-4 text-sm font-medium ${draftError ? 'text-warning' : 'text-success'}`}>
            Total {draftTotal}%{draftError ? ` · ${draftTotal > 100 ? 'remove' : 'add'} ${Math.abs(100 - draftTotal)}%` : ''}
          </p>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => void save()} disabled={!!draftError}>Save targets</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </GlassCard>
      )}

      {report.total.isZero() ? (
        <GlassCard padded={false}>
          <EmptyState
            icon={<Target size={22} />}
            title="No holdings to compare"
            hint="Add your holdings first. Allocation compares what you own with the mix you are aiming for."
            action={<Link href="/holdings" className={buttonClass('primary')}>Go to holdings</Link>}
          />
        </GlassCard>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              {!report.hasTargets ? (
                <InfoNote>
                  <strong>Set your targets to see gaps.</strong> We will start you from today&apos;s mix; change it to the mix you are aiming for.
                </InfoNote>
              ) : under.length > 0 ? (
                <InfoNote>
                  <strong>{under.length} {under.length === 1 ? 'category is' : 'categories are'} under target.</strong>{' '}
                  {under.map((r, i) => `${i ? (i === under.length - 1 ? ' and ' : ', ') : ''}${ASSET_GROUP_META[r.group].label} needs ${fmt.money(r.amount)}`).join('')}.
                  {' '}Point new money and SIPs there first; nothing is sold for you.
                </InfoNote>
              ) : (
                <InfoNote tone="ok"><strong>Every category is on track</strong> (within ±{tolerance}%).</InfoNote>
              )}
            </div>
            <GlassCard>
              <p className="text-xs text-muted">Invested</p>
              <p className="fs-24 font-semibold tabular-nums mt-1">{fmt.money(report.total)}</p>
            </GlassCard>
          </div>

          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm tabular-nums">
                <caption className="text-left px-5 pt-4 pb-2 fs-16 font-medium">Target vs Actual</caption>
                <thead>
                  <tr className="text-xs text-muted text-right">
                    <th scope="col" className="text-left font-medium px-5 py-2">Category</th>
                    <th scope="col" className="font-medium px-3 py-2">Actual</th>
                    <th scope="col" className="font-medium px-3 py-2">Current value</th>
                    <th scope="col" className="font-medium px-3 py-2">Target</th>
                    <th scope="col" className="font-medium px-3 py-2">Target value</th>
                    <th scope="col" className="font-medium px-3 py-2">Gap</th>
                    <th scope="col" className="font-medium px-5 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => {
                    const isOpen = !!open[r.group];
                    const label = ASSET_GROUP_META[r.group].label;
                    return (
                      <Fragment key={r.group}>
                        <tr className="border-t border-line">
                          <th scope="row" className="text-left px-5 py-1.5 font-semibold">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              disabled={r.children.length === 0}
                              onClick={() => setOpen({ ...open, [r.group]: !isOpen })}
                              className="focus-ring inline-flex items-center gap-2.5 min-h-[44px]"
                            >
                              <ChevronRight size={16} className="text-muted transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : undefined }} aria-hidden />
                              <span className="w-3 h-3 rounded-[4px]" style={{ background: dot(r.group) }} aria-hidden />
                              {label}
                            </button>
                          </th>
                          <td className="px-3 py-2 text-right fs-16 font-semibold">{r.actualPct.toString()}%</td>
                          <td className="px-3 py-2 text-right text-ink-soft">{fmt.money(r.value)}</td>
                          <td className="px-3 py-2 text-right">{report.hasTargets ? `${r.targetPct}%` : '—'}</td>
                          <td className="px-3 py-2 text-right text-ink-soft">{report.hasTargets ? fmt.money(r.targetValue) : '—'}</td>
                          <td className="px-3 py-2 text-right">{report.hasTargets ? <Chip tone={gapTone(r)}>{gapText(r)}</Chip> : '—'}</td>
                          <td className={`px-5 py-2 text-right font-semibold ${r.status === 'under' ? 'text-[var(--data-blue)]' : 'text-muted'}`}>
                            {!report.hasTargets ? '—' : r.status === 'under' ? `Add ${fmt.money(r.amount)}` : r.status === 'over' ? `Over by ${fmt.money(r.amount)}` : 'On track'}
                          </td>
                        </tr>
                        {isOpen && r.children.map((c) => (
                          <tr key={c.type} className="bg-[var(--card-2)]">
                            <th scope="row" className="text-left font-normal pl-[68px] pr-5 py-2">
                              {ASSET_META[c.type].label} <span className="text-muted">{c.count}</span>
                            </th>
                            <td className="px-3 py-2 text-right font-medium">{c.actualPct.toString()}%</td>
                            <td className="px-3 py-2 text-right text-ink-soft">{fmt.money(c.value)}</td>
                            <td colSpan={4} />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-xs text-muted">
            Gaps within ±{tolerance}% read On track. &ldquo;Add&rdquo; suggests where new money or a SIP should go; Khazana never buys or sells for you.
          </p>
        </>
      )}
    </div>
  );
}
