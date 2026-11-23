'use client';
/**
 * SIPs: monthly plans the user pays at their bank or broker and tracks here.
 *
 * Khazana never moves money. A due SIP waits for the user's answer: Mark done
 * records the units at the NAV they confirm, Skipped records nothing. Until
 * they answer, no units appear, so a bounced or paused SIP never shows units
 * the user does not own. Schedule maths lives in domain/sip.ts (shared with
 * Flutter); the records written are built by lib/sipRecord.ts.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Repeat, CalendarClock, Wallet, Check, Pause, Play, Pencil, Trash2 } from 'lucide-react';
import { useApp, useAppApi, uid } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { useConfirm } from '@khazana/screens/components/Confirm';
import { D } from '@khazana/domain/money';
import { STORE, type Holding } from '@khazana/domain/types';
import { ASSET_GROUP_META, ASSET_GROUP_OF } from '@khazana/domain/portfolio';
import { DEFAULT_ALLOCATION_TOLERANCE, targetVsActual } from '@khazana/domain/allocation';
import { portfolioSummary } from '@khazana/domain/portfolio';
import {
  addDays, amountOn, investedThisFy, isoOf, monthlyTotal, monthsToClose, nextDue, pendingDue,
  sipMix, sipMixWarning, SIP_LOOKBACK_DAYS, type IsoDate, type SipInstalment, type SipPlan,
} from '@khazana/domain/sip';
import { PageIntro, Button, Chip, Field, Select, Toggle, EmptyState, GlassCard, buttonClass } from '@khazana/ui/ui';
import { Kpi, KpiRow } from '@khazana/ui/Kpi';
import { InfoNote, ErrorNote } from '@khazana/screens/components/import/ImportBits';
import { NumberInput } from '@khazana/screens/components/NumberInput';
import { DateInput } from '@khazana/screens/components/DateInput';
import { formatDate } from '@khazana/screens/lib/dateFormat';
import { short } from '@khazana/screens/lib/format';
import { markDone, skip, undo, isoToMs } from '@khazana/screens/lib/sipRecord';

const STEP_UPS = [5, 10, 15, 20];
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const ordinal = (n: number) => {
  if (n >= 29) return 'last day';
  const s = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${s}`;
};

const fmtIso = (iso: IsoDate) => formatDate(isoToMs(iso));

interface Draft {
  id: string | null;
  holdingId: string;
  amount: string;
  dayOfMonth: number;
  startDate: IsoDate;
  stepUp: boolean;
  stepUpPct: number;
}

const blankDraft = (holdingId: string): Draft => ({
  id: null, holdingId, amount: '', dayOfMonth: 5, startDate: isoOf(new Date()), stepUp: false, stepUpPct: 10,
});

export default function SipsPage() {
  const plans = useApp((s) => s.sipPlans);
  const instalments = useApp((s) => s.sipInstalments);
  const holdings = useApp((s) => s.holdings);
  const lots = useApp((s) => s.lots);
  const fxRates = useApp((s) => s.fxRates);
  const targetsRec = useApp((s) => s.allocationTargets[0]);
  const vaultId = useApp((s) => s.vaultId);
  const profileId = useApp((s) => s.activeProfileId);
  const put = useApp((s) => s.put);
  const putMany = useApp((s) => s.putMany);
  const del = useApp((s) => s.del);
  const api = useAppApi();
  const confirm = useConfirm();
  const fmt = useFmt();

  const today = isoOf(new Date());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [answers, setAnswers] = useState<Record<string, { amount: string; nav: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const holdingById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  const active = plans.filter((p) => p.active);
  const paused = plans.filter((p) => !p.active);
  const monthly = monthlyTotal(plans, today);
  const fy = investedThisFy(instalments, today);
  const nexts = active.map((p) => nextDue(p, today)).filter((d): d is IsoDate => !!d).sort();

  const targets = targetsRec?.targets ?? {};
  const warning = targetsRec ? sipMixWarning(sipMix(plans, targets, today)) : null;

  const due = active.flatMap((p) => pendingDue(p, instalments, today).map((d) => ({ plan: p, date: d })));
  const answered = instalments
    .filter((i) => i.dueDate >= addDays(today, -SIP_LOOKBACK_DAYS))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const planById = new Map(plans.map((p) => [p.id, p]));

  const keyOf = (p: SipPlan, d: IsoDate) => `${p.id}:${d}`;
  const answerFor = (p: SipPlan, d: IsoDate) =>
    answers[keyOf(p, d)] ?? { amount: amountOn(p, d).toString(), nav: holdingById.get(p.holdingId)?.lastPrice ?? '' };

  const doMarkDone = async (p: SipPlan, d: IsoDate) => {
    setError(null);
    const h = holdingById.get(p.holdingId);
    const a = answerFor(p, d);
    if (!h) return setError(`${p.name} is no longer in your holdings, so its units have nowhere to go. Mark it skipped or edit the SIP.`);
    if (!a.nav || D(a.nav).lte(0)) return setError(`Enter the NAV ${p.name} was bought at on ${fmtIso(d)}.`);
    try {
      const r = markDone({ plan: p, holding: h, lots, dueDate: d, amount: a.amount, nav: a.nav, now: Date.now(), newId: uid });
      await putMany(r.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doSkip = async (p: SipPlan, d: IsoDate) => {
    const inst = skip(p, d, Date.now(), uid());
    await put(STORE.sipInstalment, inst as unknown as SipInstalment & Record<string, unknown>);
  };

  const doUndo = async (inst: SipInstalment) => {
    const plan = planById.get(inst.sipId);
    // Read the freshest holding: an earlier undo may have just rewritten it.
    const h = api.getState().holdings.find((x) => x.id === plan?.holdingId);
    const r = undo(inst, h);
    for (const x of r.deletes.filter((x) => x.type !== STORE.sipInstalment)) await del(x.type, x.id);
    if (r.holding) await put(STORE.holding, r.holding as unknown as Holding & Record<string, unknown>);
    await del(STORE.sipInstalment, inst.id);
  };

  const savePlan = async () => {
    if (!draft) return;
    const h = holdingById.get(draft.holdingId);
    if (!h || !draft.amount || D(draft.amount).lte(0)) return;
    const prev = draft.id ? planById.get(draft.id) : undefined;
    const plan: SipPlan = {
      id: draft.id ?? uid(), vaultId, profileId,
      holdingId: h.id, name: h.name || h.symbol, assetType: h.assetType,
      amount: D(draft.amount).toString(), dayOfMonth: draft.dayOfMonth, startDate: draft.startDate,
      stepUpPct: draft.stepUp ? draft.stepUpPct : 0, remind: prev?.remind ?? true, active: prev?.active ?? true,
      createdAt: prev?.createdAt ?? Date.now(),
    };
    await put(STORE.sipPlan, plan as unknown as SipPlan & Record<string, unknown>);
    setDraft(null);
  };

  const togglePause = async (p: SipPlan) => {
    await put(STORE.sipPlan, { ...p, active: !p.active } as unknown as SipPlan & Record<string, unknown>);
  };

  const remove = async (p: SipPlan) => {
    const ok = await confirm({
      title: `Delete the ${p.name} SIP?`,
      message: 'Units you already recorded stay in your holdings. Only the plan and its reminders go.',
      confirmLabel: 'Delete SIP',
      danger: true,
    });
    if (!ok) return;
    for (const i of instalments.filter((i) => i.sipId === p.id)) await del(STORE.sipInstalment, i.id);
    await del(STORE.sipPlan, p.id);
  };

  const edit = (p: SipPlan) => setDraft({
    id: p.id, holdingId: p.holdingId, amount: p.amount, dayOfMonth: p.dayOfMonth, startDate: p.startDate,
    stepUp: p.stepUpPct > 0, stepUpPct: p.stepUpPct > 0 ? p.stepUpPct : 10,
  });

  // "Helps your allocation": the chosen holding's group gap, closed by this SIP alone.
  const helps = useMemo(() => {
    if (!draft || !targetsRec) return null;
    const h = holdingById.get(draft.holdingId);
    if (!h || !draft.amount || D(draft.amount).lte(0)) return null;
    const views = portfolioSummary(holdings, undefined, fxRates).views;
    const report = targetVsActual(views.map((v) => ({ type: v.holding.assetType, value: v.current })), targets, targetsRec.tolerance ?? DEFAULT_ALLOCATION_TOLERANCE);
    const row = report.rows.find((r) => r.group === ASSET_GROUP_OF[h.assetType]);
    if (!row) return null;
    const label = ASSET_GROUP_META[row.group].label;
    if (row.status === 'under') {
      const months = monthsToClose(row.amount, draft.amount);
      return { tone: 'ok' as const, text: `${label} is ${row.gapPct.abs().toString()}% under target. This SIP closes the gap in about ${months} month${months === 1 ? '' : 's'}.` };
    }
    if (row.status === 'over') return { tone: 'warn' as const, text: `${label} is already ${row.gapPct.toString()}% over target. A SIP here widens the gap.` };
    return null;
  }, [draft, targetsRec, holdingById, holdings, fxRates, targets]);

  return (
    <div className="grid gap-6">
      <PageIntro
        title="SIPs"
        subtitle="Monthly investments you make elsewhere, tracked here"
        action={!draft && holdings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Link href="/allocation" className={buttonClass('ghost')}>Allocation</Link>
            <Button onClick={() => setDraft(blankDraft(holdings[0].id))}><Plus size={16} />Add SIP</Button>
          </div>
        )}
      />

      {draft && (
        <GlassCard>
          <h2 className="fs-16 font-medium">{draft.id ? 'Edit SIP' : 'Add a SIP'}</h2>
          <div className="grid gap-4 mt-4 md:grid-cols-4">
            <Field label="Fund or holding">
              <Select value={draft.holdingId} onChange={(e) => setDraft({ ...draft, holdingId: e.target.value })}>
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>{h.name || h.symbol} ({ASSET_GROUP_META[ASSET_GROUP_OF[h.assetType]].label})</option>
                ))}
              </Select>
            </Field>
            <Field label="Amount each month">
              <NumberInput value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} placeholder="5000" decimals={0} />
            </Field>
            <Field label="SIP date">
              <Select value={String(draft.dayOfMonth)} onChange={(e) => setDraft({ ...draft, dayOfMonth: Number(e.target.value) })}>
                {DAYS.map((d) => <option key={d} value={d}>{ordinal(d)} of month</option>)}
                <option value={31}>Last day of month</option>
              </Select>
            </Field>
            <Field label="Starts">
              <DateInput value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Toggle on={draft.stepUp} onChange={(stepUp) => setDraft({ ...draft, stepUp })} label="Yearly step-up" />
            <span className="text-sm">Yearly step-up <span className="text-muted">· raise the amount every April</span></span>
            {draft.stepUp && (
              <div role="radiogroup" aria-label="Step-up percentage" className="flex gap-2">
                {STEP_UPS.map((p) => (
                  <button
                    key={p} type="button" role="radio" aria-checked={draft.stepUpPct === p}
                    onClick={() => setDraft({ ...draft, stepUpPct: p })}
                    className={buttonClass(draft.stepUpPct === p ? 'primary' : 'ghost')}
                  >{p}%</button>
                ))}
              </div>
            )}
          </div>
          {helps && <div className="mt-4"><InfoNote tone={helps.tone}>{helps.text}</InfoNote></div>}
          <p className="text-xs text-muted mt-4">On each SIP date it shows here as due. Tap Mark done to record the units at that day&apos;s NAV.</p>
          <div className="flex gap-2 mt-4">
            <Button onClick={() => void savePlan()} disabled={!draft.amount || D(draft.amount).lte(0)}>Save SIP</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </GlassCard>
      )}

      {holdings.length === 0 ? (
        <GlassCard padded={false}>
          <EmptyState
            icon={<Repeat size={22} />}
            title="Add the fund first"
            hint="A SIP adds units to a holding. Add the fund under Holdings, then set up its SIP here."
            action={<Link href="/holdings" className={buttonClass('primary')}>Go to holdings</Link>}
          />
        </GlassCard>
      ) : plans.length === 0 && !draft ? (
        <GlassCard padded={false}>
          <EmptyState
            icon={<Repeat size={22} />}
            title="No SIPs yet"
            hint="Track the SIPs you pay at your bank or broker. Khazana reminds you on each date and records the units when you confirm."
            action={<Button onClick={() => setDraft(blankDraft(holdings[0].id))}><Plus size={16} />Add SIP</Button>}
          />
        </GlassCard>
      ) : plans.length > 0 && (
        <>
          <KpiRow cols={4}>
            <Kpi label="Monthly SIPs" numeric={monthly.toNumber()} format={(n) => short(n, fmt.symbol)} icon={Repeat} tone="accent" footer={fmt.money(monthly)} />
            <Kpi label="Active" value={`${active.length} SIP${active.length === 1 ? '' : 's'}`} icon={Play} tone="success" footer={paused.length ? `${paused.length} paused` : undefined} />
            <Kpi label="This financial year" numeric={fy.toNumber()} format={(n) => short(n, fmt.symbol)} icon={Wallet} tone="violet" footer="Recorded with Mark done" />
            <Kpi label="Next" value={nexts[0] ? fmtIso(nexts[0]) : '—'} icon={CalendarClock} tone="warning" />
          </KpiRow>

          {warning && (
            <InfoNote>
              <strong>Your SIPs grow {ASSET_GROUP_META[warning.group].label} faster than its target.</strong>{' '}
              {fmt.money(warning.amount)} of {fmt.money(monthly)} goes there ({warning.sipPct}%). Target is {warning.targetPct}%.
            </InfoNote>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}

          {(due.length > 0 || answered.length > 0) && (
            <section className="card">
              <div className="px-5 py-4 border-b border-line">
                <h2 className="fs-16 font-medium">Due</h2>
                <p className="text-xs text-muted mt-0.5">Nothing is recorded until you answer.</p>
              </div>
              <ul className="divide-y divide-line">
                {due.map(({ plan: p, date: d }) => {
                  const a = answerFor(p, d);
                  const set = (patch: Partial<typeof a>) => setAnswers({ ...answers, [keyOf(p, d)]: { ...a, ...patch } });
                  return (
                    <li key={keyOf(p, d)} className="px-5 py-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-xs text-muted">{ASSET_GROUP_META[ASSET_GROUP_OF[p.assetType]].label} · due {fmtIso(d)}</p>
                        <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
                          <Field label="Amount"><NumberInput aria-label={`Amount for ${p.name} on ${fmtIso(d)}`} value={a.amount} onChange={(amount) => set({ amount })} /></Field>
                          <Field label="NAV"><NumberInput aria-label={`NAV for ${p.name} on ${fmtIso(d)}`} value={a.nav} onChange={(nav) => set({ nav })} decimals={4} /></Field>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => void doSkip(p, d)}>Skipped</Button>
                        <Button onClick={() => void doMarkDone(p, d)}><Check size={16} />Mark done</Button>
                      </div>
                    </li>
                  );
                })}
                {answered.map((i) => {
                  const p = planById.get(i.sipId);
                  return (
                    <li key={i.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p?.name ?? 'Deleted SIP'} <span className="text-muted font-normal">· {fmtIso(i.dueDate)}</span></p>
                        <p className="text-xs text-muted">
                          {i.status === 'done'
                            ? `Recorded: ${i.units} units at ${fmt.money(i.nav ?? '0')}`
                            : 'Skipped this month. Nothing recorded.'}
                        </p>
                      </div>
                      <Chip tone={i.status === 'done' ? 'success' : 'neutral'}>{i.status === 'done' ? 'Done' : 'Skipped'}</Chip>
                      <Button variant="ghost" onClick={() => void doUndo(i)}>Undo</Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="px-5 py-4 border-b border-line"><h2 className="fs-16 font-medium">Your SIPs</h2></div>
            <ul className="divide-y divide-line">
              {[...active, ...paused].map((p) => {
                const n = nextDue(p, today);
                return (
                  <li key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: ASSET_GROUP_META[ASSET_GROUP_OF[p.assetType]].light }} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-muted">
                        {ASSET_GROUP_META[ASSET_GROUP_OF[p.assetType]].label} · {p.active ? `next ${n ? fmtIso(n) : '—'}` : 'paused'} · every month on the {ordinal(p.dayOfMonth)}
                        {p.stepUpPct > 0 ? ` · +${p.stepUpPct}% each April` : ''}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{fmt.money(amountOn(p, today < p.startDate ? p.startDate : today))}</span>
                    <div className="flex gap-1">
                      <button type="button" className={buttonClass('ghost')} aria-label={`Edit ${p.name}`} onClick={() => edit(p)}><Pencil size={15} /></button>
                      <button type="button" className={buttonClass('ghost')} aria-label={`${p.active ? 'Pause' : 'Resume'} ${p.name}`} onClick={() => void togglePause(p)}>
                        {p.active ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button type="button" className={buttonClass('ghost')} aria-label={`Delete ${p.name}`} onClick={() => void remove(p)}><Trash2 size={15} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="text-xs text-muted">
            Nothing is recorded until you tap Mark done, so a bounced or paused SIP never shows units you don&apos;t own.
          </p>
        </>
      )}
    </div>
  );
}
