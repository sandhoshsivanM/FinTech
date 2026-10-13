'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, Building2, CreditCard, Wifi } from 'lucide-react';
import clsx from 'clsx';
import type Decimal from 'decimal.js';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { accountBalances, MONEY_SUBTYPES } from '@/domain/accountLedger';
import { ZERO } from '@/lib/money';
import type { Account } from '@/lib/types';
import { motion, SPRING_SOFT } from '../motion';

const KIND: Record<string, { label: string; icon: typeof Banknote }> = {
  cash: { label: 'Cash account', icon: Banknote },
  bank: { label: 'Bank account', icon: Building2 },
  credit_card: { label: 'Credit card', icon: CreditCard },
};

/** Accounts that look like something you carry: bank, cash and credit cards. */
export function walletAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archived && (
    (a.type === 'asset' && (MONEY_SUBTYPES as readonly string[]).includes(a.subtype))
    || (a.type === 'liability' && a.subtype === 'credit_card')
  ));
}

/** How far a card must be flung, in px, before it counts as a swipe. */
const SWIPE = 60;
/** Cards visible behind the front one. */
const DEPTH = 2;

/**
 * "My wallet": a deck of account cards. Swipe the front card sideways (or tap
 * a dot) to bring the next one forward; the cards behind peek out to the right.
 *
 * The dots are real buttons, so the deck works without a drag gesture — for a
 * keyboard, a switch device, or reduced motion.
 */
export function WalletStack() {
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const [front, setFront] = useState(0);

  const balances = useMemo(() => accountBalances(accounts, postings), [accounts, postings]);
  // Fullest account in front, so the deck never leads with an empty wallet.
  const cards = useMemo(
    () => walletAccounts(accounts).sort((a, b) => (balances.get(b.id) ?? ZERO).cmp(balances.get(a.id) ?? ZERO)),
    [accounts, balances],
  );

  if (cards.length === 0) return null;
  const n = cards.length;
  const go = (d: number) => setFront((f) => (f + d + n) % n);

  return (
    <section aria-label="My wallet">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">My wallet</h2>
        <Link href="/accounts" className="text-[12.5px] font-semibold text-accent">Manage</Link>
      </div>

      <div className="relative h-[168px] mr-8">
        {cards.map((a, i) => {
          const depth = (i - front + n) % n;
          if (depth > DEPTH) return null;
          const isFront = depth === 0;
          return (
            <motion.div
              key={a.id}
              data-testid="wallet-card"
              aria-hidden={!isFront}
              className="absolute inset-0"
              style={{ zIndex: DEPTH + 1 - depth }}
              initial={false}
              animate={{ x: depth * 16, scale: 1 - depth * 0.07, opacity: 1 - depth * 0.25 }}
              transition={SPRING_SOFT}
              drag={isFront && n > 1 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => {
                if (info.offset.x < -SWIPE) go(1);
                else if (info.offset.x > SWIPE) go(-1);
              }}
            >
              <WalletCard account={a} balance={balances.get(a.id) ?? ZERO} hidden={ghost} money={fmt.money} />
            </motion.div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Choose card">
          {cards.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={i === front}
              aria-label={a.name}
              onClick={() => setFront(i)}
              className="focus-ring p-1 rounded-full"
            >
              <span
                className={clsx(
                  'block h-1.5 rounded-full transition-all duration-300',
                  i === front ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function WalletCard({
  account, balance, hidden, money,
}: { account: Account; balance: Decimal; hidden: boolean; money: (v: Decimal.Value) => string }) {
  const kind = KIND[account.subtype] ?? KIND.bank;
  const Icon = kind.icon;
  // Balances are debit-signed: a credit card in use is negative, i.e. owed.
  const owed = account.type === 'liability';
  const shown = owed ? balance.neg() : balance;
  return (
    <div className="wallet-card h-full p-5 flex flex-col cursor-grab active:cursor-grabbing select-none">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-8 h-8 rounded-full bg-white/10">
          <Icon size={16} />
        </span>
        <span className="font-semibold text-[14px] truncate">{account.name}</span>
        <Wifi size={18} className="ml-auto rotate-90 opacity-60" aria-hidden />
      </div>
      <div className="mt-auto">
        <div className="text-[11px] uppercase tracking-[0.12em] text-white/55">
          {owed ? 'Outstanding' : kind.label}
        </div>
        <div className="mt-0.5 text-[24px] font-bold tracking-[-0.03em] tnum">
          {hidden ? '••••••' : money(shown)}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-white/50 tnum">
        <span>{account.currency ?? 'INR'}</span>
        <span className="flex -space-x-2" aria-hidden>
          <span className="w-5 h-5 rounded-full bg-[var(--accent-glow)] opacity-90" />
          <span className="w-5 h-5 rounded-full bg-white/40" />
        </span>
      </div>
    </div>
  );
}
