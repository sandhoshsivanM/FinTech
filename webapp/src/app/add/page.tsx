'use client';
import { useEffect, useMemo, useState, type ElementType } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse, Clapperboard,
  Landmark, Wallet, TrendingUp, Shapes, Sparkles, X,
} from 'lucide-react';
import { useApp, uid, cashAcctId, lsGet, lsSet, LAST_ACCOUNT_KEY } from '@/lib/store';
import { D } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { STORE, type TxnType } from '@/lib/types';
import { moneyAccounts } from '@/domain/accountLedger';
import { parseQuickAdd } from '@/domain/nlp';
import {
  GlassCard, PageIntro, Button, Segmented, Field, Input, Select,
} from '@/components/ui';
import { DateInput } from '@/components/DateInput';
import { NumberInput } from '@/components/NumberInput';

// ---- Icon map: category.icon string → lucide component ----
const ICON_MAP: Record<string, ElementType> = {
  Utensils, Bus, Home, Zap, ShoppingBag, HeartPulse,
  Clapperboard, Landmark, Wallet, TrendingUp, Shapes,
};

function CatIcon({ name, size = 18 }: { name?: string | null; size?: number }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Shapes;
  return <Icon size={size} />;
}

/**
 * Expense, income, or a move between your own accounts.
 *
 * Transfer is a mode here but NOT a `TxnType` — it saves a `Transfer` record,
 * which is a separate entity precisely so budgets, reports and the health score
 * can never mistake moving money for spending it. See the type's doc comment.
 */
type Mode = TxnType | 'transfer';

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

export default function AddTransactionPage() {
  const router = useRouter();
  const categories = useApp((s) => s.categories);
  const accounts = useApp((s) => s.accounts);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const vaultId = useApp((s) => s.vaultId);
  const put = useApp((s) => s.put);
  const fmt = useFmt();

  const money = useMemo(() => moneyAccounts(accounts), [accounts]);

  // Form state
  const [mode, setMode] = useState<Mode>('expense');
  const type: TxnType = mode === 'transfer' ? 'expense' : mode;
  const [amountRaw, setAmountRaw] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attachmentRef, setAttachmentRef] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const putAttachment = useApp((s) => s.putAttachment);
  const del = useApp((s) => s.del);

  // Default to whichever account was used last: most people spend from the same
  // one most days, and re-picking it every time is the kind of friction that
  // stops a transaction being recorded at all.
  useEffect(() => {
    if (accountId || money.length === 0) return;
    const remembered = lsGet(LAST_ACCOUNT_KEY);
    setAccountId(money.some((a) => a.id === remembered) ? remembered! : money[0].id);
  }, [money, accountId]);

  // Quick-add state
  const [quickText, setQuickText] = useState('');
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Edit mode: prefill from ?id= (read off the URL to avoid Suspense constraints)
  const [editId, setEditId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const state = useApp.getState();
    const t = state.txns.find((x) => x.id === id);
    if (t) {
      setEditId(id);
      setMode(t.type);
      setAmountRaw(String(t.amount));
      setCategoryId(t.categoryId);
      setMerchant(t.merchant ?? '');
      setNote(t.note ?? '');
      setDate(new Date(t.date).toISOString().slice(0, 10));
      setCreatedAt(t.createdAt ?? Date.now());
      setAttachmentRef(t.attachmentRef ?? null);
      if (t.accountId) setAccountId(t.accountId);
      return;
    }
    const tr = state.transfers.find((x) => x.id === id);
    if (!tr) return;
    setEditId(id);
    setMode('transfer');
    setAmountRaw(String(tr.amount));
    setAccountId(tr.fromAccountId);
    setToAccountId(tr.toAccountId);
    setNote(tr.note ?? '');
    setDate(new Date(tr.date).toISOString().slice(0, 10));
    setCreatedAt(tr.createdAt ?? Date.now());
  }, []);

  /**
   * A receipt is stored as an encrypted record and referenced by id.
   *
   * This used to be `try { … } finally { … }` with no `catch`, invoked without
   * `await` from the change handler — so a locked vault or a storage quota
   * error became an unhandled rejection, the spinner cleared, and the screen
   * reported nothing at all. The user saved a transaction believing the
   * receipt was on it (§6.2: no silent success state).
   */
  async function handleAttach(file: File | undefined) {
    if (!file) return;
    setAttachError(null);

    if (!file.type.startsWith('image/')) {
      setAttachError('That is not an image. Attach a photo or a scan of the receipt.');
      return;
    }
    // Base64 inflates by a third and the whole thing lives in one encrypted
    // record, which also rides along in every future backup.
    if (file.size > MAX_RECEIPT_BYTES) {
      setAttachError(
        `That image is ${(file.size / 1_048_576).toFixed(1)} MB. Receipts are limited to ${MAX_RECEIPT_MB} MB so backups stay a manageable size.`,
      );
      return;
    }

    setAttaching(true);
    try {
      const next = await putAttachment(file);
      // Replacing a receipt used to abandon the previous blob in the vault:
      // unreachable, uncounted, and still inflating every export.
      if (attachmentRef) await del(STORE.attachment, attachmentRef);
      setAttachmentRef(next);
    } catch (e) {
      setAttachError(
        e instanceof Error ? `Could not save that receipt: ${e.message}` : 'Could not save that receipt.',
      );
    } finally {
      setAttaching(false);
    }
  }

  async function handleRemoveAttachment() {
    const ref = attachmentRef;
    setAttachmentRef(null);
    setAttachError(null);
    if (ref) {
      try {
        await del(STORE.attachment, ref);
      } catch {
        // The reference is already gone from the form, so the receipt will not
        // be saved onto the transaction either way. A stranded blob is caught
        // by the orphan-attachment check in Diagnostics.
      }
    }
  }

  // Derived
  const amountNum = parseFloat(amountRaw.replace(/,/g, ''));
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  // A transfer to the account it came from is not a transfer. Blocking it here
  // keeps a no-op pair of postings out of the ledger.
  const sameAccount = mode === 'transfer' && !!accountId && accountId === toAccountId;
  const canSave = amountValid && !saving
    && (mode !== 'transfer' || (!!accountId && !!toAccountId && !sameAccount));
  // Neutral for a transfer: it is neither a gain nor a loss, and painting it
  // red would say the opposite of what the entity exists to express.
  const amountColor = mode === 'transfer' ? 'var(--ink)'
    : type === 'income' ? 'var(--income)' : 'var(--expense)';

  function handleQuickParse() {
    const parsed = parseQuickAdd(quickText, categories.map((c) => c.name));
    if (parsed.amount) setAmountRaw(parsed.amount);
    setMode(parsed.type);
    if (parsed.merchant) setMerchant(parsed.merchant);
    if (parsed.note) setNote(parsed.note);
    if (parsed.categoryName) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === parsed.categoryName!.toLowerCase(),
      );
      if (match) setCategoryId(match.id);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const amount = String(D(amountRaw.replace(/,/g, '')).toFixed(2));
      if (mode === 'transfer') {
        await put(STORE.transfer, {
          id: editId ?? uid(),
          vaultId,
          amount,
          fromAccountId: accountId,
          toAccountId,
          date: new Date(date).getTime(),
          note: note.trim() || null,
          createdAt,
        });
      } else {
        await put(STORE.txn, {
          id: editId ?? uid(),
          vaultId,
          amount,
          type,
          categoryId,
          merchant: merchant.trim() || null,
          note: note.trim() || null,
          date: new Date(date).getTime(),
          createdAt,
          attachmentRef,
          accountId: accountId || cashAcctId(activeProfileId),
        });
        if (accountId) lsSet(LAST_ACCOUNT_KEY, accountId);
      }
      router.push(editId ? '/transactions' : '/dashboard');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageIntro
        title={editId
          ? (mode === 'transfer' ? 'Edit Transfer' : 'Edit Transaction')
          : 'Add Transaction'}
        action={
          <Button variant="ghost" onClick={() => router.back()}>
            <X size={16} /> Cancel
          </Button>
        }
      />

      {/* Quick-add bar. Parses spend/earn phrasing only, so it has nothing to
          offer a transfer. */}
      {mode !== 'transfer' && (
      <GlassCard>
        <p className="text-xs font-semibold text-ink-soft mb-2">Quick add</p>
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="e.g. spent 450 on groceries at bigbasket"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickParse()}
          />
          <Button variant="soft" onClick={handleQuickParse} disabled={!quickText.trim()}>
            <Sparkles size={15} /> Parse
          </Button>
        </div>
      </GlassCard>
      )}

      <GlassCard className="space-y-5">
        {/* Expense / Income / Transfer toggle */}
        <div className="flex justify-center">
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </div>

        {/* Big amount input */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span
              className="text-4xl font-extrabold font-display"
              style={{ color: amountColor }}
            >
              {fmt.symbol}
            </span>
            <NumberInput
              placeholder="0.00"
              value={amountRaw}
              onChange={setAmountRaw}
              className="text-4xl font-extrabold font-display w-52 bg-transparent outline-none tnum text-center"
              style={{ color: amountColor }}
              aria-label="Amount"
            />
          </div>
          {amountRaw && !amountValid && (
            <p className="text-xs text-expense">Enter a valid amount</p>
          )}
          <p className="text-[11px] text-muted">Amount is stored in INR</p>
        </div>

        {/* Transfer takes two accounts where the others take a category: money
            moving between your own accounts has no category, and offering one
            would invite filing it as spending. */}
        {mode === 'transfer' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="From account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Choose an account…</option>
                {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="To account" hint={sameAccount ? 'Pick a different account' : undefined}>
              <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Choose an account…</option>
                {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            {money.length < 2 && (
              <p className="sm:col-span-2 text-[12.5px] text-muted leading-relaxed">
                A transfer needs two accounts. <Link href="/accounts" className="text-accent font-semibold">Add another</Link> first.
              </p>
            )}
          </div>
        ) : (
        <div>
          <p className="text-xs font-semibold text-ink-soft mb-2">Category</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {categories.map((cat) => {
              const selected = categoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className="flex flex-col items-center gap-1 p-2 rounded-[14px] border transition text-xs font-medium"
                  style={{
                    background: selected ? 'var(--accent)' : 'var(--surface-2)',
                    borderColor: selected ? 'var(--accent)' : 'var(--line)',
                    color: selected ? '#fff' : 'var(--ink)',
                    boxShadow: selected ? '0 4px 12px color-mix(in srgb, var(--accent) 30%, transparent)' : undefined,
                  }}
                  aria-pressed={selected}
                >
                  <span
                    className="w-8 h-8 rounded-[10px] grid place-items-center"
                    style={{
                      background: selected ? 'rgba(255,255,255,0.25)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
                      color: selected ? '#fff' : 'var(--accent)',
                    }}
                  >
                    <CatIcon name={cat.icon} size={16} />
                  </span>
                  <span className="truncate w-full text-center leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Fields row */}
        <div className="grid sm:grid-cols-2 min-[900px]:grid-cols-4 gap-3">
          {mode !== 'transfer' && (
            <Field label="Account" hint={money.length === 0 ? 'Add one on the Accounts page' : undefined}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={money.length === 0}>
                {money.length === 0 && <option value="">Cash</option>}
                {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
          {mode !== 'transfer' && (
            <Field label="Merchant (optional)">
              <Input
                placeholder="e.g. BigBasket"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
              />
            </Field>
          )}
          <Field label="Note (optional)">
            <Input
              placeholder={mode === 'transfer' ? 'e.g. Monthly emergency-fund top-up' : 'e.g. Weekly groceries'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>

        {/* Receipt attachment (encrypted, stored on-device). Not offered for a
            transfer — there is no receipt for moving your own money. */}
        {mode !== 'transfer' && (
        <Field label="Receipt (optional)">
          {attachmentRef ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-income font-medium">Receipt attached</span>
              <Button variant="ghost" onClick={() => { void handleRemoveAttachment(); }}>
                <X size={14} /> Remove
              </Button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/*"
              disabled={attaching}
              onChange={(e) => { void handleAttach(e.target.files?.[0]); }}
              className="text-sm"
              aria-label="Attach receipt image"
            />
          )}
          {attachError && (
            <p role="alert" className="mt-1.5 text-xs" style={{ color: 'var(--expense)' }}>
              {attachError}
            </p>
          )}
        </Field>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-1">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? 'Saving…'
              : mode === 'transfer' ? (editId ? 'Update Transfer' : 'Save Transfer')
                : editId ? 'Update Transaction' : 'Save Transaction'}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
