'use client';
import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, Building2, CreditCard, Wifi } from 'lucide-react';
import clsx from 'clsx';
import type Decimal from 'decimal.js';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { accountBalances, MONEY_SUBTYPES } from '@khazana/domain/accountLedger';
import { ZERO } from '@khazana/domain/money';
import type { Account } from '@khazana/domain/types';
import { motion, SPRING_SOFT } from '@khazana/ui/motion';
import { CardTitle } from '@khazana/ui/Hint';

/**
 * Per account type: a label and a card finish. The card is dark in both
 * themes (like a real one), so these are fixed colours rather than tokens;
 * the accent glow on top keeps them in the user's chosen palette.
 */
const KIND: Record<string, { label: string; icon: typeof Banknote; finish: string }> = {
  bank: {
    label: 'Bank account', icon: Building2,
    finish: 'linear-gradient(135deg, #1E3A2F 0%, #0F1F18 55%, #0A120E 100%)',
  },
  cash: {
    label: 'Cash', icon: Banknote,
    finish: 'linear-gradient(135deg, #3A2F1C 0%, #1F190F 55%, #120E08 100%)',
  },
  credit_card: {
    label: 'Credit card', icon: CreditCard,
    finish: 'linear-gradient(135deg, #2A2547 0%, #17142B 55%, #0D0B1A 100%)',
  },
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
/** `anchorId` lets one instance (the phone home's) be a scroll target without the desktop twin duplicating the id. */
export function WalletStack({ anchorId }: { anchorId?: string } = {}) {
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
    <section id={anchorId} aria-label="My wallet" className="card scroll-mt-24 px-4 pt-4 pb-3">
      <div className="flex items-baseline justify-between mb-3">
        <CardTitle info="dashboard.myWallet" className="fs-16 font-medium tracking-[-0.01em]">My wallet</CardTitle>
        <Link href="/accounts" className="fs-12.5 font-semibold text-ink-soft">Manage</Link>
      </div>

      {/* ISO ID-1 proportions (85.6 × 54 mm), so it reads as a card. The
          right margin leaves room for the cards behind to fan out. */}
      <div className="relative mr-7 aspect-[1.586/1]">
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
              style={{ zIndex: DEPTH + 1 - depth, transformOrigin: '100% 50%' }}
              initial={false}
              animate={{ x: depth * 13, scale: 1 - depth * 0.08, opacity: 1 - depth * 0.2 }}
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
                  i === front ? 'w-5 bg-[var(--data-blue)]' : 'w-1.5 bg-[color-mix(in_srgb,var(--ink)_22%,transparent)]',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Text on a decorative card. When the card duplicates figures shown elsewhere
 * (the accounts list), the words are painted from a data attribute so they are
 * not a second copy in the DOM text — the card is aria-hidden either way.
 */
function T({ text, decorative }: { text: string; decorative?: boolean }) {
  return decorative
    ? <span data-text={text} className="before:content-[attr(data-text)]" />
    : <>{text}</>;
}

/** One account as a payment card. Also used, without the swipe, on Accounts. */
export function WalletCard({
  account, balance, hidden, money, decorative = false,
}: { account: Account; balance: Decimal; hidden: boolean; money: (v: Decimal.Value) => string; decorative?: boolean }) {
  const kind = KIND[account.subtype] ?? KIND.bank;
  const Icon = kind.icon;
  // Balances are debit-signed: a credit card in use is negative, i.e. owed.
  const owed = account.type === 'liability';
  const shown = owed ? balance.neg() : balance;
  return (
    <div
      className="wallet-card h-full p-5 flex flex-col cursor-grab active:cursor-grabbing select-none"
      style={{ background: kind.finish }}
    >
      {/* The accent glow, top right, over the type's base finish. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 w-48 h-48 rounded-full opacity-[0.12] blur-2xl"
        style={{ background: 'var(--accent-glow)' }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold fs-15 leading-tight truncate"><T text={account.name} decorative={decorative} /></div>
          <div className="mt-0.5 flex items-center gap-1.5 fs-10.5 uppercase tracking-[0.14em] text-white/55">
            <Icon size={12} aria-hidden />
            <T text={owed ? 'Outstanding' : kind.label} decorative={decorative} />
          </div>
        </div>
        <Wifi size={20} className="shrink-0 rotate-90 text-white/70" aria-hidden />
      </div>

      <div className="relative mt-3 flex items-center gap-3">
        <Chip />
      </div>

      <div className="relative mt-auto">
        <div className="fs-25 font-semibold tracking-[-0.02em] tnum leading-none">
          <T text={hidden ? '••••••' : money(shown)} decorative={decorative} />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          {/* Masked, and deliberately not a made-up number: the vault holds no
              card numbers, so none is shown. */}
          <span className="fs-13 tracking-[0.22em] text-white/60 tnum" aria-hidden>
            •••• •••• ••••
          </span>
          <span className="flex -space-x-2.5" aria-hidden>
            <span className="w-6 h-6 rounded-full bg-[var(--accent-glow)] opacity-90" />
            <span className="w-6 h-6 rounded-full bg-white/45 mix-blend-screen" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** An EMV contact chip, drawn rather than imported. */
function Chip() {
  // Unique per instance: the dashboard mounts the phone and desktop homes
  // together (one hidden), and a shared id resolves to the hidden copy's
  // gradient, which never paints — leaving the chip as a bare outline.
  const gid = `kz-chip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg width="38" height="28" viewBox="0 0 38 28" aria-hidden className="drop-shadow-sm">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F2D98C" />
          <stop offset="0.5" stopColor="#C9A24A" />
          <stop offset="1" stopColor="#E8CB78" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="37" height="27" rx="5" fill={`url(#${gid})`} stroke="rgba(0,0,0,0.25)" />
      <path d="M0.5 9.5h11M0.5 18.5h11M26.5 9.5h11M26.5 18.5h11M11.5 0.5v27M26.5 0.5v27M11.5 14h15"
        stroke="rgba(80,55,10,0.45)" strokeWidth="1" fill="none" />
    </svg>
  );
}
