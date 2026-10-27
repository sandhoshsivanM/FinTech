'use client';
/**
 * A free-text field with a filtered suggestion list.
 *
 * Replaces `<datalist>`, whose popup is drawn by the browser: it ignores the
 * app's theme entirely (a dark OS popup over a light app), its width and row
 * height are not ours to set, and it cannot be driven or asserted on in tests.
 * The behaviour people actually wanted from it — type anything, or pick from a
 * list — is what this keeps.
 *
 * Free text is deliberate: the Sector list is a convenience, not a
 * constraint, so an instrument the bundled master does not cover can still be
 * classified by hand.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Combobox({
  value, onChange, options, placeholder, id, disabled, ...rest
}: ComboboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo<readonly string[]>(() => {
    const q = value.trim().toLowerCase();
    // An exact hit means the user has already chosen; showing the full list
    // again just covers the next field for no reason.
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, value]);

  // Close on an outside click. Without this the list survives a click into the
  // next field and floats over unrelated content.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view during keyboard traversal.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + matches.length) % Math.max(matches.length, 1);
      });
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); // don't let Escape also close the surrounding modal
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-[var(--radius-card)] border border-[var(--line)] bg-transparent px-3 py-2.5 pr-10 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
        {...rest}
      />

      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'Hide suggestions' : 'Show suggestions'}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-[var(--radius-btn)] text-muted hover:text-[var(--fg)] transition-colors disabled:opacity-50"
      >
        <ChevronDown size={15} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && matches.length > 0 && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-lg py-1"
        >
          {matches.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: the input's blur would otherwise close
              // the list before the click ever lands.
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === active ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'hover:bg-[var(--surface-2)]'
              }`}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
