'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Lock, MessageSquare, Plus } from 'lucide-react';
import { formatMoney } from '@khazana/domain/money';
import { advice, GOOD_UTILISATION, NETWORKS, dueText, dueTone, totals, validateCard, viewOf, type CardForm, type CardView, type Tone } from '@/lib/cards';
import type { CreditCard } from '@/lib/ledger';
import { useOnline, writer } from '@/lib/store';
import { useReady } from '@/lib/useReady';
import { Button, Card, ErrorText, Muted, Page } from '@/components/ui';

const PEEK = 58;
const CARD_H = 196;
const TONE: Record<Tone | 'quiet', string> = { ok: 'var(--income)', warn: 'var(--warn)', bad: 'var(--expense)', quiet: 'var(--muted)' };
// Card faces cycle through existing tokens: brand plate, ink surface, gold ink.
const FACES = ['var(--brand-plate)', 'var(--ink-surface)', 'var(--gold-ink)'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`;
const chip = (tone: string): React.CSSProperties => ({ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone });
const blank: CardForm = { name: '', network: 'Visa', last4: '', limit: '', statementDay: '', dueDay: '' };
const field = 'h-11 rounded-xl px-3 text-base';
const fieldStyle = { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' };

function whenText(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  const today = new Date();
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - t.getTime()) / 86_400_000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : fmt(t);
}

export default function CardsPage() {
  const { ready, error } = useReady();
  const { ledger, loaded } = useOnline();
  const [pickedId, setPickedId] = useState<string>();
  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const views = useMemo(() => ledger.cards.map((c) => viewOf(c, ledger.transactions, new Date())), [ledger]);
  const sel = views.find((v) => v.card.id === pickedId) ?? views[0];
  const total = totals(views);

  // The picked card comes to the front; the others peek above it, in order.
  const order = sel ? [...views.filter((v) => v !== sel), sel] : [];

  if (!ready || !loaded) {
    return <Page title="Cards">{error ? <ErrorText>{error}</ErrorText> : <Muted>Unlocking your data…</Muted>}</Page>;
  }

  if (screen === 'detail' && sel) {
    return (
      <>
        <Detail v={sel} onBack={() => { setScreen('list'); setConfirmDelete(false); }} onEdit={() => setEditing(sel.card)}
          confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
          onDelete={async () => { await writer.deleteCard(sel.card); setConfirmDelete(false); setScreen('list'); }} />
        {editing && <CardSheet initial={editing} onClose={() => setEditing(null)} />}
      </>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Cards</h1>
          <button type="button" onClick={() => setEditing('new')} aria-label="Add a card"
            className="flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <Plus size={16} aria-hidden /> Add card
          </button>
        </div>

        <div className="flex gap-1.5 rounded-full p-1" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <span role="tab" aria-selected="true" className="flex h-9 flex-1 items-center justify-center rounded-full text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-on)' }}>My cards</span>
          <Link href="/coming-soon/?what=credit" role="tab" aria-selected="false" className="flex h-9 flex-1 items-center justify-center rounded-full text-sm" style={{ color: 'var(--muted)' }}>Credit report · P5</Link>
          <Link href="/coming-soon/?what=offers" role="tab" aria-selected="false" className="flex h-9 flex-1 items-center justify-center rounded-full text-sm" style={{ color: 'var(--muted)' }}>Offers · P5</Link>
        </div>

        {!sel ? (
          <Card>
            <Muted>No cards yet. Add one to see what you owe, how close you are to the limit, and when the bill is due. It is worked out on this device from your bank alerts.</Muted>
            <Button onClick={() => setEditing('new')}>Add a card</Button>
          </Card>
        ) : (
          <>
            <div className="relative" style={{ height: (views.length - 1) * PEEK + CARD_H }} data-testid="card-stack">
              {order.map((v, pos) => {
                const front = v === sel;
                return (
                  <button key={v.card.id} type="button" onClick={() => setPickedId(v.card.id)} aria-pressed={front}
                    aria-label={front ? `${v.card.name}, selected` : `Show ${v.card.name}`}
                    className="absolute left-0 right-0 flex flex-col justify-between rounded-3xl px-5 py-[18px] text-left transition-[top,transform] duration-300 ease-out active:scale-[0.98] motion-reduce:transition-none"
                    style={{ top: pos * PEEK, zIndex: pos + 1, height: CARD_H, background: FACES[ledger.cards.indexOf(v.card) % FACES.length], color: 'var(--surface)', boxShadow: '0 -6px 18px rgba(0,0,0,0.18)' }}>
                    <span className="flex w-full items-center justify-between">
                      <span className="text-base font-semibold">{v.card.name}</span>
                      <span className="text-[13px] tracking-[2px] opacity-85">•••• {v.card.last4}</span>
                    </span>
                    <span className="h-[30px] w-10 rounded-md" style={{ background: 'var(--gold)' }} />
                    <span className="flex w-full items-end justify-between">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-xs opacity-75">Owed</span>
                        <span className="text-2xl font-semibold tabular-nums">{formatMoney(v.owed)}</span>
                      </span>
                      <span className="text-sm font-bold tracking-wide opacity-90">{v.card.network.toUpperCase()}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">{sel.card.name}</span>
                <span className="text-[13px]" style={{ color: 'var(--muted)' }}>{formatMoney(sel.available)} available</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Gauge pct={sel.pct} tone={sel.tone} height={12} />
                <PctChip v={sel} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px]" style={{ color: 'var(--muted)' }}>Bill {fmt(sel.cycle.statement)} · due {fmt(sel.cycle.due)}</span>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={dueStyle(sel.cycle.daysToDue)}>{dueText(sel.cycle.daysToDue)}</span>
              </div>
              <button type="button" onClick={() => setScreen('detail')} className="h-11 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--line)' }}>Card details</button>
            </Card>

            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px]" style={{ color: 'var(--muted)' }}>Owed on all cards</span>
                <span className="text-[13px]" style={{ color: 'var(--muted)' }}>{total.pct}% of {formatMoney(total.limit)}</span>
              </div>
              <div className="text-[26px] font-semibold tabular-nums" data-testid="total-owed">{formatMoney(total.owed)}</div>
              <span className="text-xs leading-snug" style={{ color: 'var(--muted)' }}>Credit scores reward staying under {GOOD_UTILISATION}% on each card. Worked out on this device from your bank alerts.</span>
            </Card>
          </>
        )}
      </section>
      {editing && <CardSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const dueStyle = (days: number): React.CSSProperties => {
  const t = dueTone(days);
  return t === 'quiet' ? { background: 'var(--tray)', color: 'var(--muted)' } : chip(TONE[t]);
};

function Gauge({ pct, tone, height, mark }: { pct: number; tone: Tone; height: number; mark?: boolean }) {
  return (
    <div className="relative flex-1 rounded-full" style={{ height, background: 'var(--tray)' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Utilisation">
      <div className="rounded-full" style={{ height, width: `${Math.min(100, pct)}%`, background: TONE[tone] }} />
      {mark && <div className="absolute" style={{ left: `${GOOD_UTILISATION}%`, top: -4, width: 2, height: height + 8, background: 'var(--ink)', opacity: 0.5 }} />}
    </div>
  );
}

const PctChip = ({ v }: { v: CardView }) => (
  <span className="rounded-full px-2 py-[3px] text-xs font-semibold" style={chip(TONE[v.tone])}>{v.pct}%</span>
);

function Detail({ v, onBack, onEdit, onDelete, confirmDelete, setConfirmDelete }: {
  v: CardView; onBack: () => void; onEdit: () => void; onDelete: () => void; confirmDelete: boolean; setConfirmDelete: (b: boolean) => void;
}) {
  const tone = dueTone(v.cycle.daysToDue);
  const dueColour = TONE[tone];
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back to my cards" className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <ArrowLeft size={18} aria-hidden />
        </button>
        <h1 className="flex-1 text-xl font-semibold">{v.card.name}</h1>
        <Button kind="quiet" onClick={onEdit}>Edit</Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[20px] p-3.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Owed now</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(v.owed)}</div>
        </div>
        <div className="rounded-[20px] p-3.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Limit</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(v.limit)}</div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Utilisation</span>
          <PctChip v={v} />
        </div>
        <div className="flex"><Gauge pct={v.pct} tone={v.tone} height={14} mark /></div>
        <span className="text-xs leading-snug" style={{ color: 'var(--muted)' }}>{advice(v.owed, v.limit)}</span>
      </Card>

      <Card title="This cycle">
        <div className="flex items-center gap-2">
          <div className="flex w-[84px] flex-col items-center gap-1">
            <span className="h-3 w-3 rounded-full" style={{ background: 'var(--ink)' }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Bill</span>
            <span className="text-[13px] font-semibold">{fmt(v.cycle.statement)}</span>
          </div>
          <div className="relative -top-[18px] h-1 flex-1 rounded-full" style={{ background: 'var(--tray)' }}>
            <div className="h-1 rounded-full" style={{ width: `${v.cycle.cyclePct}%`, background: dueColour }} />
          </div>
          <div className="flex w-[84px] flex-col items-center gap-1">
            <span className="h-3 w-3 rounded-full" style={{ border: `2px solid ${dueColour}` }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Due</span>
            <span className="text-[13px] font-semibold">{fmt(v.cycle.due)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13px]" style={{ color: 'var(--muted)' }}>Bill amount {formatMoney(v.billed)}</span>
          <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={dueStyle(v.cycle.daysToDue)}>{dueText(v.cycle.daysToDue)}</span>
        </div>
      </Card>

      <div className="rounded-3xl px-4 py-1.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
        {v.txns.length === 0 && <p className="py-3 text-sm" style={{ color: 'var(--muted)' }}>No transactions matched •••• {v.card.last4} yet.</p>}
        {v.txns.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ background: 'var(--tray)' }}><MessageSquare size={16} aria-hidden /></span>
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{t.note || t.category}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{whenText(t.date)} · from bank alert</span>
            </div>
            <span className="text-sm font-medium tabular-nums" style={{ color: t.type === 'expense' ? 'var(--expense)' : 'var(--income)' }}>
              {t.type === 'expense' ? '−' : '+'}{formatMoney(t.amount)}
            </span>
          </div>
        ))}
      </div>

      {!confirmDelete ? (
        <Button kind="quiet" onClick={() => setConfirmDelete(true)}>Delete card</Button>
      ) : (
        <Card>
          <Muted>Delete {v.card.name}? Your transactions stay; only the card goes, on every device.</Muted>
          <div className="flex gap-2">
            <Button kind="quiet" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button onClick={onDelete}>Delete card</Button>
          </div>
        </Card>
      )}
    </section>
  );
}

function CardSheet({ initial, onClose }: { initial: CreditCard | 'new'; onClose: () => void }) {
  const existing = initial === 'new' ? undefined : initial;
  const [f, setF] = useState<CardForm>(existing
    ? { name: existing.name, network: existing.network, last4: existing.last4, limit: existing.limit, statementDay: String(existing.statementDay), dueDay: String(existing.dueDay) }
    : blank);
  const [errors, setErrors] = useState<Partial<Record<keyof CardForm, string>>>({});
  const set = (k: keyof CardForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const title = existing ? 'Edit card' : 'Add a card';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = validateCard(f);
    if ('errors' in r) return setErrors(r.errors);
    if (existing) await writer.updateCard(existing, r.value);
    else await writer.addCard(r.value);
    onClose();
  }

  const label = 'flex flex-col gap-1.5 text-[13px]';
  const err = (k: keyof CardForm) => errors[k] && <span role="alert" className="text-xs" style={{ color: 'var(--expense)' }}>{errors[k]}</span>;
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <form role="dialog" aria-label={title} onSubmit={save} noValidate
        className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-3xl px-4 pb-7 pt-4" style={{ background: 'var(--surface)' }}>
        <div className="h-1 w-9 self-center rounded-full" style={{ background: 'var(--line)' }} />
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--muted)' }}>Only what&apos;s needed to track it.</p>
        </div>
        <label className={label} style={{ color: 'var(--muted)' }}>Card name
          <input className={field} style={fieldStyle} value={f.name} onChange={set('name')} maxLength={60} placeholder="e.g. Axis Ace" />
          {err('name')}
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px]" style={{ color: 'var(--muted)' }}>Network</span>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map((n) => {
              const on = f.network === n;
              return (
                <button key={n} type="button" aria-pressed={on} onClick={() => setF({ ...f, network: n })}
                  className="h-10 rounded-full px-3.5 text-sm font-semibold"
                  style={{ background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-on)' : 'var(--ink)', border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}` }}>{n}</button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className={label} style={{ color: 'var(--muted)' }}>Last 4 digits
            <input className={field} style={{ ...fieldStyle, letterSpacing: 3 }} inputMode="numeric" maxLength={4} autoComplete="off" value={f.last4} onChange={set('last4')} />
            {err('last4')}
          </label>
          <label className={label} style={{ color: 'var(--muted)' }}>Credit limit
            <input className={field} style={fieldStyle} inputMode="decimal" value={f.limit} onChange={set('limit')} placeholder="₹1,00,000" />
            {err('limit')}
          </label>
          <label className={label} style={{ color: 'var(--muted)' }}>Bill day
            <input className={field} style={fieldStyle} inputMode="numeric" maxLength={2} value={f.statementDay} onChange={set('statementDay')} />
            {err('statementDay')}
          </label>
          <label className={label} style={{ color: 'var(--muted)' }}>Due day
            <input className={field} style={fieldStyle} inputMode="numeric" maxLength={2} value={f.dueDay} onChange={set('dueDay')} />
            {err('dueDay')}
          </label>
        </div>
        <div className="flex items-start gap-2.5 rounded-[14px] p-3" style={{ background: 'var(--tray)' }}>
          <Lock size={18} aria-hidden className="mt-px shrink-0" />
          <span className="text-xs leading-snug">Khazana never asks for the full card number, expiry date or CVV, and never stores them. The last 4 digits are enough to match your bank alerts.</span>
        </div>
        <div className="flex gap-2.5">
          <Button kind="quiet" type="button" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1">{existing ? 'Save card' : 'Add card'}</Button>
        </div>
      </form>
    </div>
  );
}
