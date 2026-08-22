'use client';
/**
 * The enterprise data grid.
 *
 * Sticky header, multi-column sort, search, pagination, column visibility and
 * CSV/Excel export. Generic over the row type so Holdings, Transactions and
 * Dividends share one implementation.
 *
 * The grid owns presentation only — sorting and filtering run over whatever
 * array it is handed, in memory. That is appropriate here because the store
 * already loads every record eagerly; there is nothing to page in.
 */
import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Hint } from './Hint';
import type { TermKey } from '@/lib/glossary';
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';

export interface Column<T> {
  /** Stable key. Used for sort state, column visibility and the export header. */
  key: string;
  header: string;
  /** Cell content. */
  cell: (row: T) => ReactNode;
  /** Sort/export value. Omit to make the column unsortable and export-blank. */
  value?: (row: T) => string | number;
  align?: 'left' | 'right';
  /** Hidden by default; the user can switch it on from the Columns menu. */
  optional?: boolean;
  /** Never hideable — the row would stop being identifiable. */
  locked?: boolean;
  width?: number;
  /** Extra Tailwind for the cell, e.g. responsive hiding. */
  className?: string;
  /**
   * Glossary entry explaining the header, shown behind an (i).
   *
   * A separate field rather than allowing a ReactNode `header`, because
   * `header` is written verbatim into the CSV export — it has to stay a string.
   */
  term?: TermKey;
}

export interface DataGridProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Fields searched by the toolbar box. */
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  /** Base name for the exported file, without extension. */
  exportName?: string;
  /** Rendered between the search box and the right-hand controls. */
  toolbarExtra?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  empty?: ReactNode;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  searchable,
  searchPlaceholder = 'Search…',
  pageSize = 12,
  exportName = 'export',
  toolbarExtra,
  initialSort,
  empty,
}: DataGridProps<T>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.optional).map((c) => c.key)),
  );
  const [colMenu, setColMenu] = useState(false);

  const visible = columns.filter((c) => !hidden.has(c.key));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !searchable) return rows;
    return rows.filter((r) => searchable(r).toLowerCase().includes(needle));
  }, [rows, q, searchable]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null));
  };

  /** Exports what is on screen — current filter and sort, all pages. */
  const download = (kind: 'csv' | 'xls') => {
    const cols = visible.filter((c) => c.value);
    const head = cols.map((c) => c.header);
    const body = sorted.map((r) => cols.map((c) => c.value!(r)));
    if (kind === 'csv') {
      const esc = (v: string | number) => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      save([head, ...body].map((r) => r.map(esc).join(',')).join('\n'), `${exportName}.csv`, 'text/csv;charset=utf-8');
    } else {
      // Excel opens an HTML table with an .xls extension. Chosen over a real
      // XLSX writer on purpose: it needs no dependency, and this app ships as
      // an offline bundle where every kilobyte is the user's disk.
      const esc = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const html =
        `<html><head><meta charset="utf-8"></head><body><table border="1">` +
        `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` +
        body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') +
        `</table></body></html>`;
      save(html, `${exportName}.xls`, 'application/vnd.ms-excel');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap px-4 min-[900px]:px-5 py-3 border-b border-line">
        {searchable && (
          <label className="flex items-center gap-2 h-9 px-3 rounded-input border border-line bg-surface min-w-0 flex-1 max-w-[300px]">
            <Search size={15} className="text-muted shrink-0" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent outline-none text-[12.5px] text-ink placeholder:text-muted"
            />
          </label>
        )}
        {toolbarExtra}
        <span className="flex-1" />

        <div className="relative">
          <Button variant="soft" onClick={() => setColMenu((o) => !o)}>
            <Columns3 size={15} />
            <span className="hidden min-[560px]:inline">{visible.length} of {columns.length}</span>
          </Button>
          {colMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 z-50 card p-1.5 shadow-[var(--shadow-2)] max-h-[320px] overflow-y-auto">
                <p className="eyebrow px-2.5 pt-1.5 pb-1">Columns</p>
                {columns.map((c) => {
                  const on = !hidden.has(c.key);
                  return (
                    <button
                      key={c.key}
                      disabled={c.locked}
                      onClick={() => setHidden((h) => {
                        const next = new Set(h);
                        if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                        return next;
                      })}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[var(--radius-btn)] hover:bg-fill text-left text-[13px] disabled:opacity-40"
                    >
                      <span className={clsx(
                        'w-4 h-4 rounded-[var(--radius-sm)] grid place-items-center text-[10px] font-bold shrink-0',
                        on ? 'bg-accent text-white' : 'border border-line-strong',
                      )}>
                        {on ? '✓' : ''}
                      </span>
                      <span className="truncate">{c.header}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <Button variant="soft" onClick={() => download('csv')}>
          <Download size={15} /><span className="hidden min-[560px]:inline">CSV</span>
        </Button>
        <Button variant="soft" onClick={() => download('xls')}>
          <Download size={15} /><span className="hidden min-[560px]:inline">Excel</span>
        </Button>
      </div>

      {pageRows.length === 0 ? (
        <div className="py-14">{empty ?? <p className="text-center text-[13px] text-muted">Nothing matches that search.</p>}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                {visible.map((c) => {
                  const sortable = !!c.value;
                  const isSorted = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={isSorted ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      style={c.width ? { minWidth: c.width } : undefined}
                      className={clsx(
                        'sticky top-0 z-[2] bg-card-2 border-b border-line whitespace-nowrap',
                        'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted',
                        c.align === 'right' ? 'text-right' : 'text-left',
                        c.className,
                      )}
                    >
                      {sortable ? (
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={clsx(
                            'focus-ring inline-flex items-center gap-1.5 hover:text-ink transition-colors rounded',
                            c.align === 'right' && 'flex-row-reverse',
                            isSorted && 'text-ink',
                          )}
                        >
                          {c.header}
                          {isSorted
                            ? (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                            : <ArrowUpDown size={12} className="opacity-45" />}
                        </button>
                      ) : c.header}
                      {/* Outside the sort button, always. A <button> inside a
                          <button> is invalid HTML and the inner one stops
                          receiving clicks in some browsers. Anchored to the end
                          on right-aligned numeric columns so the popover opens
                          inward rather than off the edge of the table. */}
                      {c.term && (
                        <Hint
                          term={c.term}
                          className={clsx('ml-1 align-middle', c.align === 'right' && 'mr-1 ml-0')}
                          align={c.align === 'right' ? 'right' : 'left'}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={rowKey(r)} className="transition-colors duration-150 hover:bg-fill">
                  {visible.map((c) => (
                    <td
                      key={c.key}
                      className={clsx(
                        'px-3 py-2.5 border-b border-line whitespace-nowrap',
                        c.align === 'right' && 'text-right',
                        c.className,
                      )}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length > pageSize && (
        <div className="flex items-center gap-2 px-4 min-[900px]:px-5 py-3 text-[12px] text-muted">
          <span>
            Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <span className="flex-1" />
          <div className="flex gap-1">
            <PageBtn onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={safePage === 0} label="Previous page">
              <ChevronLeft size={14} />
            </PageBtn>
            {pageWindow(safePage, pageCount).map((p) => (
              <PageBtn key={p} onClick={() => setPage(p)} current={p === safePage} label={`Page ${p + 1}`}>
                {p + 1}
              </PageBtn>
            ))}
            <PageBtn onClick={() => setPage((p) => Math.min(p + 1, pageCount - 1))} disabled={safePage === pageCount - 1} label="Next page">
              <ChevronRight size={14} />
            </PageBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function PageBtn({
  children, onClick, current, disabled, label,
}: { children: ReactNode; onClick: () => void; current?: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={clsx(
        'focus-ring min-w-[28px] h-7 px-2 rounded-[var(--radius-btn)] text-[12px] font-semibold border transition-colors',
        current ? 'bg-accent-soft text-accent border-accent-line' : 'text-ink-soft border-transparent hover:bg-fill',
        disabled && 'opacity-35 cursor-not-allowed hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

/** At most five page numbers, centred on the current page. */
function pageWindow(page: number, count: number): number[] {
  const span = Math.min(5, count);
  let start = Math.max(0, page - Math.floor(span / 2));
  if (start + span > count) start = count - span;
  return Array.from({ length: span }, (_, i) => start + i);
}

function save(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
