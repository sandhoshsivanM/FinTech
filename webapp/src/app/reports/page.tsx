'use client';
import { useMemo, useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import { D, ZERO } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { netWorthSeries, spentForCategory, windowSummary } from '@/domain/finance';
import { contains, currentMonth, custom, monthsBack, monthsIn, type DateRange } from '@/domain/period';
import { MonthNav } from '@/components/MonthNav';
import { DateInput } from '@/components/DateInput';
import { useNow } from '@/lib/useNow';
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
import { formatMonthShort, formatDate, toInputValue, todayInputValue, fromInputValue } from '@/lib/dateFormat';
import { balanceSheet } from '@/domain/statements';
import type Decimal from 'decimal.js';

// ── Time window ───────────────────────────────────────────────────────────────

/**
 * Reports is explicitly the historical surface (§4.2).
 *
 * `month` is a single calendar month, stepped with the same control the
 * Dashboard and Budget use. `custom` is an arbitrary span. The three presets
 * remain, and every one of them resolves to printed dates rather than a
 * relative token like "3M" — the point being that a reader can always see which
 * days a number covers.
 */
type ReportWindow = 'month' | '3' | '6' | '12' | 'custom';

const WINDOW_OPTIONS: { value: ReportWindow; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: 'custom', label: 'Custom' },
];

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

/**
 * What you own and what you owe, straight from the chart of accounts.
 *
 * The ledger has produced exactly one figure until now — a per-account balance.
 * These are the same records answering the question people actually ask.
 */
function BalanceSheetCard() {
  const accounts = useApp((s) => s.accounts);
  const postings = useApp((s) => s.postings);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();

  const bs = useMemo(() => balanceSheet(accounts, postings), [accounts, postings]);
  if (bs.assets.length === 0 && bs.liabilities.length === 0) return null;

  const money = (v: Parameters<typeof fmt.money>[0]) => (ghost ? '••••••' : fmt.money(v));

  return (
    <GlassCard>
      <SectionHeader
        title="Balance Sheet"
        action={<span className="text-xs text-muted">As of {formatDate(bs.asOf)}</span>}
      />
      <div className="mt-4 grid md:grid-cols-3 gap-6">
        <Side title="Assets" lines={bs.assets} total={bs.totalAssets} color="var(--income)" money={money} />
        <Side title="Liabilities" lines={bs.liabilities} total={bs.totalLiabilities} color="var(--expense)" money={money} />
        <Side title="Equity" lines={bs.equity} total={bs.totalEquity} color="var(--muted)" money={money} />
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--line)] flex items-baseline justify-between">
        <span className="text-sm font-bold">Net worth</span>
        <span className="text-xl font-extrabold tnum"
          style={{ color: bs.netWorth.gte(0) ? 'var(--income)' : 'var(--expense)' }}>
          {money(bs.netWorth)}
        </span>
      </div>

      {/* A financial statement reports position. Internal consistency problems
          belong in Diagnostics, which names the offending records (§3.4). */}
      {!bs.balanced && (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--warn)' }}>
          These figures are incomplete. Diagnostics has the details.
        </p>
      )}
    </GlassCard>
  );
}

function Side({ title, lines, total, color, money }: {
  title: string;
  lines: { id: string; label: string; amount: Decimal }[];
  total: Decimal;
  color: string;
  money: (v: Decimal) => string;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold text-muted tracking-wide uppercase">{title}</h4>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted">None recorded.</p>
      ) : (
        <div className="mt-2 divide-y divide-[var(--line)]">
          {lines.map((l) => (
            <div key={l.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 truncate text-muted">{l.label}</span>
              <span className="tnum shrink-0">{money(l.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-[var(--line)] flex items-baseline justify-between text-sm">
        <span className="font-semibold">Total</span>
        <span className="font-bold tnum" style={{ color }}>{money(total)}</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const txns = useApp((s) => s.txns);
  const categories = useApp((s) => s.categories);
  const ghost = useApp((s) => s.ghost);
  const fmt = useFmt();

  const [win, setWin] = useState<ReportWindow>('3');
  const now = useNow(60_000);

  // Month mode keeps its own cursor; custom mode keeps two dates. Both are
  // resolved into the single `range` below, so nothing downstream needs to know
  // which mode produced it.
  const [monthCursor, setMonthCursor] = useState<DateRange | null>(null);
  const [customFrom, setCustomFrom] = useState(() => toInputValue(monthsBack(3).start));
  const [customTo, setCustomTo] = useState(() => todayInputValue());

  // ── The one resolved range every card on this page reads ─────────────────
  // Previously the KPI tiles and donut used calendar months while the sparkline
  // used a trailing 90/180/365 days, and both were captioned "3 months" — two
  // different periods under one label.
  const range = useMemo(() => {
    if (win === 'month') return monthCursor ?? currentMonth(now || undefined);
    if (win === 'custom') {
      const a = fromInputValue(customFrom);
      const b = fromInputValue(customTo);
      // An incomplete custom range falls back to 3 months rather than showing
      // nothing: a half-typed date should not blank the page.
      return a != null && b != null ? custom(a, b) : monthsBack(3, now || undefined);
    }
    return monthsBack(parseInt(win, 10), now || undefined);
  }, [win, monthCursor, customFrom, customTo, now]);

  const months = useMemo(() => monthsIn(range), [range]);

  // ── Bar chart data: income + expense per month ───────────────────────────
  const barGroups = useMemo(() => {
    // windowSummary rather than a local income/else-expense loop: that shape
    // counts an investment purchase as spending, which is exactly what §3.2
    // forbids and what made an investing month look like an overspending one.
    return months.map((m) => {
      const s = windowSummary(txns, m);
      return {
        label: formatMonthShort(m.start),
        values: [
          { value: fmt.toNum(s.income), color: 'var(--income)' },
          { value: fmt.toNum(s.expense), color: 'var(--expense)' },
        ],
      };
    });
  }, [txns, months, fmt]);

  // ── Spending by category — over the selected window ──────────────────────
  const catSpend = useMemo(() => {
    const byCategory: { id: string; name: string; amount: number }[] = [];
    for (const cat of categories) {
      const spent = spentForCategory(txns, cat.id, range);
      if (spent.gt(0)) {
        byCategory.push({ id: cat.id, name: cat.name, amount: spent.toNumber() });
      }
    }
    byCategory.sort((a, b) => b.amount - a.amount);
    // Every category, largest first. The Donut folds the tail into "Other" and
    // owns expanding it again, so folding here would only make that row a dead
    // end — and it would make the centre count lie about how many there are.
    return byCategory;
  }, [txns, categories, range]);

  const catDonutSegments = catSpend.map((c, i) => ({
    label: c.name,
    value: c.amount,
    color: CAT_COLORS[i % CAT_COLORS.length],
  }));

  /**
   * Month by month: the trend as a table, not only as bars.
   *
   * A bar chart shows shape; it does not let you read that August's savings
   * rate was 31% and July's was 12%. Built from `monthsIn(range)` — the same
   * buckets the chart uses — so the two can never disagree.
   */
  const monthlyRows = useMemo(() => months.map((m) => {
    const s = windowSummary(txns, m);
    return {
      key: String(m.start),
      label: formatMonthShort(m.start),
      range: m,
      income: s.income,
      expense: s.expense,
      invested: s.invested,
      net: s.net,
      savingsRate: s.income.isZero() ? null : s.net.div(s.income).times(100).toNumber(),
    };
  }), [months, txns]);

  const anyInvested = monthlyRows.some((r) => r.invested.gt(0));

  // ── Net worth sparkline — the same range as everything else ──────────────
  const sparkValues = useMemo(() => {
    return netWorthSeries(txns, range).map((p) => fmt.toNum(p.value));
  }, [txns, range, fmt]);

  // ── Summary stats over the selected window ────────────────────────────────
  const windowStats = useMemo(() => {
    const s = windowSummary(txns, range);
    const savingsRate = s.income.isZero() ? 0 : s.net.div(s.income).times(100).toNumber();
    return { ...s, savingsRate };
  }, [txns, range]);

  const hasTxns = txns.length > 0;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reports"
        subtitle={`Historical · ${range.label}`}
        action={<Segmented options={WINDOW_OPTIONS} value={win} onChange={setWin} />}
      />

      {/* The control for whichever mode is selected. Kept out of PageIntro so a
          date pair has room to breathe on a phone. */}
      {win === 'month' && (
        <MonthNav
          month={range}
          now={now || undefined}
          onChange={setMonthCursor}
        />
      )}
      {win === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-muted">
            <span className="block mb-1">From</span>
            <DateInput value={customFrom} onChange={setCustomFrom} />
          </label>
          <label className="text-xs font-semibold text-muted">
            <span className="block mb-1">To</span>
            <DateInput value={customTo} onChange={setCustomTo} />
          </label>
          <span className="text-xs text-muted pb-2.5">{range.label}</span>
        </div>
      )}

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
              label={`Income · ${range.label}`}
              value={fmt.money(windowStats.income)}
              color="var(--income)"
              ghost={ghost}
            />
            <StatTile
              label={`Expenses · ${range.label}`}
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
                    <span className="w-3 h-3 rounded-[var(--radius-sm)]" style={{ background: 'var(--income)' }} />
                    Income
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[var(--radius-sm)]" style={{ background: 'var(--expense)' }} />
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

          {/* Balance sheet — the same postings, asked a different question */}
          <BalanceSheetCard />

          {/* Category donut + Net worth sparkline */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Spending by category */}
            <GlassCard>
              <SectionHeader title="Spending by Category" action={<span className="text-xs text-muted">{range.label}</span>} />
              {catSpend.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">
                  No expense transactions between {range.label}.
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

            {/* Month by month */}
          {monthlyRows.length > 1 && (
            <GlassCard padded={false}>
              <div className="px-5 py-4 border-b border-[var(--line)]">
                <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Month by month</h2>
                <p className="text-xs text-muted mt-0.5">{range.label}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted">
                      <th className="text-left font-semibold px-5 py-2">Month</th>
                      <th className="text-right font-semibold px-3 py-2">Income</th>
                      <th className="text-right font-semibold px-3 py-2">Expense</th>
                      {anyInvested && <th className="text-right font-semibold px-3 py-2">Invested</th>}
                      <th className="text-right font-semibold px-3 py-2">Net</th>
                      <th className="text-right font-semibold px-5 py-2">Saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {monthlyRows.map((r) => (
                      <tr key={r.key}>
                        <td className="px-5 py-2.5 font-medium whitespace-nowrap">{r.label}</td>
                        <td className="px-3 py-2.5 text-right tnum" style={{ color: 'var(--income)' }}>
                          {ghost ? '••••' : fmt.money(r.income)}
                        </td>
                        <td className="px-3 py-2.5 text-right tnum" style={{ color: 'var(--expense)' }}>
                          {ghost ? '••••' : fmt.money(r.expense)}
                        </td>
                        {/* Shown only when there is something to show, and never
                            folded into Expense — investing is not spending. */}
                        {anyInvested && (
                          <td className="px-3 py-2.5 text-right tnum text-muted">
                            {ghost ? '••••' : r.invested.isZero() ? '—' : fmt.money(r.invested)}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right tnum font-semibold"
                          style={{ color: r.net.gte(0) ? 'var(--income)' : 'var(--expense)' }}>
                          {ghost ? '••••' : fmt.money(r.net)}
                        </td>
                        <td className="px-5 py-2.5 text-right tnum text-muted">
                          {r.savingsRate == null ? '—' : `${r.savingsRate.toFixed(0)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3 text-[11px] text-muted border-t border-[var(--line)]">
                Saved is net as a share of income for that month. Transfers between your own
                accounts and investment purchases are excluded from both income and expense.
              </p>
            </GlassCard>
          )}

          {/* Net worth trend */}
            <GlassCard>
              <SectionHeader title="Net Worth Trend" action={<span className="text-xs text-muted">{range.label}</span>} />
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
                  <span className="text-muted">{formatDate(range.start)}</span>
                  <span className="font-bold tnum" style={{
                    color: sparkValues[sparkValues.length - 1] >= sparkValues[0]
                      ? 'var(--income)'
                      : 'var(--expense)',
                  }}>
                    {ghost
                      ? '••••••'
                      : `${fmt.symbol}${Math.round(sparkValues[sparkValues.length - 1]).toLocaleString()}`}
                  </span>
                  <span className="text-muted">{formatDate(range.end)}</span>
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
