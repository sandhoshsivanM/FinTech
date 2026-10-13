'use client';
import Link from 'next/link';
import clsx from 'clsx';
import { Minus, Plus, ArrowLeftRight, FileDown, type LucideIcon } from 'lucide-react';
import { motion, popIn, stagger, tap } from '../motion';

const ACTIONS: { href: string; label: string; icon: LucideIcon; primary?: boolean }[] = [
  { href: '/add', label: 'Expense', icon: Minus, primary: true },
  { href: '/add?mode=income', label: 'Income', icon: Plus },
  { href: '/add?mode=transfer', label: 'Transfer', icon: ArrowLeftRight },
  { href: '/import', label: 'Import', icon: FileDown },
];

/**
 * The shortcuts under the balance: plain round buttons. The primary one is
 * the near-black pill; the rest are white circles with a soft shadow.
 */
export function QuickActions() {
  return (
    <motion.ul variants={stagger} initial="hidden" animate="show" className="grid grid-cols-4 gap-2" aria-label="Quick actions">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <motion.li key={a.href} variants={popIn} className="flex justify-center">
            <motion.div {...tap}>
              <Link href={a.href} className="focus-ring flex flex-col items-center gap-1.5 rounded-[var(--radius-card)] p-1">
                <span
                  aria-hidden
                  className={clsx(
                    'grid place-items-center w-[54px] h-[54px] rounded-full',
                    a.primary
                      ? 'bg-[var(--home-pill)] text-[var(--home-pill-ink)] shadow-[0_8px_16px_-8px_rgba(0,0,0,0.55)]'
                      : 'bg-card-2 text-ink shadow-[0_3px_10px_-4px_rgba(0,0,0,0.2)]',
                  )}
                >
                  <Icon size={20} strokeWidth={2} />
                </span>
                <span className="text-[11.5px] text-ink-soft">{a.label}</span>
              </Link>
            </motion.div>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
