'use client';
/**
 * Alerts.
 *
 * Rules the user sets, stored in the vault. They are evaluated locally against
 * data already on the device — there is no push channel and no background
 * process, so an alert "fires" when you open the app and its condition holds.
 * The page says that plainly rather than implying a notification will arrive.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, Plus, Trash2, CircleCheck } from 'lucide-react';
import { useApp, uid } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { D } from '@khazana/domain/money';
import { ALERT_TYPE_OF, STORE, type Alert, type AlertKind } from '@khazana/domain/types';
import { PageIntro, Button, Chip, Field, Input, Select, EmptyState, GlassCard, Toggle } from '@khazana/ui/ui';
import { Kpi, KpiRow } from '@khazana/ui/Kpi';
import { Stagger, StaggerItem } from '@khazana/ui/motion';
import { useConfirm } from '@khazana/screens/components/Confirm';
import { portfolioSummary } from '@khazana/domain/portfolio';
import { evaluateAlerts, stateOf } from '@khazana/domain/alerts';
import { useNow } from '@khazana/screens/lib/useNow';
import { formatDate } from '@khazana/screens/lib/dateFormat';
import { NumberInput } from '@khazana/screens/components/NumberInput';
import { CardTitle } from '@khazana/ui/Hint';

const KIND_LABEL: Record<AlertKind, string> = {
  price_above: 'Price rises above',
  price_below: 'Price falls below',
  weight_above: 'Weight exceeds',
  budget_over: 'Budget exceeded',
  renewal_due: 'Renewal due within',
};

const sentence = (w: string) => (w ? w.charAt(0) + w.slice(1).toLowerCase() : w);

export default function AlertsPage() {
  const alerts = useApp((s) => s.alerts);
  const holdings = useApp((s) => s.holdings);
  const fxRates = useApp((s) => s.fxRates);
  const budgets = useApp((s) => s.budgets);
  const categories = useApp((s) => s.categories);
  const txns = useApp((s) => s.txns);
  const insurances = useApp((s) => s.insurances);
  const now = useNow(60_000);
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const fmt = useFmt();
  const confirm = useConfirm();
  const [form, setForm] = useState(false);
  const [draft, setDraft] = useState<{ kind: AlertKind; symbol: string; threshold: string }>({ kind: 'price_above', symbol: '', threshold: '' });

  const summary = useMemo(() => portfolioSummary(holdings, undefined, fxRates), [holdings, fxRates]);

  /**
   * One evaluator, shared with the notification bell (§5).
   *
   * This screen used to carry its own implementation and `Shell.tsx` carried a
   * second one that handled fewer kinds — so an alert could be "met" here and
   * absent from the bell. Both now call `evaluateAlerts`.
   */
  const run = useMemo(() => evaluateAlerts({
    alerts, holdings, budgets, categories, txns, insurances, now: now || Date.now(),
  }), [alerts, holdings, budgets, categories, txns, insurances, now]);

  const byId = useMemo(
    () => new Map(run.evaluations.map((e) => [e.alert.id, e])),
    [run],
  );
  const firing = useMemo(
    () => new Set(run.evaluations.filter((e) => e.met).map((e) => e.alert.id)),
    [run],
  );

  /**
   * Persist what the run learned.
   *
   * Evaluation state has to survive the screen, or `lastEvaluatedAt` would
   * reset every time it mounted and could never answer "when was this last
   * checked". Written only when something actually changed.
   */
  useEffect(() => {
    if (!now || run.changed === 0) return;
    void (async () => {
      for (const a of run.updated) {
        const before = alerts.find((x) => x.id === a.id);
        if (!before) continue;
        if (before.state === a.state
          && (before.lastTriggeredAt ?? null) === (a.lastTriggeredAt ?? null)
          && (before.dataAsOf ?? null) === (a.dataAsOf ?? null)
          && before.lastEvaluatedAt != null) continue;
        await put(STORE.alert, a as unknown as Alert & { id: string } & Record<string, unknown>);
      }
    })();
    // `run` is derived from `alerts`; depending on it alone avoids a write loop.
  }, [run.changed, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!draft.threshold) return;
    const needsSymbol = draft.kind !== 'budget_over' && draft.kind !== 'renewal_due';
    if (needsSymbol && !draft.symbol.trim()) return;
    const symbol = needsSymbol ? draft.symbol.trim().toUpperCase() : null;
    await put(STORE.alert, {
      id: uid(),
      kind: draft.kind,
      symbol,
      label: `${symbol ? `${symbol}: ` : ''}${KIND_LABEL[draft.kind]} ${draft.threshold}${draft.kind === 'weight_above' ? '%' : ''}`,
      threshold: draft.threshold,
      active: true,
      createdAt: Date.now(),
      state: 'ARMED',
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
      dataAsOf: null,
    } as unknown as Alert & { id: string } & Record<string, unknown>);
    setDraft({ kind: 'price_above', symbol: '', threshold: '' });
    setForm(false);
  };

  const toggle = async (a: Alert) => {
    await put(STORE.alert, { ...a, active: !a.active } as unknown as Alert & { id: string } & Record<string, unknown>);
  };
  const remove = async (a: Alert) => {
    if (await confirm({ title: 'Delete this alert?', message: a.label, confirmLabel: 'Delete', danger: true })) await del(STORE.alert, a.id);
  };

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro title="Alerts" subtitle="Conditions checked against your own data, on this device"
          action={<Button onClick={() => setForm((f) => !f)}><Plus size={16} />New alert</Button>} />
      </StaggerItem>

      <StaggerItem>
        <div className="card p-4 flex items-start gap-3">
          <span className="w-8 h-8 shrink-0 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--data-blue)_14%,transparent)] text-[var(--data-blue)]"><Bell size={16} /></span>
          <p className="fs-13 text-ink-soft leading-relaxed">
            Alerts are evaluated when you open Khazana and while this screen is on, using data already
            in your vault. There is no server and no push notification, so <b className="text-ink font-semibold">nothing
            is checked while the app is closed</b> — every rule below shows when it was last actually looked at.
            {' '}With system notifications turned on in Settings, Khazana tells your operating system the
            moment a rule fires, but still only while a Khazana window is open. Date-based reminders —
            bills, renewals, goal dates — do arrive with the app closed on the Android and iOS apps,
            because those are handed to the phone&rsquo;s own scheduler in advance.
          </p>
        </div>
      </StaggerItem>

      {form && (
        <StaggerItem>
          <GlassCard>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Condition">
                <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as AlertKind })}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Symbol" hint={draft.kind === 'budget_over' || draft.kind === 'renewal_due' ? 'Not needed for this condition' : undefined}>
                <Input value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
                  disabled={draft.kind === 'budget_over' || draft.kind === 'renewal_due'} placeholder="RELIANCE" />
              </Field>
              <Field label={draft.kind === 'weight_above' ? 'Threshold (%)' : 'Threshold'}>
                <NumberInput value={draft.threshold} onChange={(v) => setDraft({ ...draft, threshold: v })} placeholder="2800" />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void save()}>Create alert</Button>
              <Button variant="ghost" onClick={() => setForm(false)}>Cancel</Button>
            </div>
          </GlassCard>
        </StaggerItem>
      )}

      {alerts.length === 0 ? (
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState icon={<Bell size={22} />} title="No alerts set"
              hint="Set a price or weight threshold and Khazana will flag it the next time you open the app."
              action={<Button onClick={() => setForm(true)}><Plus size={16} />New alert</Button>} />
          </GlassCard>
        </StaggerItem>
      ) : (
        <>
          <StaggerItem>
            <KpiRow cols={4}>
              <Kpi label="Rules" value={String(alerts.length)} icon={Bell} tone="accent" footer={`${alerts.filter((a) => a.active).length} watching`} />
              <Kpi label="Triggered" value={String(firing.size)} icon={BellRing} tone={firing.size ? 'danger' : 'success'}
                footer={now ? `As of ${formatDate(now)}` : 'Checking…'} />
              <Kpi label="Paused" value={String(alerts.filter((a) => !a.active).length)} icon={CircleCheck} tone="warning" footer="Not evaluated" />
              <Kpi label="Instruments covered" value={String(new Set(alerts.map((a) => a.symbol).filter(Boolean)).size)} icon={Bell} tone="violet" footer="Instruments watched" />
            </KpiRow>
          </StaggerItem>

          <StaggerItem>
            <section className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-line">
                <CardTitle className="fs-16 font-medium tracking-[-0.01em]" info="alerts.yourAlerts">Your alerts</CardTitle>
              </div>
              {alerts.map((a) => {
                const on = firing.has(a.id);
                const evaluation = byId.get(a.id);
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-line last:border-0 hover:bg-fill transition-colors">
                    <span className={`w-10 h-10 shrink-0 rounded-full grid place-items-center ${on ? 'bg-danger-soft text-danger' : a.active ? 'bg-[color-mix(in_srgb,var(--data-blue)_14%,transparent)] text-[var(--data-blue)]' : 'bg-fill text-muted'}`}>
                      {on ? <BellRing size={16} /> : <Bell size={16} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="fs-14 font-medium truncate">{a.label}</div>
                      {/* The rendered condition, not the raw threshold: §5.4
                          asks for "Food spending is 90% of the August budget",
                          not "Budget exceeded 300". */}
                      <div className="fs-11.5 text-muted mt-0.5 truncate">
                        {evaluation?.message ?? `${KIND_LABEL[a.kind]} ${a.kind === 'weight_above' ? `${a.threshold}%` : fmt.money(a.threshold)}`}
                      </div>
                      <div className="fs-11 text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {/* The stored words are enum-style caps; shown in sentence case. */}
                        <span>{sentence(ALERT_TYPE_OF[a.kind])}</span>
                        <span>{sentence(stateOf(a))}</span>
                        {/* When it was last actually looked at. The honesty the
                            whole section exists for. */}
                        <span>
                          {a.lastEvaluatedAt
                            ? `Checked ${formatDate(a.lastEvaluatedAt)}`
                            : a.active ? 'Not yet checked' : 'Paused'}
                        </span>
                        {/* A market rule is only as current as the price it read. */}
                        {evaluation?.dataAsOf != null && (
                          <span>Price data {formatDate(evaluation.dataAsOf)}</span>
                        )}
                      </div>
                    </div>
                    {evaluation?.unevaluable && <Chip tone="warning">Cannot check</Chip>}
                    {on && <Chip tone="danger">Condition met</Chip>}
                    <Toggle on={a.active} onChange={() => void toggle(a)} label={`${a.active ? 'Pause' : 'Resume'} ${a.label}`} />
                    <button onClick={() => void remove(a)} aria-label="Delete alert"
                      className="focus-ring grid place-items-center w-8 h-8 rounded-full bg-[var(--card-2)] shadow-[0_2px_6px_-3px_rgba(0,0,0,0.25)] text-muted hover:text-danger transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </section>
          </StaggerItem>
        </>
      )}
    </Stagger>
  );
}
