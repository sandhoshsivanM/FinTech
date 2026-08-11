'use client';
/**
 * A date field that shows dd/MM/yyyy everywhere.
 *
 * `<input type="date">` renders in the *browser's* locale, so the same field
 * reads 08/08/2026 on one machine and 08/08/2026-meaning-August-8th on another
 * — and on a US-locale browser it shows mm/dd/yyyy, which is the same digits
 * for a different day. No attribute or stylesheet changes that.
 *
 * So the visible control is a text box that owns the format, and the native
 * picker is kept alongside it rather than thrown away: on a phone the wheel is
 * genuinely the fastest way to enter a date. The calendar button opens it via
 * `showPicker()`, falling back to a click on the hidden input.
 *
 * Value in and out is always yyyy-MM-dd, matching `<input type="date">`, so
 * callers keep the state shape they already had.
 */
import { useId, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate, fromInputValue, toInputValue } from '@/lib/dateFormat';
import { parseDateCell } from '@/lib/dateParse';
import { CalendarPopover } from './CalendarPopover';


/**
 * Keeps a date field to date-shaped characters.
 *
 * Letters and symbols are rejected on the way in, so the field can never hold
 * "abc!" and give no signal until blur. Separators are *kept as typed* rather
 * than reformatted: an earlier version reflowed every keystroke into
 * dd/MM/yyyy, which turned "1/2/2026" into "12/20/26" — a different day, from
 * input that was perfectly valid. Filtering rejects what is wrong without
 * rewriting what is right.
 *
 * `parseDateCell` on blur does the interpreting, so "1/2/2026", "01-02-2026"
 * and "01.02.2026" all still land on 1 February.
 */
export function filterDateChars(raw: string): string {
  return raw.replace(/[^0-9/.\-]/g, '').slice(0, 10);
}

export interface DateInputProps {
  /** yyyy-MM-dd, same as a native date input. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  /** Extra classes for the visible text box, for inline/compact placements. */
  className?: string;
  /**
   * Drops the field chrome — border, background, padding.
   *
   * For a date sitting inside a control that already draws its own pill. With
   * the full chrome you get a box inside a box, two calendar icons, and two
   * different heights on one line.
   */
  bare?: boolean;
  'aria-label'?: string;
}

/** yyyy-MM-dd → dd/MM/yyyy for display. Blank stays blank. */
function toDisplay(value: string): string {
  const ms = fromInputValue(value);
  return ms == null ? '' : formatDate(ms);
}

export function DateInput({
  value, onChange, id, min, max, required, disabled, className = '', bare = false, ...rest
}: DateInputProps) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? autoId;

  // Local text so a half-typed "08/0" is not fought by the parent on every
  // keystroke, re-synced when the committed value changes underneath.
  //
  // Adjusted during render rather than in an effect: an effect would render
  // once with stale text and then again with the corrected value, and React
  // explicitly recommends this form for "state derived from a prop".
  const [text, setText] = useState(() => toDisplay(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(toDisplay(value));
  }

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) { onChange(''); return; }
    // Day-first, and forgiving of 8/8/26 and 08-08-2026 — the same reader the
    // file importer uses, so a date typed by hand and one read from a
    // statement can never land on different days.
    const ms = parseDateCell(trimmed, true);
    if (ms == null) { setText(toDisplay(value)); return; } // reject, restore
    onChange(toInputValue(ms));
  };

  /**
   * Touch devices get the platform picker — the wheel is faster with a thumb
   * and already looks native. Everything else gets the in-app calendar, whose
   * whole reason for existing is that the desktop OS popup is drawn in the
   * system theme and anchors to the hidden input rather than to this field.
   */
  const [calendarOpen, setCalendarOpen] = useState(false);
  const openPicker = () => {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!coarse) { setCalendarOpen((o) => !o); return; }

    const el = nativeRef.current;
    if (!el) { setCalendarOpen((o) => !o); return; }
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* fall through */ }
    }
    el.click();
  };

  return (
    <div className={bare ? 'relative inline-flex items-center' : 'relative'}>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        value={text}
        disabled={disabled}
        required={required}
        onChange={(e) => setText(filterDateChars(e.target.value))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
        className={
          bare
            ? `bg-transparent outline-none pr-7 disabled:opacity-50 ${className}`
            : `w-full rounded-[var(--radius-card)] border border-[var(--line)] bg-transparent px-3 py-2.5 pr-11 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50 ${className}`
        }
        {...rest}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        className={
          bare
            ? 'absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-[var(--fg)] transition-colors disabled:opacity-50'
            : 'absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-[var(--radius-btn)] text-muted hover:text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50'
        }
      >
        <CalendarDays size={bare ? 14 : 16} />
      </button>

      {calendarOpen && (
        <CalendarPopover
          value={value}
          min={min}
          max={max}
          onPick={onChange}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {/*
        The real date control, kept for its platform picker only. Visually
        hidden rather than display:none — a hidden input cannot be focused, and
        showPicker() on an unfocusable element throws in some browsers.
      */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute right-3 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  );
}
