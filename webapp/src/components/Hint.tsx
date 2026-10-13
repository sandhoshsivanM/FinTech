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
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { HELP, type HelpKey, type SectionKey } from '@/lib/glossary';

export function Hint({ term, className, align = 'left', size = 13, tone = 'muted' }: {
  /** A glossary term, or a `<route>.<section>` key from SECTION_HELP. */
  term: HelpKey;
  className?: string;
  /** Icon size in px. Figures use 13; section titles use 16 via `SectionInfo`. */
  size?: number;
  /** `inverse` for a hint sitting on a dark, saturated card. */
  tone?: 'muted' | 'inverse';
  /**
   * Which edge the popover is anchored to.
   *
   * `right` for right-aligned numeric table columns: the panel is a fixed 16rem
   * wide, so anchoring it left on the last column of a wide table pushes it
   * past the viewport edge and the definition becomes unreadable.
   */
  align?: 'left' | 'right';
}) {
  const { title, body } = HELP[term];
  const [open, setOpen] = useState(false);
  // Where the panel sits, in viewport px. The panel is portalled to <body> and
  // positioned `fixed`, so a card with `overflow-hidden` (a table, a divided
  // list) cannot clip it, and it is clamped to the viewport so a title near
  // the right edge of a 390px phone still opens a readable panel.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      if (!b) return;
      const GUTTER = 8;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      const width = Math.min(256, vw - GUTTER * 2);
      const natural = align === 'right' ? b.right - width : b.left;
      const left = Math.max(GUTTER, Math.min(natural, vw - GUTTER - width));
      setPos({ top: b.bottom + 6, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  // Dismiss on outside click and on Escape. Without the first, a popover opened
  // by a thumb has no obvious way to close on a phone.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
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
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        // The label carries the term, so a screen reader announces
        // "What is unrealised profit & loss" rather than fifty identical
        // "more info" buttons.
        aria-label={`What is ${title.toLowerCase()}?`}
        className={`focus-ring grid place-items-center shrink-0 rounded-full transition-colors ${tone === 'inverse' ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink'}`}
        style={{ width: Math.max(16, size), height: Math.max(16, size) }}
      >
        <Info size={size} strokeWidth={size > 14 ? 2 : 2.25} aria-hidden="true" />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <span
          id={id}
          ref={panel}
          role="tooltip"
          data-align={align}
          className="fixed z-[90] block rounded-[var(--radius-btn)] border border-line bg-card p-3 text-left font-normal tracking-normal normal-case text-ink shadow-lg"
          style={pos
            ? { top: pos.top, left: pos.left, width: pos.width }
            : { top: 0, left: 0, width: 256, visibility: 'hidden' }}
        >
          <span className="block text-[12.5px] font-semibold text-ink">{title}</span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">{body}</span>
        </span>,
        document.body,
      )}
    </span>
  );
}

/**
 * The ⓘ beside a section or card title.
 *
 * One component so every card on every screen gets the same 16px muted icon,
 * vertically centred on the title and sitting right after its text. It is a
 * SIBLING of the heading, never inside it: inside, the button's "What is …?"
 * label would become part of the heading's accessible name.
 */
export function SectionInfo({ k, align, tone, className }: {
  k: SectionKey;
  align?: 'left' | 'right';
  tone?: 'muted' | 'inverse';
  className?: string;
}) {
  return <Hint term={k} size={16} align={align} tone={tone} className={className} />;
}

/**
 * A hand-rolled card title plus its ⓘ, for cards that do not go through
 * `Section` or `SectionHeader`. `className` styles the heading exactly as the
 * bare `<h2>` did; `wrapClassName` takes the layout classes (margins, flex
 * growth) that used to sit on the heading, so the icon stays centred on the text.
 */
export function CardTitle({ as: Tag = 'h2', info, align, className, wrapClassName, children }: {
  as?: 'h2' | 'h3';
  info?: SectionKey;
  align?: 'left' | 'right';
  className?: string;
  wrapClassName?: string;
  children: ReactNode;
}) {
  if (!info) return <Tag className={className}>{children}</Tag>;
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${wrapClassName ?? ''}`}>
      <Tag className={className}>{children}</Tag>
      <SectionInfo k={info} align={align} />
    </div>
  );
}
