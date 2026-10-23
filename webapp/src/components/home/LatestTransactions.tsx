'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { formatDayMonth } from '@/lib/dateFormat';
import { GlassCard } from '@khazana/ui/ui';
import { CardTitle } from '@khazana/ui/Hint';
import { CategoryIcon } from '@khazana/ui/CategoryIcon';
import { motion, fadeUp, stagger } from '@khazana/ui/motion';

const SHOWN = 5;

/** The five most recent transactions, newest first, with their category icons. */
export function LatestTransactions() {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();

  const latest = useMemo(
    () => [...txns].sort((a, b) => b.date - a.date).slice(0, SHOWN),
    [txns],
  );
  if (latest.length === 0) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));

  return (
    <GlassCard padded={false} className="p-4">
      <div className="flex items-baseline justify-between px-1 mb-2">
        <CardTitle info="dashboard.latestTransactions" className="text-[16px] font-medium tracking-[-0.01em]">Latest transactions</CardTitle>
        <Link href="/transactions" className="text-[12.5px] font-semibold text-ink-soft">See all</Link>
      </div>
      <motion.ul variants={stagger} initial="hidden" animate="show">
        {latest.map((t) => {
          const c = byId.get(t.categoryId);
          const time = new Date(t.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          const color = t.type === 'income' ? 'var(--data-green-ink)' : t.type === 'expense' ? 'var(--data-rose)' : 'var(--ink)';
          const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
          return (
            <motion.li key={t.id} variants={fadeUp}>
              <Link
                href={`/add?id=${t.id}`}
                className="focus-ring flex items-center gap-3 px-1 py-2.5 rounded-[var(--radius-btn)] hover:bg-fill transition-colors"
              >
                <CategoryIcon name={c?.icon} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium truncate">{t.merchant || c?.name || 'Transaction'}</span>
                  <span className="block text-[11.5px] text-muted truncate">
                    {c?.name ?? 'Other'} · {formatDayMonth(t.date)}, {time}
                  </span>
                </span>
                <span className="text-[14px] font-semibold tnum whitespace-nowrap" style={{ color: ghost ? 'var(--muted)' : color }}>
                  {ghost ? '••••' : `${sign}${fmt.money(t.amount)}`}
                </span>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </GlassCard>
  );
}
