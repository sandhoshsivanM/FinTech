'use client';
/**
 * The "what does this word mean" affordance.
 *
 * Deliberately NOT the `title` attribute. As the note on `Tooltip` in ui.tsx
 * puts it: a title waits a second, is styled by the platform, and never appears
 * on a touch screen at all — which is where most of this app is read. So this
 * is a real button with a real popover, opened by tap or by keyboard, and the
 * definition is wired to the figure it explains with `aria-describedby` so a
 * screen reader hears it as part of the number rather than as a stray control.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { GLOSSARY, type TermKey } from '@/lib/glossary';

export function Hint({ term, className, align = 'left' }: {
  term: TermKey;
  className?: string;
  /**
   * Which edge the popover is anchored to.
   *
   * `right` for right-aligned numeric table columns: the panel is a fixed 16rem
   * wide, so anchoring it left on the last column of a wide table pushes it
   * past the viewport edge and the definition becomes unreadable.
   */
  align?: 'left' | 'right';
}) {
  const { title, body } = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);

  // Dismiss on outside click and on Escape. Without the first, a popover opened
  // by a thumb has no obvious way to close on a phone.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className={`relative inline-flex align-middle ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // The label carries the term, so a screen reader announces
        // "What is unrealised profit & loss" rather than fifty identical
        // "more info" buttons.
        aria-label={`What is ${title.toLowerCase()}?`}
        className="focus-ring grid place-items-center w-4 h-4 rounded-full text-muted hover:text-ink transition-colors"
      >
        <Info size={13} strokeWidth={2.25} aria-hidden="true" />
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-6 z-30 w-64 rounded-[var(--radius-btn)] border border-line bg-card p-3 text-left shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <span className="block text-[12.5px] font-semibold text-ink">{title}</span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">{body}</span>
        </span>
      )}
    </span>
  );
}
