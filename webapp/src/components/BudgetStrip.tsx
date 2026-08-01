'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, PieChart } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { D } from '@/lib/money';
import { evaluateBudget, monthRange, spentForCategory } from '@/domain/finance';
import { GlassCard } from '@/components/ui';

const MAX_SHOWN = 3;

/**
 * The three budgets closest to their limit, above the transaction list. The web
 * twin of `lib/features/transactions/widgets/budget_strip.dart`.
 *
 * This is how Budget stays reachable from the phone bottom bar. It also puts the
 * consequence next to the action: the moment you are about to log a spend is the
 * moment "Food is at 92%" is worth knowing, which is not true on a separate page
 * you have to remember to visit.
 *
 * Renders nothing when no budgets exist — an empty strip would be a permanent
 * blank band for every user who has not set one.
 */
export function BudgetStrip() {
  const budgets = useApp((s) => s.budgets);
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const [open, setOpen] = useState(true);

  const ranked = useMemo(() => {
    const [first, last] = monthRange();
    return budgets
      .map((b) => {
        const spent = spentForCategory(txns, b.categoryId, first, last);
        const limit = D(b.amountLimit);
        return {
          budget: b,
          progress: evaluateBudget(b, spent),
          spent,
          limit,
          // Uncapped: BudgetProgress.fraction clamps to 1 for the bar, so
          // ranking by it would tie every overspent budget together.
          ratio: limit.lte(0) ? 0 : spent.div(limit).toNumber(),
        };
      })
      // Ranked by closeness to the limit, not by size — a ₹500 budget at 98%
      // needs attention more than a ₹50,000 one at 20%.
      .sort((a, b) => b.ratio - a.ratio);
  }, [budgets, txns]);

  if (ranked.length === 0) return null;

  const byId = new Map(categories.map((c) => [c.id, c.name]));
  const overCount = ranked.filter((r) => r.ratio > 1).length;
  const money = (v: Parameters<typeof fmt.money>[0]) => (ghost ? '••••' : fmt.money(v));

  return (
    <GlassCard className="p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ring w-full flex items-center gap-2 rounded text-left"
      >
        <PieChart size={15} className="text-muted shrink-0" />
        <span className={clsx('flex-1 text-[13.5px] font-semibold', overCount > 0 && 'text-expense')}>
          {overCount > 0
            ? `${overCount} budget${overCount === 1 ? '' : 's'} over limit`
            : 'Budgets this month'}
        </span>
        <ChevronDown size={16} className={clsx('text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {ranked.slice(0, MAX_SHOWN).map(({ budget, progress, spent, limit, ratio }) => {
            const over = ratio > 1;
            const color = over ? 'var(--expense)' : ratio >= 0.7 ? 'var(--warn)' : 'var(--income)';
            return (
              <div key={budget.id}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="flex-1 text-[13px] font-medium truncate">
                    {byId.get(budget.categoryId) ?? 'Uncategorized'}
                  </span>
                  <span className={clsx('text-[11.5px] tnum', over ? 'text-expense font-semibold' : 'text-muted')}>
                    {money(spent)} / {money(limit)}
                  </span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'var(--fill-strong)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, progress.fraction * 100)}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
          <Link
            href="/budget"
            className="focus-ring inline-block rounded text-[12.5px] font-semibold text-accent hover:underline"
          >
            {ranked.length > MAX_SHOWN ? `All ${ranked.length} budgets →` : 'Manage budgets →'}
          </Link>
        </div>
      )}
    </GlassCard>
  );
}
