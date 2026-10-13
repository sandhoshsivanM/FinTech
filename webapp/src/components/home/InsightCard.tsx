'use client';
import { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '@/lib/store';
import { useFmt } from '@/lib/useFmt';
import { useNow } from '@/lib/useNow';
import { D, ZERO } from '@/lib/money';
import { dailyFlow, describeChange } from '@/domain/dailyFlow';
import { currentMonth } from '@/domain/period';
import { budgetRollover, evaluateBudget, spentForCategory } from '@/domain/finance';
import { SectionInfo } from '../Hint';

interface Insight { figure: string; title: string; detail: string }

/**
 * One finding at a time, large: the week against last week, the month's
 * budget, the biggest category. Every figure is computed from the vault; an
 * insight with nothing to say is left out rather than padded.
 */
export function InsightCard() {
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

    const f = dailyFlow(txns, now, 14);
    const thisWeek = f.slice(7).reduce((s, d) => s.plus(d.expense), ZERO);
    const lastWeek = f.slice(0, 7).reduce((s, d) => s.plus(d.expense), ZERO);
    const change = describeChange(thisWeek, lastWeek);
    if (change) {
      const multiple = change.text.endsWith('×');
      out.push({
        figure: change.text,
        title: multiple
          ? 'This week’s spending, compared with last week.'
          : change.up ? 'More spent than last week.' : 'Less spent than last week.',
        detail: `${money(thisWeek)} in the last 7 days, against ${money(lastWeek)} the week before.`,
      });
    }

    const month = currentMonth(now);
    if (budgets.length > 0) {
      let spent = ZERO, limit = ZERO;
      for (const b of budgets) {
        const p = evaluateBudget(b, spentForCategory(txns, b.categoryId, month), budgetRollover(b, txns, month));
        spent = spent.plus(p.spent); limit = limit.plus(p.limit);
      }
      if (!limit.isZero()) {
        const left = Math.max(0, Math.ceil((month.end - now) / 86_400_000));
        out.push({
          figure: `${spent.div(limit).times(100).toNumber().toFixed(0)}%`,
          title: 'Of this month’s budget used.',
          detail: `${money(limit.minus(spent).isNegative() ? ZERO : limit.minus(spent))} left to spend over the next ${left} day${left === 1 ? '' : 's'}.`,
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
      const name = categories.find((c) => c.id === top[0])?.name ?? 'One category';
      out.push({
        figure: `${top[1].div(total).times(100).toNumber().toFixed(0)}%`,
        title: `Of this month’s spending went on ${name}.`,
        detail: `${money(top[1])} of ${money(total)} spent so far this month.`,
      });
    }
    return out;
  }, [txns, budgets, categories, ghost, fmt, now]);

  if (insights.length === 0) return null;
  const cur = insights[Math.min(i, insights.length - 1)];

  return (
    <section
      aria-label="Insights"
      className="relative overflow-hidden rounded-[26px] p-5 text-white shadow-[0_18px_34px_-18px_rgba(21,38,91,0.7)]"
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
        <div className="relative mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${insights.length}, 1fr)` }}>
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
