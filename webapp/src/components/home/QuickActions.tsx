'use client';
import Link from 'next/link';
import { Minus, Plus, ArrowLeftRight, FileDown, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { motion, popIn, stagger, tap } from '../motion';

const ACTIONS: { href: string; label: string; icon: LucideIcon; primary?: boolean }[] = [
  { href: '/add', label: 'Expense', icon: Minus, primary: true },
  { href: '/add?mode=income', label: 'Income', icon: Plus },
  { href: '/add?mode=transfer', label: 'Transfer', icon: ArrowLeftRight },
  { href: '/import', label: 'Import', icon: FileDown },
];

/** The round shortcut buttons under the balance. Pop in one after another. */
export function QuickActions() {
  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-4 gap-2"
      aria-label="Quick actions"
    >
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        return (
          <motion.li key={a.href} variants={popIn} className="flex justify-center">
            <motion.div {...tap}>
              <Link href={a.href} className="focus-ring flex flex-col items-center gap-1.5 rounded-[var(--radius-card)] p-1">
                <span
                  className={clsx(
                    'grid place-items-center w-[52px] h-[52px] rounded-full transition-shadow',
                    a.primary
                      ? 'bg-primary text-primary-fg shadow-[var(--shadow-glow)]'
                      : 'bg-card border border-line text-ink',
                  )}
                >
                  <Icon size={20} strokeWidth={2} />
                </span>
                <span className="text-[11.5px] font-medium text-ink-soft">{a.label}</span>
              </Link>
            </motion.div>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
