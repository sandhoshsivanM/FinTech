'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { forMonth, shiftMonths, type DateRange } from '@/domain/period';

/**
 * Step a screen back and forward through calendar months (§4.1).
 *
 * Budget and the Dashboard were both hard-locked to the current month with no
 * way to look at July — so the moment a month ended, everything you had spent
 * became unreachable. A finance app whose history you cannot open is a
 * dashboard, not a ledger.
 *
 * It shows the *resolved* label from the range itself rather than formatting a
 * second time, so the caption and the query can never describe different months.
 */
export function MonthNav({
  month,
  onChange,
  now = Date.now(),
  className,
}: {
  month: DateRange;
  onChange: (next: DateRange) => void;
  /** Used to decide what "this month" means and to mark future months. */
  now?: number;
  className?: string;
}) {
  const thisMonth = forMonth(now);
  const isCurrent = month.start === thisMonth.start;
  // Future months are reachable — planning next month's budget is a real thing
  // to want — but they are labelled, because an empty month is otherwise
  // indistinguishable from a month where nothing was recorded.
  const isFuture = month.start > thisMonth.start;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonths(month.start, -1))}
        className="focus-ring p-1.5 rounded-[var(--radius-btn)] hover:bg-[var(--fill)] text-muted hover:text-ink transition-colors"
      >
        <ChevronLeft size={17} />
      </button>

      <span className="min-w-[10.5rem] text-center text-sm font-semibold tabular-nums">
        {month.label.split(' · ')[0]}
        {isFuture && <span className="ml-1.5 text-[11px] font-normal text-muted">upcoming</span>}
      </span>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => onChange(shiftMonths(month.start, 1))}
        className="focus-ring p-1.5 rounded-[var(--radius-btn)] hover:bg-[var(--fill)] text-muted hover:text-ink transition-colors"
      >
        <ChevronRight size={17} />
      </button>

      {/* One tap back to now, so a wander through history is not a maze. */}
      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(thisMonth)}
          className="focus-ring ml-1 h-7 px-2.5 rounded-[var(--radius-btn)] border border-[var(--line)] text-[12px] font-semibold text-muted hover:text-ink hover:border-[var(--line-strong)] transition-colors"
        >
          This month
        </button>
      )}
    </div>
  );
}
