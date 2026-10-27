'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { PiggyBank } from 'lucide-react';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { useNow } from '@khazana/screens/lib/useNow';
import { ZERO } from '@khazana/domain/money';
import { currentMonth, monthName, type DateRange } from '@khazana/domain/period';
import { budgetRollover, evaluateBudget, spentForCategory } from '@khazana/domain/finance';
import { GlassCard } from '@khazana/ui/ui';
import { CardTitle } from '@khazana/ui/Hint';
import { Gauge, gaugeHue } from '@khazana/ui/home/depth';
import { CategoryIcon } from '@khazana/ui/CategoryIcon';

/**
 * This month's budgets at a glance: one ring for the total, then the three
 * categories closest to their limit.
 */
export function BudgetRingCard({ month: picked }: { month?: DateRange }) {
  const budgets = useApp((s) => s.budgets);
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const now = useNow(60_000);

  const data = useMemo(() => {
    const month = picked ?? currentMonth(now || undefined);
    const rows = budgets.map((b) => evaluateBudget(b, spentForCategory(txns, b.categoryId, month), budgetRollover(b, txns, month)));
    const spent = rows.reduce((s, r) => s.plus(r.spent), ZERO);
    const limit = rows.reduce((s, r) => s.plus(r.limit), ZERO);
    const top = [...rows].sort((a, b) => b.ratio - a.ratio).slice(0, 3);
    return { spent, limit, top, pct: limit.isZero() ? 0 : spent.div(limit).toNumber() * 100 };
  }, [budgets, txns, now, picked]);

  if (budgets.length === 0) {
    return (
      <Link href="/budget" className="block">
        <GlassCard interactive className="flex items-center gap-4">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-[color-mix(in_srgb,var(--data-blue)_14%,transparent)] text-[var(--data-blue)] shrink-0">
            <PiggyBank size={20} />
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-[14px]">Set a monthly budget</span>
            <span className="block text-[12px] text-muted">See how much is left at a glance.</span>
          </span>
        </GlassCard>
      </Link>
    );
  }

  // Looking back at another month: say which one, rather than "this month".
  const isPast = !!picked && !!now && (now < picked.start || now > picked.end);
  const cat = (id: string) => categories.find((c) => c.id === id);
  const mask = (v: string) => (ghost ? '••••' : v);

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between mb-3">
        <CardTitle info="dashboard.budgetThisMonth" className="text-[17px] font-medium tracking-[-0.01em]">{isPast ? `Budget · ${monthName(picked!.start)}` : 'Budget this month'}</CardTitle>
        <Link href="/budget" className="text-[12.5px] font-semibold text-ink-soft">Details</Link>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-light tracking-[-0.03em] leading-none tnum">{mask(fmt.money(data.spent))}</span>
        <span className="chip text-[var(--data-blue)] tnum">{Math.round(data.pct)}% used</span>
      </div>
      <p className="mt-1.5 text-[12.5px] text-muted tnum">of {mask(fmt.money(data.limit))} budgeted</p>

      <ul className="tray mt-3 grid gap-3.5 p-3">
        {data.top.map((r) => {
          const c = cat(r.budget.categoryId);
          return (
            <li key={r.budget.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 min-w-0">
                  <CategoryIcon name={c?.icon} size={24} />
                  <span className="truncate">{c?.name ?? 'Uncategorized'}</span>
                </span>
                <span className="tnum font-semibold whitespace-nowrap">
                  {mask(fmt.money(r.spent))}
                  <span className="font-normal text-muted"> / {mask(fmt.money(r.limit))}</span>
                </span>
              </div>
              <Gauge fraction={r.ratio} hue={gaugeHue(r.ratio)} />
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
