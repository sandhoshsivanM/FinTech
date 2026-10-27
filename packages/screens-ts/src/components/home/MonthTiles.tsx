'use client';
import { useMemo } from 'react';
import { TrendingDown, TrendingUp, PiggyBank, type LucideIcon } from 'lucide-react';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { useNow } from '@khazana/screens/lib/useNow';
import { currentMonth, monthName, type DateRange } from '@khazana/domain/period';
import { windowSummary } from '@khazana/domain/finance';
import { GlossTile, type Hue } from '@khazana/ui/home/depth';

/**
 * A month in three numbers — earned, spent, kept — each with a plain tinted icon.
 * The month is the dashboard's selected calendar month (the current one by
 * default), so it agrees with the budget card and the month picker.
 */
export function MonthTiles({ month }: { month?: DateRange }) {
  const txns = useApp((s) => s.txns);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const now = useNow(60_000);
  const m = useMemo(() => (now ? windowSummary(txns, month ?? currentMonth(now)) : null), [txns, now, month]);
  if (!m) return null;
  const saved = m.income.minus(m.expense);
  const tiles: { label: string; value: string; icon: LucideIcon; hue: Hue }[] = [
    { label: 'Income', value: fmt.money(m.income), icon: TrendingUp, hue: 'green' },
    { label: 'Spent', value: fmt.money(m.expense), icon: TrendingDown, hue: 'pink' },
    { label: 'Saved', value: `${saved.isNegative() ? '−' : ''}${fmt.money(saved.abs())}`, icon: PiggyBank, hue: 'blue' },
  ];
  return (
    <section aria-label={month ? monthName(month.start) : 'This month'} className="grid grid-cols-3 gap-2">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="card p-3 min-w-0 !rounded-[18px]">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-muted">{t.label}</span>
              <GlossTile hue={t.hue} size={26}><Icon size={13} strokeWidth={2.2} /></GlossTile>
            </div>
            <div className="mt-2 text-[16px] font-light tracking-[-0.02em] tnum truncate">{ghost ? '••••' : t.value}</div>
          </div>
        );
      })}
    </section>
  );
}
