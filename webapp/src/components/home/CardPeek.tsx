'use client';
import { useMemo } from 'react';
import { useApp } from '@/lib/store';
import { walletAccounts } from './WalletStack';

/** Dark card finishes, the same family as the wallet stack. Not on the home since the stack came back. */
const FACES = [
  'linear-gradient(180deg, #1E3A2F, #0A120E)',
  'linear-gradient(180deg, #22324A, #0B1220)',
  'linear-gradient(180deg, #3A2F1C, #120E08)',
];

/**
 * The edges of the wallet cards, peeking in at the header's right edge: a
 * glance says "your cards are here" without spending a block of the screen.
 * Tapping scrolls to the deck itself rather than leaving the page.
 */
export function CardPeek() {
  const accounts = useApp((s) => s.accounts);
  const cards = useMemo(() => walletAccounts(accounts).slice(0, 3), [accounts]);
  if (cards.length === 0) return null;

  return (
    <button
      type="button"
      aria-label={`Show my wallet (${cards.length} card${cards.length === 1 ? '' : 's'})`}
      onClick={() => document.getElementById('wallet')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className="focus-ring absolute right-0 top-2 h-[104px] w-[52px]"
    >
      {cards.map((a, i) => (
        <span
          key={a.id}
          aria-hidden
          className="absolute top-0 h-full w-[26px] rounded-l-[12px] border-y border-l border-white/10 shadow-[-6px_0_14px_-6px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-standard"
          style={{
            right: i * 11,
            zIndex: cards.length - i,
            background: FACES[i % FACES.length],
            transform: `translateY(${i * 6}px) scaleY(${1 - i * 0.06})`,
          }}
        />
      ))}
    </button>
  );
}
