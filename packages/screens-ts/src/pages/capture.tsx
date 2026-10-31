'use client';
/**
 * Review — bank messages waiting for a yes or no.
 *
 * Every capture lands here first: approve it as read, fix it and approve, or
 * reject it. Nothing reaches the ledger without one of those. Messages arrive
 * by paste, by an iPhone Shortcut opening `/capture#sms=<text>`, or (in the
 * Mac app) from Messages. The fragment never leaves the browser, which is why
 * the Shortcut uses `#` and not `?`: a query string would be in the host's
 * request log.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, Check, X, Pencil, ClipboardPaste } from 'lucide-react';
import { useApp } from '../store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { moneyAccounts } from '@khazana/domain/accountLedger';
import type { PendingCapture, TxnType } from '@khazana/domain/types';
import { PageIntro, Button, Chip, Field, Input, Select, Segmented, EmptyState, GlassCard } from '@khazana/ui/ui';
import { Stagger, StaggerItem } from '@khazana/ui/motion';
import { NumberInput } from '@khazana/screens/components/NumberInput';
import { DateInput } from '@khazana/screens/components/DateInput';
import { formatDate, fromInputValue, toInputValue } from '@khazana/screens/lib/dateFormat';
import {
  REVIEW_REASON_LABELS, isPendingCapture, splitMessages,
  type CaptureEdits, type CaptureOutcome,
} from '@khazana/screens/lib/capture';

const TYPE_OPTIONS: { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

function summarise(outcomes: CaptureOutcome[]): string {
  const count = (o: CaptureOutcome) => outcomes.filter((x) => x === o).length;
  const parts = [
    count('added') && `${count('added')} added for review`,
    count('duplicate') && `${count('duplicate')} already captured`,
    count('not_a_transaction') && `${count('not_a_transaction')} not a transaction`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}.` : 'Nothing to read.';
}

export default function CapturePage() {
  const captures = useApp((s) => s.pendingCaptures);
  const addCaptures = useApp((s) => s.addCaptures);
  const approveCaptures = useApp((s) => s.approveCaptures);
  const pending = useMemo(
    () => captures.filter(isPendingCapture).sort((a, b) => b.occurredAt - a.occurredAt),
    [captures],
  );
  const ready = pending.filter((c) => c.categoryId);

  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ingest = async (raw: string) => {
    const messages = splitMessages(raw);
    if (messages.length === 0) return;
    setBusy(true);
    try {
      const outcomes = await addCaptures(messages.map((m) => ({ text: m, source: 'sms' as const })));
      setNote(summarise(outcomes));
      setText('');
    } finally {
      setBusy(false);
    }
  };

  // An iPhone Shortcut hands over a message as `#sms=<text>`. Read it once,
  // then strip it from the address bar so a reload or a shared link does not
  // carry a bank message around.
  const handledHash = useRef(false);
  useEffect(() => {
    if (handledHash.current || !window.location.hash.startsWith('#sms=')) return;
    handledHash.current = true;
    let raw = '';
    try {
      raw = decodeURIComponent(window.location.hash.slice(5));
    } catch {
      // A malformed escape is not a message.
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (raw) void ingest(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Review"
          info="capture.page"
          subtitle={pending.length
            ? `${pending.length} bank message${pending.length === 1 ? '' : 's'} waiting for a yes or no`
            : 'Bank messages become transactions only after you approve them'}
          action={ready.length > 1 ? (
            <Button onClick={() => void approveCaptures(ready.map((c) => ({ id: c.id })))}>
              <Check size={16} />Approve {ready.length} with a category
            </Button>
          ) : undefined}
        />
      </StaggerItem>

      <StaggerItem>
        <GlassCard>
          <Field
            label="Paste bank SMS"
            hint="One or more messages, separated by a blank line. Only the amount, merchant, date and reference are kept — never the message itself."
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={20_000}
              placeholder="Rs.450.00 debited from a/c XX1234 to SWIGGY on 26-10-26. UPI Ref 123456789012"
              className="focus-ring w-full rounded-[14px] border border-line bg-[var(--card-2)] px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none resize-y"
            />
          </Field>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Button onClick={() => void ingest(text)} disabled={busy || !text.trim()}>
              <ClipboardPaste size={16} />Read messages
            </Button>
            {note && <span role="status" className="fs-13 text-ink-soft">{note}</span>}
          </div>
        </GlassCard>
      </StaggerItem>

      {pending.length === 0 ? (
        <StaggerItem>
          <GlassCard padded={false}>
            <EmptyState
              icon={<Inbox size={22} />}
              title="Nothing to review"
              hint="Paste a bank SMS above. On a Mac with Text Message Forwarding, the desktop app can read them from Messages for you."
            />
          </GlassCard>
        </StaggerItem>
      ) : (
        pending.map((c) => (
          <StaggerItem key={c.id}>
            <CaptureCard capture={c} />
          </StaggerItem>
        ))
      )}
    </Stagger>
  );
}

function CaptureCard({ capture: c }: { capture: PendingCapture }) {
  const categories = useApp((s) => s.categories);
  const accounts = useApp((s) => s.accounts);
  const approveCaptures = useApp((s) => s.approveCaptures);
  const rejectCapture = useApp((s) => s.rejectCapture);
  const fmt = useFmt();
  const money = useMemo(() => moneyAccounts(accounts), [accounts]);

  const [editing, setEditing] = useState(false);
  const [categoryId, setCategoryId] = useState(c.categoryId ?? '');
  const [accountId, setAccountId] = useState(c.accountId ?? money[0]?.id ?? '');
  const [amount, setAmount] = useState(c.amount);
  const [type, setType] = useState<TxnType>(c.type === 'income' ? 'income' : 'expense');
  const [merchant, setMerchant] = useState(c.merchant ?? '');
  const [date, setDate] = useState(toInputValue(c.occurredAt));
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setError(null);
    const edits: CaptureEdits = { categoryId: categoryId || undefined, accountId: accountId || null };
    if (editing) {
      edits.amount = amount;
      edits.type = type;
      edits.merchant = merchant;
      const day = fromInputValue(date);
      // Keep the captured time when only the time-less date field was left alone.
      if (day != null && toInputValue(c.occurredAt) !== date) edits.date = day + 12 * 3600_000;
    }
    try {
      await approveCaptures([{ id: c.id, edits }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve this one.');
    }
  };

  const signed = c.type === 'income' ? '+' : '−';
  return (
    <GlassCard>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="min-w-0">
          <p className={c.type === 'income' ? 'text-success fs-22 font-semibold' : 'text-ink fs-22 font-semibold'}>
            {signed}{fmt.money(c.amount)}
          </p>
          <p className="fs-13 text-ink-soft mt-0.5 capitalize truncate">
            {c.merchant || 'No merchant'} · {formatDate(c.occurredAt)}
            {c.accountLast4 ? ` · ••${c.accountLast4}` : ''}
          </p>
        </div>
        <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
          {(c.reasons ?? []).filter((r) => REVIEW_REASON_LABELS[r]).map((r) => (
            <Chip key={r} tone={r === 'possible_duplicate' || r === 'card_bill_payment' ? 'warning' : 'neutral'}>
              {REVIEW_REASON_LABELS[r]}
            </Chip>
          ))}
        </div>
      </div>

      {editing && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
          <Field label="Amount"><NumberInput value={amount} onChange={setAmount} /></Field>
          <Field label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
          <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
          <Field label="Type"><Segmented options={TYPE_OPTIONS} value={type} onChange={setType} /></Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={!categoryId}>
            <option value="">Choose a category</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </Select>
        </Field>
        <Field label="Account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={money.length === 0}>
            {money.length === 0 && <option value="">Cash</option>}
            {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>

      {error && <p role="alert" className="fs-13 text-danger mt-3">{error}</p>}

      <div className="flex gap-2 mt-5 flex-wrap">
        <Button onClick={() => void approve()} disabled={!categoryId}><Check size={16} />Approve</Button>
        <Button variant="secondary" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
          <Pencil size={15} />{editing ? 'Stop editing' : 'Edit'}
        </Button>
        <Button variant="danger" onClick={() => void rejectCapture(c.id)} className="ml-auto">
          <X size={16} />Reject
        </Button>
      </div>
    </GlassCard>
  );
}
