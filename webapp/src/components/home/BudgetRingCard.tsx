'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { PiggyBank } from 'lucide-react';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { useNow } from '@/lib/useNow';
import { ZERO } from '@/lib/money';
import { currentMonth } from '@/domain/period';
import { budgetRollover, evaluateBudget, spentForCategory } from '@/domain/finance';
import { GlassCard, ProgressBar, Ring } from '../ui';
import { AnimatedNumber } from '../motion';
import { CategoryIcon } from '../CategoryIcon';

/** Ring colour by how much of the month's budget is gone. */
const zone = (pct: number) => (pct > 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--accent)');

/**
 * This month's budgets at a glance: one ring for the total, then the three
 * categories closest to their limit.
 */
export function BudgetRingCard() {
  const budgets = useApp((s) => s.budgets);
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const now = useNow(60_000);

  const data = useMemo(() => {
    const month = currentMonth(now || undefined);
    const rows = budgets.map((b) => evaluateBudget(b, spentForCategory(txns, b.categoryId, month), budgetRollover(b, txns, month)));
    const spent = rows.reduce((s, r) => s.plus(r.spent), ZERO);
    const limit = rows.reduce((s, r) => s.plus(r.limit), ZERO);
    const top = [...rows].sort((a, b) => b.ratio - a.ratio).slice(0, 3);
    return { spent, limit, top, pct: limit.isZero() ? 0 : spent.div(limit).toNumber() * 100 };
  }, [budgets, txns, now]);

  if (budgets.length === 0) {
    return (
      <Link href="/budget" className="block">
        <GlassCard interactive className="flex items-center gap-4">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-accent-soft text-accent shrink-0">
            <PiggyBank size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-[14px]">Set a monthly budget</span>
            <span className="block text-[12px] text-muted">See how much is left at a glance.</span>
          </span>
        </GlassCard>
      </Link>
    );
  }

  const cat = (id: string) => categories.find((c) => c.id === id);
  const mask = (s: string) => (ghost ? '••••' : s);

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Budget this month</h2>
        <Link href="/budget" className="text-[12.5px] font-semibold text-accent">Details</Link>
      </div>
      <div className="flex items-center gap-5">
        <Ring fraction={data.pct / 100} size={112} stroke={12} color={zone(data.pct)}>
          <div>
            <div className="text-[22px] font-bold tracking-[-0.03em] tnum leading-none">
              <AnimatedNumber value={Math.round(data.pct)} format={(n) => `${Math.round(n)}%`} />
            </div>
            <div className="text-[10.5px] text-muted mt-1">used</div>
          </div>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-muted">Spent</div>
          <div className="text-[18px] font-semibold tnum">{mask(fmt.money(data.spent))}</div>
          <div className="text-[12px] text-muted mt-1">
            of {mask(fmt.money(data.limit))}
          </div>
        </div>
      </div>
      <ul className="mt-5 grid gap-3">
        {data.top.map((r) => {
          const c = cat(r.budget.categoryId);
          return (
            <li key={r.budget.id} className="flex items-center gap-3">
              <CategoryIcon name={c?.icon} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-[12.5px] mb-1">
                  <span className="truncate font-medium">{c?.name ?? 'Uncategorized'}</span>
                  <span className="text-muted tnum">{Math.round(r.ratio * 100)}%</span>
                </div>
                <ProgressBar fraction={r.fraction} height={6} />
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
