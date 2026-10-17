'use client';
/**
 * The dashboard's grid of widgets, and its edit mode.
 *
 * Every widget takes a size (S, M, L, XL → 4, 6, 8 or 12 of 12 columns) and the
 * grid packs densely, so hiding, moving or resizing a card closes the gap it
 * leaves instead of stranding empty space. Cards in a row stretch to the
 * tallest one.
 *
 * Edit mode: each card gets a handle to drag it, a size control and a hide
 * button, and its own contents stop taking clicks so a drag never opens a
 * link. Dragging is plain pointer events — it works with a finger as well as
 * a mouse — and the handle also takes the arrow keys, one place at a time.
 */
import { useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { GripVertical, EyeOff } from 'lucide-react';
import {
  moveWidget, nudgeWidget, setWidgetHidden, setWidgetSize, widgetTitle, SIZES, SIZE_LABEL, SIZE_NAME,
  type Layout, type WidgetSize,
} from '@/domain/dashboardLayout';

/** Static strings, so Tailwind can see every class. Tablet halves S and M; phone is one column. */
const SPAN: Record<WidgetSize, string> = {
  s: 'min-[768px]:col-span-3 min-[1200px]:col-span-4',
  m: 'min-[768px]:col-span-3 min-[1200px]:col-span-6',
  l: 'min-[768px]:col-span-6 min-[1200px]:col-span-8',
  xl: 'min-[768px]:col-span-6 min-[1200px]:col-span-12',
};

/** After a swap the cards reflow under the pointer; wait before the next one so they do not flicker back. */
const SWAP_COOLDOWN_MS = 160;
const EDGE_SCROLL_PX = 90;

export function WidgetGrid({ layout, widgets, editing, onChange }: {
  layout: Layout;
  /** Node per widget id; null or missing means "nothing to show" and the slot is skipped. */
  widgets: Record<string, ReactNode>;
  editing: boolean;
  onChange: (next: Layout) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const lastSwap = useRef(0);
  const visible = layout.filter((w) => !w.hidden && widgets[w.id] != null);

  const onHandleMove = (e: React.PointerEvent, id: string) => {
    if (dragging !== id) return;
    if (e.clientY < EDGE_SCROLL_PX) window.scrollBy(0, -16);
    else if (e.clientY > window.innerHeight - EDGE_SCROLL_PX) window.scrollBy(0, 16);
    if (e.timeStamp - lastSwap.current < SWAP_COOLDOWN_MS) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-widget]');
    const target = over?.dataset.widget;
    if (!target || target === id) return;
    const from = layout.findIndex((w) => w.id === id);
    const to = layout.findIndex((w) => w.id === target);
    lastSwap.current = e.timeStamp;
    // Moving forward lands after the target, moving back lands before it —
    // the usual sortable rule, so a card always ends up where the pointer is.
    onChange(moveWidget(layout, id, target, to > from));
  };

  return (
    <div className="grid gap-4 grid-cols-1 min-[768px]:grid-cols-6 min-[1200px]:grid-cols-12 [grid-auto-flow:dense]">
      {visible.map((w) => (
        <motion.div
          key={w.id}
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          data-widget={w.id}
          className={clsx(
            'relative min-w-0 grid',
            SPAN[w.size],
            editing && 'rounded-[var(--radius-card)] outline-2 outline-dashed outline-offset-4 outline-[var(--line-strong)]',
            dragging === w.id && 'z-20 outline-[var(--data-blue)] shadow-[var(--shadow-3)] scale-[1.01]',
          )}
        >
          {editing && (
            <div className="absolute z-10 top-2 right-2 left-2 flex items-center gap-1.5 pointer-events-none">
              <button
                type="button"
                aria-label={`Move ${widgetTitle(w.id)}. Drag, or use the arrow keys.`}
                title="Drag to move"
                className="pointer-events-auto focus-ring touch-none cursor-grab active:cursor-grabbing grid place-items-center w-8 h-8 rounded-full bg-card-2 shadow-[var(--shadow-float)] text-ink"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(w.id);
                }}
                onPointerMove={(e) => onHandleMove(e, w.id)}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
                onKeyDown={(e) => {
                  const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
                  if (!dir) return;
                  e.preventDefault();
                  onChange(nudgeWidget(layout, w.id, dir));
                }}
              >
                <GripVertical size={16} />
              </button>
              <span className="pointer-events-auto truncate max-w-[40%] px-2.5 py-1 rounded-full bg-card-2 shadow-[var(--shadow-float)] text-[12px] font-semibold">
                {widgetTitle(w.id)}
              </span>
              <span className="ml-auto pointer-events-auto inline-flex p-[3px] gap-px rounded-full bg-card-2 shadow-[var(--shadow-float)]" role="group" aria-label={`${widgetTitle(w.id)} size`}>
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={w.size === s}
                    aria-label={SIZE_NAME[s]}
                    title={SIZE_NAME[s]}
                    onClick={() => onChange(setWidgetSize(layout, w.id, s))}
                    className={clsx('focus-ring px-2 h-6 rounded-full text-[11px] font-semibold transition-colors',
                      w.size === s ? 'bg-accent text-[var(--accent-on)]' : 'text-muted hover:text-ink')}
                  >
                    {SIZE_LABEL[s]}
                  </button>
                ))}
              </span>
              <button
                type="button"
                aria-label={`Hide ${widgetTitle(w.id)}`}
                title="Hide"
                onClick={() => onChange(setWidgetHidden(layout, w.id, true))}
                className="pointer-events-auto focus-ring grid place-items-center w-8 h-8 rounded-full bg-card-2 shadow-[var(--shadow-float)] text-ink-soft hover:text-danger"
              >
                <EyeOff size={15} />
              </button>
            </div>
          )}
          {/* While editing, the card is a picture of itself: no links, no hovers. */}
          <div className={clsx('min-w-0 grid [&>*]:min-w-0', editing && 'pointer-events-none select-none opacity-90')} inert={editing || undefined}>
            {widgets[w.id]}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
