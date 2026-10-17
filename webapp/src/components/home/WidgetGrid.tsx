'use client';
/**
 * The dashboard's grid of widgets, and its edit mode.
 *
 * Every widget takes a size (S, M, L, XL → 4, 6, 8 or 12 of 12 columns). Rows
 * are packed in order and the last card of a short row widens to fill it, so
 * hiding, moving or resizing a card never strands empty space. Cards in a row
 * stretch to the tallest one.
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
  allowedSizes, isLiveWidget, moveWidget, nudgeWidget, packSpans, setWidgetHidden, setWidgetSize, widgetTitle, SIZE_COLS, SIZE_LABEL, SIZE_NAME, TABLET_COLS,
  type Layout,
} from '@/domain/dashboardLayout';


/** After a swap the cards reflow under the pointer; wait before the next one so they do not flicker back. */
const SWAP_COOLDOWN_MS = 160;
const EDGE_SCROLL_PX = 90;

export function WidgetGrid({ layout, widgets, editing, onChange, tagLive = false }: {
  layout: Layout;
  /** Tag the cards that show today's figures, for when a past month is picked. */
  tagLive?: boolean;
  /** Node per widget id; null or missing means "nothing to show" and the slot is skipped. */
  widgets: Record<string, ReactNode>;
  editing: boolean;
  onChange: (next: Layout) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const lastSwap = useRef(0);
  const visible = layout.filter((w) => !w.hidden && widgets[w.id] != null);
  // Spans per grid width, packed so every row is full (see packSpans).
  const lg = packSpans(visible, SIZE_COLS, 12);
  const md = packSpans(visible, TABLET_COLS, 6);

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
    <div className="grid gap-4 grid-cols-1 min-[768px]:grid-cols-6 min-[1200px]:grid-cols-12">
      {visible.map((w) => {
        const sizes = allowedSizes(w.id);
        return (
          <motion.div
            key={w.id}
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            data-widget={w.id}
            style={{ '--span-md': md[w.id], '--span-lg': lg[w.id] } as React.CSSProperties}
            className={clsx(
              'relative min-w-0 flex flex-col gap-2 rounded-[var(--radius-card)]',
              'min-[768px]:[grid-column:span_var(--span-md)] min-[1200px]:[grid-column:span_var(--span-lg)]',
              dragging === w.id && 'z-20 ring-2 ring-[var(--data-blue)] ring-offset-4 ring-offset-[var(--canvas)] shadow-[var(--shadow-3)]',
            )}
          >
            {/* The controls take their own row above the card, so they never
                cover its title or figures. */}
            {editing && (
              <div className="flex items-center gap-1.5 h-10 pl-1 pr-1 rounded-full bg-tray">
                <button
                  type="button"
                  aria-label={`Move ${widgetTitle(w.id)}. Drag, or use the arrow keys.`}
                  title="Drag to move"
                  className="focus-ring touch-none cursor-grab active:cursor-grabbing grid place-items-center w-8 h-8 shrink-0 rounded-full bg-card-2 shadow-[var(--shadow-1)] text-ink"
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
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{widgetTitle(w.id)}</span>
                <span className="inline-flex shrink-0 p-[3px] gap-px rounded-full bg-card-2" role="group" aria-label={`${widgetTitle(w.id)} size`}>
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={w.size === s}
                      aria-label={SIZE_NAME[s]}
                      title={SIZE_NAME[s]}
                      onClick={() => onChange(setWidgetSize(layout, w.id, s))}
                      className={clsx('focus-ring min-w-6 px-1.5 h-6 rounded-full text-[11px] font-semibold transition-colors',
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
                  className="focus-ring grid place-items-center w-8 h-8 shrink-0 rounded-full text-ink-soft hover:text-danger hover:bg-card-2"
                >
                  <EyeOff size={15} />
                </button>
              </div>
            )}
            {tagLive && !editing && isLiveWidget(w.id) && (
              <span
                className="absolute -top-2.5 right-5 z-10 px-2 py-[2px] rounded-full bg-card-2 shadow-[var(--shadow-float)] text-[10.5px] font-semibold text-ink-soft pointer-events-none"
                title="Shows today's figures, whatever month is picked"
              >
                Today
              </span>
            )}
            {/* A size container, so a card lays itself out by its own width
                rather than the window's. While editing, it is a picture of
                itself: no links, no hovers. */}
            <div
              className={clsx('@container flex-1 min-w-0 grid [&>*]:min-w-0', editing && 'pointer-events-none select-none opacity-90')}
              inert={editing || undefined}
            >
              {widgets[w.id]}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
