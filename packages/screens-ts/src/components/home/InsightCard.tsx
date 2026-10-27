'use client';
import { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@khazana/screens/store';
import { useFmt } from '@khazana/screens/lib/useFmt';
import { useNow } from '@khazana/screens/lib/useNow';
import { D, ZERO } from '@khazana/domain/money';
import { dailyFlow, describeChange } from '@khazana/domain/dailyFlow';
import { currentMonth, monthName, type DateRange } from '@khazana/domain/period';
import { budgetRollover, evaluateBudget, spentForCategory } from '@khazana/domain/finance';
import { SectionInfo } from '@khazana/ui/Hint';

interface Insight { figure: string; title: string; detail: string }

/**
 * One finding at a time, large: the week against last week, the month's
 * budget, the biggest category. Every figure is computed from the vault; an
 * insight with nothing to say is left out rather than padded.
 *
 * The month is the dashboard's selected one. Looking back at a past month,
 * the card speaks about that month only: the "this week" finding is about
 * today, so it is left out rather than mixed in.
 */
export function InsightCard({ month: picked }: { month?: DateRange }) {
  const txns = useApp((s) => s.txns);
  const budgets = useApp((s) => s.budgets);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const now = useNow(60_000);
  const [i, setI] = useState(0);

  const insights = useMemo<Insight[]>(() => {
    if (!now) return [];
    const out: Insight[] = [];
    const money = (v: Parameters<typeof fmt.money>[0]) => (ghost ? '••••' : fmt.money(v));

    const month = picked ?? currentMonth(now);
    const isCurrent = now >= month.start && now <= month.end;
    const name = monthName(month.start);

    const f = dailyFlow(txns, now, 14);
    const thisWeek = f.slice(7).reduce((s, d) => s.plus(d.expense), ZERO);
    const lastWeek = f.slice(0, 7).reduce((s, d) => s.plus(d.expense), ZERO);
    const change = describeChange(thisWeek, lastWeek);
    if (change && isCurrent) {
      const multiple = change.text.endsWith('×');
      out.push({
        figure: change.text,
        title: multiple
          ? 'This week’s spending, compared with last week.'
          : change.up ? 'More spent than last week.' : 'Less spent than last week.',
        detail: `${money(thisWeek)} in the last 7 days, against ${money(lastWeek)} the week before.`,
      });
    }

    if (budgets.length > 0) {
      let spent = ZERO, limit = ZERO;
      for (const b of budgets) {
        const p = evaluateBudget(b, spentForCategory(txns, b.categoryId, month), budgetRollover(b, txns, month));
        spent = spent.plus(p.spent); limit = limit.plus(p.limit);
      }
      if (!limit.isZero()) {
        const left = Math.max(0, Math.ceil((month.end - now) / 86_400_000));
        const over = spent.minus(limit);
        out.push({
          figure: `${spent.div(limit).times(100).toNumber().toFixed(0)}%`,
          title: isCurrent ? 'Of this month’s budget used.' : `Of ${name}’s budget used.`,
          detail: isCurrent
            ? `${money(over.gt(0) ? ZERO : limit.minus(spent))} left to spend over the next ${left} day${left === 1 ? '' : 's'}.`
            : over.gt(0)
              ? `${money(over)} over the ${money(limit)} budgeted.`
              : `${money(limit.minus(spent))} of ${money(limit)} left unspent.`,
        });
      }
    }

    const byCat = new Map<string, ReturnType<typeof D>>();
    let total = ZERO;
    for (const t of txns) {
      if (t.type !== 'expense' || t.date < month.start || t.date > month.end) continue;
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? ZERO).plus(D(t.amount)));
      total = total.plus(D(t.amount));
    }
    const top = [...byCat.entries()].sort((a, b) => b[1].cmp(a[1]))[0];
    if (top && !total.isZero()) {
      const cat = categories.find((c) => c.id === top[0])?.name ?? 'One category';
      out.push({
        figure: `${top[1].div(total).times(100).toNumber().toFixed(0)}%`,
        title: `Of ${isCurrent ? 'this month' : name}’s spending went on ${cat}.`,
        detail: `${money(top[1])} of ${money(total)} spent ${isCurrent ? 'so far this month' : `in ${name}`}.`,
      });
    }
    return out;
  }, [txns, budgets, categories, ghost, fmt, now, picked]);

  if (insights.length === 0) return null;
  const cur = insights[Math.min(i, insights.length - 1)];

  return (
    <section
      aria-label="Insights"
      className="relative overflow-hidden rounded-[26px] p-5 text-white shadow-[0_18px_34px_-18px_rgba(21,38,91,0.7)] h-full flex flex-col"
      style={{ background: 'var(--insight-bg)' }}
    >
      <div className="relative flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.18] px-2.5 py-1 text-[11.5px]">
          <Lightbulb size={13} aria-hidden /> Insights
        </span>
        <SectionInfo k="dashboard.quickInsights" tone="inverse" />
      </div>
      <div key={i} className="relative mt-5 animate-[kz-rise_.45s_var(--ease)]" aria-live="polite">
        <div className="text-[60px] font-light leading-none tracking-[-0.03em] tnum">{cur.figure}</div>
        <p className="mt-3 text-[16px] font-semibold leading-snug">{cur.title}</p>
        <p className="mt-1.5 text-[13px] text-white/80 leading-relaxed">{cur.detail}</p>
      </div>
      {insights.length > 1 && (
        <div className="relative mt-auto pt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${insights.length}, 1fr)` }}>
          {insights.map((x, k) => (
            <button
              key={k}
              type="button"
              aria-label={`Insight ${k + 1} of ${insights.length}`}
              aria-pressed={k === i}
              onClick={() => setI(k)}
              className="focus-ring py-2"
            >
              <span className={clsx('block h-[3px] rounded-full transition-colors', k === i ? 'bg-white' : 'bg-white/30')} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
