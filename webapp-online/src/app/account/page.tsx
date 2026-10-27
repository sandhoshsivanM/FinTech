'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@khazana/domain/money';
import { balance, type Txn, type TxnValue } from '@/lib/ledger';
import { useOnline, writer } from '@/lib/store';
import { useReady } from '@/lib/useReady';
import { SyncChip } from '@/components/SyncChip';
import { Button, Card, ErrorText, LiveStatus, Muted, Page } from '@/components/ui';

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Health', 'Salary', 'Transfer', 'Other'];
const field = 'rounded-lg px-3 py-2 text-sm';
const fieldStyle = { background: 'var(--surface)', color: 'var(--ink)' };
const labelStyle = 'flex flex-1 flex-col gap-1 text-sm';
const today = () => new Date().toISOString().slice(0, 10);

type Draft = Omit<TxnValue, 'accountId'>;
const blank = (): Draft => ({ type: 'expense', amount: '', date: today(), note: '', category: 'Food' });

/** One account's transactions. Static export: the account comes from ?id=. */
export default function AccountPage() {
  const { ready, error } = useReady();
  const { ledger, loaded } = useOnline();
  const [id, setId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<Txn>();
  const amount = useRef<HTMLInputElement>(null);

  useEffect(() => setId(new URLSearchParams(window.location.search).get('id') ?? undefined), []);

  // Editing a row moves focus into the form, so keyboard and screen reader users land where the change happens.
  useEffect(() => {
    if (editing) amount.current?.focus();
  }, [editing]);

  const account = ledger.accounts.find((a) => a.id === id);
  const txns = ledger.transactions.filter((t) => t.accountId === id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    const value = { ...draft, amount: draft.amount.trim(), note: draft.note.trim() };
    if (editing) await writer.updateTxn(editing, value);
    else await writer.addTxn({ ...value, accountId: account.id });
    setDraft(blank());
    setEditing(undefined);
  }

  function edit(t: Txn) {
    setEditing(t);
    setDraft({ type: t.type, amount: t.amount, date: t.date, note: t.note, category: t.category });
  }

  return (
    <Page title={account?.name ?? 'Account'}>
      <div className="flex items-center justify-between">
        <Link href="/home/" className="inline-flex min-h-6 items-center text-sm" style={{ color: 'var(--muted)' }}>← Accounts</Link>
        <SyncChip />
      </div>

      {ready && loaded && !account && <Muted>This account doesn’t exist (it may have been deleted on another device).</Muted>}

      {account && (
        <>
          <Card>
            <Muted>{account.subtype === 'credit_card' ? 'Owed' : 'Balance'}</Muted>
            <p className="text-3xl font-semibold tabular-nums" data-testid="account-balance">{formatMoney(balance(account, ledger.transactions))}</p>
          </Card>

          <Card title={editing ? 'Edit transaction' : 'Add transaction'}>
            <form onSubmit={save} className="flex flex-col gap-3">
              <div className="flex gap-2" role="group" aria-label="Type">
                {(['expense', 'income'] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={draft.type === t} onClick={() => setDraft({ ...draft, type: t })}
                    className="flex-1 rounded-full px-3 py-2 text-sm"
                    style={draft.type === t ? { background: 'var(--primary)', color: 'var(--primary-fg)' } : fieldStyle}>
                    {t === 'expense' ? 'Spent' : account.subtype === 'credit_card' ? 'Paid off' : 'Received'}
                  </button>
                ))}
              </div>
              <label className={labelStyle}>
                Amount (₹)
                <input ref={amount} required inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="0.00"
                  value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className={field} style={fieldStyle} />
              </label>
              <label className={labelStyle}>
                Note
                <input placeholder="e.g. Swiggy" maxLength={80}
                  value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={field} style={fieldStyle} />
              </label>
              <div className="flex gap-2">
                <label className={labelStyle}>
                  Category
                  <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={field} style={fieldStyle}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className={labelStyle}>
                  Date
                  <input type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={field} style={fieldStyle} />
                </label>
              </div>
              <div className="flex gap-2">
                {editing && <Button kind="quiet" onClick={() => { setEditing(undefined); setDraft(blank()); }}>Cancel</Button>}
                <Button type="submit">{editing ? 'Save changes' : 'Add'}</Button>
              </div>
            </form>
          </Card>

          <Card title="Transactions">
            {txns.length === 0 && <Muted>Nothing yet.</Muted>}
            <ul className="flex flex-col">
              {txns.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2" data-testid="txn">
                  <button type="button" onClick={() => edit(t)} className="flex-1 text-left">
                    <span className="block text-sm">{t.note || t.category}</span>
                    <span className="block text-xs" style={{ color: 'var(--muted)' }}>{t.date} · {t.category}</span>
                  </button>
                  {/* The sign says money in or out; the colour is not needed, and green text is too faint on the card. */}
                  <span className="tabular-nums" data-testid="txn-amount">
                    {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount)}
                  </span>
                  <button type="button" aria-label={`Delete ${t.note || t.category} on ${t.date}`} onClick={() => writer.deleteTxn(t)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs" style={{ color: 'var(--muted)' }}>✕</button>
                </li>
              ))}
            </ul>
          </Card>

          <Button kind="quiet" onClick={async () => {
            if (confirm(`Delete ${account.name} and its ${txns.length} transactions on every device?`)) {
              await writer.deleteAccount(account, ledger);
              window.location.replace('/home/');
            }
          }}>Delete account</Button>
        </>
      )}
      <LiveStatus>{!ready && !error ? 'Unlocking your data…' : ''}</LiveStatus>
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
