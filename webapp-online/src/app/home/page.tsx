'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@khazana/domain/money';
import { signOutEverywhereLocal } from '@/lib/account';
import { balance, netWorth, type AccountKind } from '@/lib/ledger';
import { useOnline, writer } from '@/lib/store';
import { useReady } from '@/lib/useReady';
import { SyncChip } from '@/components/SyncChip';
import { Button, Card, ErrorText, LiveStatus, Muted, Page } from '@/components/ui';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
];

const field = 'rounded-lg px-3 py-2 text-sm';
const fieldStyle = { background: 'var(--surface)', color: 'var(--ink)' };
const labelStyle = 'flex flex-col gap-1 text-sm';

export default function Home() {
  const { ready, error } = useReady();
  const { ledger, loaded } = useOnline();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [opening, setOpening] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  // The name field takes focus when the form opens (autoFocus). When it closes, focus goes back to the button that opened it.
  useEffect(() => {
    if (!adding && returnFocus.current) {
      returnFocus.current = false;
      addButton.current?.focus();
    }
  }, [adding]);

  function closeForm() {
    returnFocus.current = true;
    setAdding(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await writer.addAccount({ name: name.trim(), subtype: kind, openingBalance: opening.trim() || '0' });
    setName('');
    setOpening('');
    closeForm();
  }

  async function signOut() {
    await signOutEverywhereLocal().catch(() => undefined);
    window.location.replace('/sign-in/');
  }

  return (
    <Page title="Khazana Online" docTitle="Accounts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SyncChip />
        <div className="flex gap-2">
          <Link href="/how/" className="rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>How it works</Link>
          <button type="button" onClick={signOut} className="rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>Sign out</button>
        </div>
      </div>

      {ready && loaded && (
        <>
          <Card>
            <Muted>Net worth (bank and cash, minus card dues)</Muted>
            <p className="text-3xl font-semibold" data-testid="net-worth">{formatMoney(netWorth(ledger))}</p>
          </Card>

          <Card title="Accounts">
            {ledger.accounts.length === 0 && <Muted>No accounts yet. Add one, then open this page on another device.</Muted>}
            <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--surface)' }}>
              {ledger.accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/account/?id=${a.id}`} className="flex w-full items-center justify-between py-2.5 text-left">
                    <span>
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>{KINDS.find((k) => k.value === a.subtype)?.label}</span>
                    </span>
                    <span className="tabular-nums" data-testid={`balance-${a.name}`}>
                      {a.subtype === 'credit_card' ? 'Owed ' : ''}{formatMoney(balance(a, ledger.transactions))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!adding ? (
              <Button ref={addButton} kind="quiet" onClick={() => setAdding(true)}>Add account</Button>
            ) : (
              <form onSubmit={add} className="flex flex-col gap-3">
                <label className={labelStyle}>
                  Account name
                  <input autoFocus required maxLength={60} placeholder="e.g. HDFC Savings"
                    value={name} onChange={(e) => setName(e.target.value)} className={field} style={fieldStyle} />
                </label>
                <label className={labelStyle}>
                  Kind
                  <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} className={field} style={fieldStyle}>
                    {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </label>
                <label className={labelStyle}>
                  {kind === 'credit_card' ? 'Amount owed now' : 'Balance now'}
                  <input aria-describedby="opening-hint" inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="0.00"
                    value={opening} onChange={(e) => setOpening(e.target.value)} className={field} style={fieldStyle} />
                </label>
                <p id="opening-hint" className="text-xs" style={{ color: 'var(--muted)' }}>Digits only, with up to two decimal places. Leave it empty for zero.</p>
                <div className="flex gap-2">
                  <Button kind="quiet" onClick={closeForm}>Cancel</Button>
                  <Button type="submit">Save account</Button>
                </div>
              </form>
            )}
          </Card>
        </>
      )}
      <LiveStatus>{!ready && !error ? 'Unlocking your data…' : ''}</LiveStatus>
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
