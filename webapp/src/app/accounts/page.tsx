'use client';
/**
 * Accounts — the money you hold, per account.
 *
 * The chart of accounts and the double-entry math behind it have existed since
 * the v3 migration; until now nothing displayed them, so every transaction
 * landed on one hidden "Cash" account and three real bank accounts were
 * indistinguishable.
 *
 * Balances come from the ledger (`accountBalances`), never from re-summing
 * transactions here — that is the whole point of keeping postings, and a second
 * implementation would be a second answer.
 *
 * Only `bank` and `cash` subtypes appear, matching the Flutter accounts screen.
 * Cards and loans are not accounts: they live in Liabilities, where they have an
 * APR and a term that an account row has nowhere to put.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, Wallet, Plus, Pencil, Trash2, Archive, ArrowRightLeft, X } from 'lucide-react';
import { useApp, uid, cashAcctId } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type Account } from '@/lib/types';
import { accountBalances, moneyAccounts, liquidBalance } from '@/domain/accountLedger';
import {
  PageIntro, GlassCard, EmptyState, Button, Field, Input, Select, Segmented, Chip,
} from '@/components/ui';
import { Stagger, StaggerItem, useReducedMotion } from '@/components/motion';
import { useConfirm } from '@/components/Confirm';
import { NumberInput } from '@/components/NumberInput';

type MoneySubtype = 'bank' | 'cash';

const GROUPS: { subtype: MoneySubtype; label: string; icon: typeof Landmark }[] = [
  { subtype: 'bank', label: 'Bank accounts', icon: Landmark },
  { subtype: 'cash', label: 'Cash & wallets', icon: Wallet },
];

const SUBTYPE_OPTIONS: { value: MoneySubtype; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
];

export default function AccountsPage() {
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const txns = useApp((s) => s.txns);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const vaultId = useApp((s) => s.vaultId);
  const ghost = useApp((s) => s.ghost);
  const put = useApp((s) => s.put);
  const del = useApp((s) => s.del);
  const reassign = useApp((s) => s.reassignTxnAccounts);
  const confirm = useConfirm();
  const fmt = useFmt();
  const reduced = useReducedMotion();

  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Same reason as the holdings grid: the editor opens above a list the reader
  // may have scrolled past, and a click that changes nothing on screen reads as
  // a dead button.
  useEffect(() => {
    if (!editing && !adding) return;
    editorRef.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [editing, adding, reduced]);

  const balances = useMemo(() => accountBalances(accounts, postings), [accounts, postings]);
  const live = useMemo(() => moneyAccounts(accounts), [accounts]);
  const total = useMemo(() => liquidBalance(accounts, postings), [accounts, postings]);
  const postingCount = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of postings) n.set(p.accountId, (n.get(p.accountId) ?? 0) + 1);
    return n;
  }, [postings]);

  const grouped = GROUPS
    .map((g) => ({ ...g, rows: live.filter((a) => a.subtype === g.subtype).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.rows.length > 0);

  // Transactions still sitting on the built-in Cash account, which is what
  // every entry got before accounts were selectable.
  const defaultCash = cashAcctId(activeProfileId);
  const strandedCount = txns.filter((t) => (t.accountId ?? defaultCash) === defaultCash).length;
  const bankAccounts = live.filter((a) => a.subtype === 'bank');
  const [moveTo, setMoveTo] = useState('');

  const mask = (s: string) => (ghost ? '••••••' : s);

  async function removeAccount(a: Account) {
    const used = postingCount.get(a.id) ?? 0;
    if (used > 0) {
      // Deleting would orphan postings and silently change every balance that
      // ever touched this account. Archiving keeps the history intact.
      if (!(await confirm({
        title: `Archive ${a.name}?`,
        message: `${used} ledger entr${used === 1 ? 'y' : 'ies'} reference this account, so it cannot be deleted without rewriting your history. Archiving hides it from pickers and totals but keeps past transactions correct.`,
        confirmLabel: 'Archive',
      }))) return;
      await put(STORE.account, { ...a, archived: true } as Account & { id: string } & Record<string, unknown>);
      return;
    }
    if (!(await confirm({
      title: `Delete ${a.name}?`,
      message: 'Nothing has been recorded against this account yet, so it can be removed cleanly.',
      confirmLabel: 'Delete', danger: true,
    }))) return;
    await del(STORE.account, a.id);
  }

  async function runReassign() {
    const target = live.find((a) => a.id === moveTo);
    if (!target) return;
    if (!(await confirm({
      title: `Move ${strandedCount} transaction${strandedCount === 1 ? '' : 's'} to ${target.name}?`,
      message: 'Every transaction still on the built-in Cash account moves to this one, and its ledger entries are rewritten to match. Transactions you have already tagged are left alone.',
      confirmLabel: 'Move them',
    }))) return;
    await reassign(defaultCash, target.id);
    setMoveTo('');
  }

  return (
    <Stagger className="grid gap-6">
      <StaggerItem>
        <PageIntro
          title="Accounts"
          subtitle={live.length === 0
            ? 'Track which account each transaction moves'
            : `${live.length} account${live.length === 1 ? '' : 's'} · ${mask(fmt.money(total))} available`}
          action={
            <Button onClick={() => { setEditing(null); setAdding((v) => !v); }}>
              <Plus size={16} />Add account
            </Button>
          }
        />
      </StaggerItem>

      {(editing || adding) && (
        <div ref={editorRef} className="grid gap-6 min-w-0 scroll-mt-24">
          <StaggerItem>
            <AccountForm
              key={editing?.id ?? 'new'}
              editing={editing}
              vaultId={vaultId}
              onDone={() => { setEditing(null); setAdding(false); }}
            />
          </StaggerItem>
        </div>
      )}

      {/* Bulk reassign — only worth showing when there is something to move and
          somewhere to move it to. */}
      {strandedCount > 0 && bankAccounts.length > 0 && (
        <StaggerItem>
          <GlassCard>
            <div className="flex items-start gap-3 flex-wrap">
              <span className="w-9 h-9 shrink-0 rounded-[10px] grid place-items-center bg-accent-soft text-accent">
                <ArrowRightLeft size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
                  {strandedCount} transaction{strandedCount === 1 ? '' : 's'} not on a real account
                </h3>
                <p className="text-[13px] text-ink-soft leading-relaxed mt-1">
                  Everything recorded before accounts existed sits on the built-in Cash account. Move it to the
                  account it actually came from — usually the one your salary lands in — then re-tag the exceptions
                  individually.
                </p>
                <div className="flex gap-2 mt-3 flex-wrap items-center">
                  <div className="min-w-[200px]">
                    <Select aria-label="Move transactions to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                      <option value="">Choose an account…</option>
                      {live.filter((a) => a.id !== defaultCash).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  </div>
                  <Button onClick={() => void runReassign()} disabled={!moveTo}>Move them</Button>
                </div>
              </div>
            </div>
          </GlassCard>
        </StaggerItem>
      )}

      {live.length === 0 ? (
        <StaggerItem>
          <GlassCard>
            <EmptyState
              icon={<Landmark size={22} />}
              title="No accounts yet"
              hint="Add each bank account and wallet you use, with the balance it holds today. Every transaction can then say which account it moved, and transfers between them stop looking like income and spending."
              action={<Button onClick={() => setAdding(true)}><Plus size={16} />Add account</Button>}
            />
          </GlassCard>
        </StaggerItem>
      ) : grouped.map((g) => (
        <StaggerItem key={g.subtype}>
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 min-[900px]:px-5 py-4 border-b border-line">
              <g.icon size={17} className="text-muted" />
              <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{g.label}</h2>
              <span className="ml-auto text-[13px] font-semibold tnum">
                {mask(fmt.money(g.rows.reduce((s, a) => s.plus(balances.get(a.id) ?? ZERO), ZERO)))}
              </span>
            </div>
            <ul>
              {g.rows.map((a) => {
                const bal = balances.get(a.id) ?? ZERO;
                return (
                  <li key={a.id} className="group flex items-center gap-3 px-4 min-[900px]:px-5 py-3.5 border-b border-line last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[14px] truncate">{a.name}</span>
                      <span className="block text-[11.5px] text-muted">
                        {D(a.openingBalance).isZero()
                          ? 'No opening balance'
                          : `Opened with ${mask(fmt.money(D(a.openingBalance)))}`}
                        {a.id === defaultCash && <> · <span className="text-ink-soft">built-in</span></>}
                      </span>
                    </span>
                    <span className={`text-[15px] font-bold tnum ${bal.isNegative() ? 'text-danger' : ''}`}>
                      {mask(fmt.money(bal))}
                    </span>
                    <span className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setAdding(false); setEditing(a); }}
                        aria-label={`Edit ${a.name}`}
                        className="focus-ring p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent-soft transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => void removeAccount(a)}
                        aria-label={`Remove ${a.name}`}
                        className="focus-ring p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger-soft transition-colors"
                      >
                        {(postingCount.get(a.id) ?? 0) > 0 ? <Archive size={15} /> : <Trash2 size={15} />}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </StaggerItem>
      ))}

      {accounts.some((a) => a.archived) && (
        <StaggerItem>
          <p className="text-[12.5px] text-muted">
            {accounts.filter((a) => a.archived).length} archived account
            {accounts.filter((a) => a.archived).length === 1 ? '' : 's'} hidden. Their past transactions still count.
          </p>
        </StaggerItem>
      )}
    </Stagger>
  );
}

/* -------------------------------------------------------------------------- */

function AccountForm({ editing, vaultId, onDone }: {
  editing: Account | null; vaultId: string; onDone: () => void;
}) {
  const put = useApp((s) => s.put);
  const [name, setName] = useState(editing?.name ?? '');
  const [subtype, setSubtype] = useState<MoneySubtype>(
    editing?.subtype === 'cash' ? 'cash' : 'bank',
  );
  const [opening, setOpening] = useState(
    editing && !D(editing.openingBalance).isZero() ? D(editing.openingBalance).toString() : '',
  );

  const openingNum = parseFloat(opening);
  const valid = name.trim().length > 0 && (opening === '' || (!isNaN(openingNum) && openingNum >= 0));

  const save = async () => {
    if (!valid) return;
    await put(STORE.account, {
      // Spread first so `archived`, `currency` and anything else this form does
      // not surface survives an edit.
      ...(editing ?? {}),
      id: editing?.id ?? uid(),
      vaultId,
      name: name.trim(),
      type: 'asset',
      subtype,
      // A natural magnitude: the ledger derives the sign from the account type,
      // so the form must never ask for one.
      openingBalance: opening === '' ? '0' : D(openingNum).toString(),
    } as Account & { id: string } & Record<string, unknown>);
    onDone();
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-3 mb-5">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
          {editing ? `Edit ${editing.name}` : 'Add an account'}
        </h3>
        <button onClick={onDone} aria-label="Close" className="ml-auto focus-ring p-1.5 rounded-lg text-muted hover:text-ink hover:bg-fill transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC Salary" />
        </Field>
        <Field label="Kind">
          <Segmented options={SUBTYPE_OPTIONS} value={subtype} onChange={setSubtype} />
        </Field>
        <Field label="Balance today" hint="What the account holds right now. Transactions move it from here.">
          <NumberInput value={opening} onChange={(v) => setOpening(v)} placeholder="0" />
        </Field>
      </div>

      {editing && (
        <p className="mt-4 text-[12px] text-muted leading-relaxed">
          Changing the balance restates history: it shifts this account&rsquo;s current balance by the same amount,
          because everything recorded against it is measured from here.
        </p>
      )}

      <div className="flex gap-2 mt-5 flex-wrap">
        <Button onClick={() => void save()} disabled={!valid}>{editing ? 'Save changes' : 'Add account'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        {editing?.archived && <Chip tone="warning" className="ml-auto self-center">Archived</Chip>}
      </div>
    </GlassCard>
  );
}
