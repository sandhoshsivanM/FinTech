'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@khazana/domain/money';
import { signOutEverywhereLocal } from '@/lib/account';
import { balance, netWorth, type AccountKind } from '@/lib/ledger';
import { useOnline, writer } from '@/lib/store';
import { useReady } from '@/lib/useReady';
import { SyncChip } from '@/components/SyncChip';
import { Button, Card, ErrorText, Muted, Page } from '@/components/ui';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
];

const field = 'rounded-lg px-3 py-2 text-sm';
const fieldStyle = { background: 'var(--surface)', color: 'var(--ink)' };

export default function Home() {
  const router = useRouter();
  const { ready, error } = useReady();
  const { ledger, loaded } = useOnline();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [opening, setOpening] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await writer.addAccount({ name: name.trim(), subtype: kind, openingBalance: opening.trim() || '0' });
    setName('');
    setOpening('');
    setAdding(false);
  }

  async function signOut() {
    await signOutEverywhereLocal().catch(() => undefined);
    window.location.replace('/sign-in/');
  }

  return (
    <Page title="Khazana Online">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SyncChip />
        <div className="flex gap-2">
          <Link href="/settings/" className="rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>Settings</Link>
          <Link href="/how/" className="rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>How it works</Link>
          <button onClick={signOut} className="rounded-full px-3 py-1.5 text-xs" style={{ background: 'var(--card)' }}>Sign out</button>
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
                  <button onClick={() => router.push(`/account/?id=${a.id}`)} className="flex w-full items-center justify-between py-2.5 text-left">
                    <span>
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>{KINDS.find((k) => k.value === a.subtype)?.label}</span>
                    </span>
                    <span className="tabular-nums" data-testid={`balance-${a.name}`}>
                      {a.subtype === 'credit_card' ? 'Owed ' : ''}{formatMoney(balance(a, ledger.transactions))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!adding ? (
              <Button kind="quiet" onClick={() => setAdding(true)}>Add account</Button>
            ) : (
              <form onSubmit={add} className="flex flex-col gap-2">
                <input aria-label="Account name" placeholder="Account name, e.g. HDFC Savings" required maxLength={60}
                  value={name} onChange={(e) => setName(e.target.value)} className={field} style={fieldStyle} />
                <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} className={field} style={fieldStyle}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <input aria-label="Opening balance" placeholder={kind === 'credit_card' ? 'Amount owed now' : 'Balance now'} inputMode="decimal"
                  pattern="\d+(\.\d{1,2})?" value={opening} onChange={(e) => setOpening(e.target.value)} className={field} style={fieldStyle} />
                <div className="flex gap-2">
                  <Button kind="quiet" type="button" onClick={() => setAdding(false)}>Cancel</Button>
                  <Button type="submit">Save account</Button>
                </div>
              </form>
            )}
          </Card>
        </>
      )}
      {!ready && !error && <Muted>Unlocking your data…</Muted>}
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
