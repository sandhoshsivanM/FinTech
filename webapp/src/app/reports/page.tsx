'use client';
import { useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { netWorthSeries, monthRange, spentForCategory, type TimeWindow } from '@/domain/finance';
import {
  GlassCard,
  PageIntro,
  SectionHeader,
  EmptyState,
  Segmented,
  Donut,
  Bars,
  Sparkline,
} from '@/components/ui';
import { formatMonthShort } from '@/lib/dateFormat';

// ── Time window ───────────────────────────────────────────────────────────────

type ReportWindow = '3' | '6' | '12';

const WINDOW_OPTIONS: { value: ReportWindow; label: string }[] = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
];

/** Report window → the TimeWindow netWorthSeries speaks. */
const SPARK_WINDOW: Record<ReportWindow, TimeWindow> = { '3': '3M', '6': '6M', '12': '12M' };

const windowLabel = (w: ReportWindow) => `${w} months`;

// ── Color palette for category donut ─────────────────────────────────────────

const CAT_COLORS = [
  'var(--accent)',
  'var(--violet)',
  'var(--warn)',
  'var(--income)',
  'var(--expense)',
  '#06b6d4',
  '#ec4899',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthLabel(year: number, month: number): string {
  return formatMonthShort(new Date(year, month, 1));
}

/** Returns an array of {year, month} going back n months including the current month */
function lastNMonths(n: number): { year: number; month: number }[] {
  const now = new Date();
  const result: { year: number; month: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  color,
  ghost,
}: {
  label: string;
  value: string;
  color: string;
  ghost: boolean;
}) {
  return (
    <GlassCard className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted tracking-wide">{label}</span>
      <span className="text-xl font-extrabold tnum" style={{ color }}>
        {ghost ? '••••••' : value}
      </span>
    </GlassCard>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();

  const [win, setWin] = useState<ReportWindow>('3');
  const numMonths = parseInt(win, 10);

  // ── Month range buckets ──────────────────────────────────────────────────
  const months = useMemo(() => lastNMonths(numMonths), [numMonths]);

  // ── Bar chart data: income + expense per month ───────────────────────────
  const barGroups = useMemo(() => {
    return months.map(({ year, month }) => {
      const [first, last] = monthRange(new Date(year, month, 1));
      let income = ZERO;
      let expense = ZERO;
      for (const t of txns) {
        if (t.date < first || t.date > last) continue;
        if (t.type === 'income') income = income.plus(D(t.amount));
        else expense = expense.plus(D(t.amount));
      }
      return {
        label: monthLabel(year, month),
        values: [
          { value: fmt.toNum(income), color: 'var(--income)' },
          { value: fmt.toNum(expense), color: 'var(--expense)' },
        ],
      };
    });
  }, [txns, months, fmt]);

  // ── Selected window as an epoch range ────────────────────────────────────
  // Single source of truth for every card below, so the donut, the stat tiles
  // and the bar chart can never disagree about which months they cover.
  // Starts at the first of the earliest bucket in `months` — same basis as
  // lastNMonths — so "Expenses (Nmo)" equals the sum of the donut slices.
  const [windowStart, windowEnd] = useMemo((): [number, number] => {
    const now = new Date();
    return [
      new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1).getTime(),
      monthRange(now)[1],
    ];
  }, [numMonths]);

  // ── Spending by category — over the selected window ──────────────────────
  const catSpend = useMemo(() => {
    const byCategory: { id: string; name: string; amount: number }[] = [];
    for (const cat of categories) {
      const spent = spentForCategory(txns, cat.id, windowStart, windowEnd);
      if (spent.gt(0)) {
        byCategory.push({ id: cat.id, name: cat.name, amount: spent.toNumber() });
      }
    }
    byCategory.sort((a, b) => b.amount - a.amount);
    // Every category, largest first. The Donut folds the tail into "Other" and
    // owns expanding it again, so folding here would only make that row a dead
    // end — and it would make the centre count lie about how many there are.
    return byCategory;
  }, [txns, categories, windowStart, windowEnd]);

  const catDonutSegments = catSpend.map((c, i) => ({
    label: c.name,
    value: c.amount,
    color: CAT_COLORS[i % CAT_COLORS.length],
  }));

  // ── Net worth sparkline — over the selected window ───────────────────────
  const sparkValues = useMemo(() => {
    return netWorthSeries(txns, SPARK_WINDOW[win]).map((p) => fmt.toNum(p.value));
  }, [txns, win, fmt]);

  // ── Summary stats over the selected window ────────────────────────────────
  const windowStats = useMemo(() => {
    let income = ZERO;
    let expense = ZERO;
    for (const t of txns) {
      if (t.date < windowStart || t.date > windowEnd) continue;
      if (t.type === 'income') income = income.plus(D(t.amount));
      else expense = expense.plus(D(t.amount));
    }
    const net = income.minus(expense);
    const savingsRate = income.isZero() ? 0 : net.div(income).times(100).toNumber();
    return { income, expense, net, savingsRate };
  }, [txns, windowStart, windowEnd]);

  const hasTxns = txns.length > 0;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reports"
        subtitle="Spending analysis and financial trends"
        action={
          <Segmented
            options={WINDOW_OPTIONS}
            value={win}
            onChange={setWin}
          />
        }
      />

      {!hasTxns ? (
        <GlassCard>
          <EmptyState
            icon={<BarChart2 size={22} />}
            title="No transactions yet"
            hint="Add income and expense transactions to see your financial reports and trends."
          />
        </GlassCard>
      ) : (
        <>
          {/* Summary stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatTile
              label={`Income (${win}mo)`}
              value={fmt.money(windowStats.income)}
              color="var(--income)"
              ghost={ghost}
            />
            <StatTile
              label={`Expenses (${win}mo)`}
              value={fmt.money(windowStats.expense)}
              color="var(--expense)"
              ghost={ghost}
            />
            <StatTile
              label="Net"
              value={fmt.money(windowStats.net)}
              color={windowStats.net.gte(0) ? 'var(--income)' : 'var(--expense)'}
              ghost={ghost}
            />
            <StatTile
              label="Savings Rate"
              value={`${windowStats.savingsRate.toFixed(1)}%`}
              color={windowStats.savingsRate >= 0 ? 'var(--accent)' : 'var(--expense)'}
              ghost={ghost}
            />
          </div>

          {/* Income vs Expense bar chart */}
          <GlassCard>
            <SectionHeader
              title="Income vs Expenses"
              action={
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: 'var(--income)' }} />
                    Income
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: 'var(--expense)' }} />
                    Expenses
                  </span>
                </div>
              }
            />
            <div className="mt-4">
              <Bars
                groups={barGroups}
                height={200}
                formatY={(n) => `${fmt.symbol}${Math.round(n).toLocaleString()}`}
              />
            </div>
          </GlassCard>

          {/* Category donut + Net worth sparkline */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Spending by category */}
            <GlassCard>
              <SectionHeader title="Spending by Category" action={<span className="text-xs text-muted">{windowLabel(win)}</span>} />
              {catSpend.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">
                  No expense transactions in the last {windowLabel(win)}.
                </div>
              ) : (
                <div className="mt-4">
                  <Donut
                    segments={catDonutSegments}
                    size={160}
                    stroke={24}
                    centerText={String(catSpend.length)}
                    centerSub="categories"
                    legend
                    maxSlices={6}
                    otherLabel="Other"
                    formatValue={(n) => fmt.money(n)}
                  />
                </div>
              )}
            </GlassCard>

            {/* Net worth trend */}
            <GlassCard>
              <SectionHeader title="Net Worth Trend" action={<span className="text-xs text-muted">{windowLabel(win)}</span>} />
              <div className="mt-2">
                <Sparkline
                  values={sparkValues}
                  height={160}
                  color="var(--accent)"
                  format={(n) => fmt.money(n)}
                />
              </div>
              {sparkValues.length >= 2 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">{win}M ago</span>
                  <span className="font-bold tnum" style={{
                    color: sparkValues[sparkValues.length - 1] >= sparkValues[0]
                      ? 'var(--income)'
                      : 'var(--expense)',
                  }}>
                    {ghost
                      ? '••••••'
                      : `${fmt.symbol}${Math.round(sparkValues[sparkValues.length - 1]).toLocaleString()}`}
                  </span>
                  <span className="text-muted">Today</span>
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
