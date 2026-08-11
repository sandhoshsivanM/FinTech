'use client';
/**
 * ⌘K / Ctrl-K global search.
 *
 * Searches the route index plus the user's own data (holdings, transactions,
 * goals) entirely in memory — the store already loads everything eagerly, so
 * there is nothing to fetch and nothing leaves the device.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';
import { useApp } from '@/lib/store';
import { D } from '@/lib/money';
import { useFmt } from '@/lib/useFmt';
import { NAV_GROUPS } from './navConfig';
import { DUR, EASE } from './motion';
import { formatDayMonth } from '@/lib/dateFormat';

interface Item {
  id: string;
  label: string;
  hint: string;
  group: string;
  href: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const holdings = useApp((s) => s.holdings);
  const txns = useApp((s) => s.txns);
  const goals = useApp((s) => s.goals);
  const categories = useApp((s) => s.categories);
  const fmt = useFmt();

  // Open on ⌘K / Ctrl-K, close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => {
          if (!o) { setQ(''); setActive(0); }
          return !o;
        });
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset and focus when the palette opens. State is cleared in the handler
  // that opens it rather than in an effect, so the effect only touches the DOM.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const g of NAV_GROUPS) {
      for (const n of g.items) {
        out.push({ id: `nav:${n.href}`, label: n.label, hint: g.label, group: 'Go to', href: n.href });
      }
    }
    for (const h of holdings) {
      out.push({
        id: `h:${h.id}`,
        label: h.name ? `${h.name} (${h.symbol})` : h.symbol,
        hint: `${h.exchange} · ${fmt.money(D(h.quantity).times(D(h.lastPrice ?? h.avgCost)))}`,
        group: 'Holdings',
        href: '/holdings',
      });
    }
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    for (const t of [...txns].sort((a, b) => b.date - a.date).slice(0, 300)) {
      out.push({
        id: `t:${t.id}`,
        label: t.merchant || catName.get(t.categoryId) || 'Transaction',
        hint: `${catName.get(t.categoryId) ?? ''} · ${formatDayMonth(t.date)} · ${fmt.money(D(t.amount))}`,
        group: 'Transactions',
        href: `/add?id=${t.id}`,
      });
    }
    for (const g of goals) {
      out.push({ id: `g:${g.id}`, label: g.name, hint: 'Goal', group: 'Goals', href: '/goals' });
    }
    return out;
  }, [holdings, txns, goals, categories, fmt]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.filter((i) => i.group === 'Go to').slice(0, 8);
    return items
      .filter((i) => i.label.toLowerCase().includes(needle) || i.hint.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [q, items]);

  // Clamp rather than reset-in-an-effect: if the result list shrank under the
  // cursor, the last row is the honest selection.
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[activeIndex]); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: DUR, ease: EASE }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Search"
            className="relative w-full max-w-[620px] card overflow-hidden shadow-[var(--shadow-3)]"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: DUR, ease: EASE }}
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
              <Search size={18} className="text-muted shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder="Search holdings, transactions, goals or a page…"
                className="flex-1 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
                aria-label="Search"
              />
              <kbd className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[var(--radius-btn)] bg-fill-strong text-muted border border-line">ESC</kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto py-1.5">
              {results.length === 0 && (
                <p className="px-4 py-8 text-center text-[13px] text-muted">
                  Nothing matches “{q}”.
                </p>
              )}
              {results.map((r, i) => (
                <button
                  key={r.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === activeIndex ? 'bg-accent-soft' : 'hover:bg-fill'
                  }`}
                >
                  <span className={`text-[11px] font-semibold w-[86px] shrink-0 ${i === activeIndex ? 'text-accent' : 'text-muted'}`}>
                    {r.group}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-ink truncate">{r.label}</span>
                    <span className="block text-[11.5px] text-muted truncate">{r.hint}</span>
                  </span>
                  {i === activeIndex && <CornerDownLeft size={14} className="text-accent shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
