'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { aggregateByDay } from '@/domain/calendarLedger';
import { monthRange, spentForCategory, evaluateBudget } from '@/domain/finance';
import { PageIntro, GlassCard, ProgressBar } from '@/components/ui';
import type { Txn } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function CalendarPage() {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const budgets = useApp((s) => s.budgets);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();
  const mask = (s: string) => (ghost ? '••••••' : s);

  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  const ledgers = useMemo(() => aggregateByDay(txns), [txns]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const monthTotals = useMemo(() => {
    const prefix = `${year}-${pad(month + 1)}`;
    let income = ZERO;
    let expense = ZERO;
    for (const [k, v] of ledgers) {
      if (!k.startsWith(prefix)) continue;
      income = income.plus(v.income);
      expense = expense.plus(v.expense);
    }
    return { income, expense, net: income.minus(expense) };
  }, [ledgers, year, month]);

  const dayTxns = useMemo<Txn[]>(() => {
    if (!selected) return [];
    return txns
      .filter((t) => {
        const d = new Date(t.date);
        return dayKey(d.getFullYear(), d.getMonth(), d.getDate()) === selected;
      })
      .sort((a, b) => b.date - a.date);
  }, [txns, selected]);

  const shift = (delta: number) => {
    setSelected(null);
    setCursor(new Date(year, month + delta, 1));
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Category';

  const grid = (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <button aria-label="Previous month" onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-[var(--fill)]">
          <ChevronLeft size={18} />
        </button>
        <div className="font-semibold">{monthLabel}</div>
        <button aria-label="Next month" onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-[var(--fill)]">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[11px] font-semibold text-muted py-1">{w}</div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = dayKey(year, month, day);
          const led = ledgers.get(key);
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`aspect-square rounded-lg border p-1 flex flex-col items-start text-left transition-colors ${
                isSelected ? 'border-[var(--accent)] border-2'
                : isToday ? 'border-[var(--accent)]/40 bg-[var(--accent)]/[0.06]'
                : 'border-[var(--line)] hover:bg-[var(--fill)]'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[11px]">{day}</span>
                {led?.hasAttachment && <Paperclip size={10} className="text-muted" />}
              </div>
              <div className="mt-auto flex gap-1">
                {led && led.income.gt(0) && <span className="w-1.5 h-1.5 rounded-full bg-income" />}
                {led && led.expense.gt(0) && <span className="w-1.5 h-1.5 rounded-full bg-expense" />}
              </div>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );

  const monthSummary = (
    <GlassCard className="p-4">
      <div className="text-sm font-semibold mb-2">This month</div>
      <Row label="Income" value={mask(fmt.money(monthTotals.income))} cls="text-income" />
      <Row label="Expense" value={mask(fmt.money(monthTotals.expense))} cls="text-expense" />
      <div className="border-t border-[var(--line)] my-2" />
      <Row label="Net" value={mask(fmt.money(monthTotals.net))} cls={monthTotals.net.gte(0) ? 'text-income' : 'text-expense'} />
    </GlassCard>
  );

  const dayPanel = (
    <GlassCard className="p-4">
      <div className="text-sm font-semibold mb-2">
        {selected ? new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) : 'Select a day'}
      </div>
      {!selected ? (
        <div className="text-sm text-muted">Tap a day to see its ledger.</div>
      ) : dayTxns.length === 0 ? (
        <div className="text-sm text-muted">No transactions on this day.</div>
      ) : (
        <div className="space-y-2">
          {dayTxns.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm">{t.merchant || catName(t.categoryId)}</div>
                <div className="text-[11px] text-muted flex items-center gap-1">
                  {catName(t.categoryId)}
                  {t.attachmentRef && <Paperclip size={10} />}
                </div>
              </div>
              <div className={`text-sm font-semibold ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                {mask(fmt.signed(D(t.amount), t.type === 'income'))}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );

  const budgetPanel = (() => {
    const [first, last] = monthRange(cursor);
    const rows = budgets.map((b) => {
      const spent = spentForCategory(txns, b.categoryId, first, last);
      return { b, prog: evaluateBudget(b, spent) };
    });
    if (rows.length === 0) return null;
    return (
      <GlassCard className="p-4">
        <div className="text-sm font-semibold mb-3">Budgets</div>
        <div className="space-y-3">
          {rows.map(({ b, prog }) => (
            <div key={b.id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>{catName(b.categoryId)}</span>
                <span className="text-[11px] text-muted">
                  {mask(fmt.money(prog.spent))} / {mask(fmt.money(D(b.amountLimit)))}
                </span>
              </div>
              <ProgressBar fraction={prog.fraction} />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  })();

  return (
    <div className="space-y-6">
      <PageIntro title="Calendar" subtitle="Day-by-day income, spending and budgets." />
      {/* Single column < md; sidebar · calendar · tracker ≥ md (PRD §10 adaptive). */}
      <div className="grid gap-4 md:grid-cols-[240px_1fr_320px]">
        <div className="space-y-4">{monthSummary}</div>
        <div>{grid}</div>
        <div className="space-y-4">
          {dayPanel}
          {budgetPanel}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span>{label}</span>
      <span className={`font-semibold ${cls ?? ''}`}>{value}</span>
    </div>
  );
}
