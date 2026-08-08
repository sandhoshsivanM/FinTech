'use client';
/**
 * The month grid behind the date field's calendar button.
 *
 * The native `<input type="date">` picker was doing this job, and it showed:
 * the OS draws it in its own theme, ignores the app entirely, and anchors to
 * whatever element owns the input — which, since that input is a 1px hidden
 * one, put the popup in an unrelated corner of the screen.
 *
 * Rendered only on pointer devices. On a phone the platform wheel is genuinely
 * faster and already looks native, so `DateInput` keeps using it there.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fromInputValue, toInputValue } from '@/lib/dateFormat';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function CalendarPopover({
  value, onPick, onClose, min, max,
}: {
  /** yyyy-MM-dd, or '' */
  value: string;
  onPick: (value: string) => void;
  onClose: () => void;
  min?: string;
  max?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selected = fromInputValue(value);
  const [cursor, setCursor] = useState(() => {
    const base = selected != null ? new Date(selected) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // Escape closes without choosing; an outside click does the same. Both are
  // stopped from reaching a surrounding modal, which would otherwise close too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const minMs = min ? fromInputValue(min) : null;
  const maxMs = max ? fromInputValue(max) : null;
  const today = startOfDay(new Date());

  /** Six weeks from the Sunday on or before the 1st — a stable 42-cell grid. */
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return {
        ms: d.getTime(),
        day: d.getDate(),
        outside: d.getMonth() !== cursor.month,
      };
    });
  }, [cursor]);

  const step = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose a date"
      className="absolute z-50 mt-1 right-0 w-[17rem] rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-lg p-3"
    >
      <div className="flex items-center gap-1 mb-2">
        <button type="button" aria-label="Previous month" onClick={() => step(-1)}
          className="p-1.5 rounded-lg text-muted hover:text-[var(--fg)] hover:bg-[var(--surface-2)]">
          <ChevronLeft size={15} />
        </button>
        <span className="flex-1 text-center text-sm font-bold">
          {MONTHS[cursor.month]} {cursor.year}
        </span>
        <button type="button" aria-label="Next month" onClick={() => step(1)}
          className="p-1.5 rounded-lg text-muted hover:text-[var(--fg)] hover:bg-[var(--surface-2)]">
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-bold text-muted text-center py-1">{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const isSelected = selected != null && startOfDay(new Date(selected)) === c.ms;
          const isToday = c.ms === today;
          const disabled = (minMs != null && c.ms < minMs) || (maxMs != null && c.ms > maxMs);
          return (
            <button
              key={c.ms}
              type="button"
              disabled={disabled}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              onClick={() => { onPick(toInputValue(c.ms)); onClose(); }}
              className={[
                'h-8 rounded-lg text-[12.5px] tnum transition-colors',
                disabled ? 'opacity-25 cursor-not-allowed' : 'hover:bg-[var(--surface-2)]',
                c.outside ? 'text-muted' : '',
                isSelected ? 'bg-[var(--accent)] text-white font-bold hover:bg-[var(--accent)]' : '',
                !isSelected && isToday ? 'font-bold text-[var(--accent)]' : '',
              ].join(' ')}
            >
              {c.day}
            </button>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-[var(--line)] flex justify-between">
        <button type="button" onClick={() => { onPick(toInputValue(Date.now())); onClose(); }}
          className="text-xs font-semibold text-[var(--accent)] hover:underline">
          Today
        </button>
        <button type="button" onClick={() => { onPick(''); onClose(); }}
          className="text-xs font-semibold text-muted hover:text-[var(--fg)]">
          Clear
        </button>
      </div>
    </div>
  );
}
