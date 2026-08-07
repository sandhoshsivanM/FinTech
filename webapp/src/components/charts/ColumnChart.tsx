'use client';
/**
 * Signed column chart — monthly returns, daily P&L, anything that crosses zero.
 *
 * Laid out in HTML/flex rather than a stretched SVG so the 4px data-end radius,
 * the 2px inter-bar gap and the labels all hold their shape at every width.
 * The zero line is drawn explicitly: it is the reference the bars are read
 * against, so it must be visible, not implied.
 */
import clsx from 'clsx';

export interface Column { label: string; value: number }

export function ColumnChart({
  columns,
  height = 200,
  format = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
  ariaLabel,
}: {
  columns: Column[];
  height?: number;
  format?: (n: number) => string;
  ariaLabel?: string;
}) {
  if (columns.length === 0) return null;
  const max = Math.max(...columns.map((c) => Math.abs(c.value))) * 1.16 || 1;
  const plotH = height - 26;
  const half = plotH / 2;
  const positives = columns.filter((c) => c.value >= 0).length;

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${positives} positive of ${columns.length} periods`}
      className="relative flex gap-[2px] items-stretch"
    >
      <span className="absolute left-0 right-0 h-px bg-line-strong z-[1]" style={{ top: half }} />
      {columns.map((c, i) => {
        const barH = Math.max((Math.abs(c.value) / max) * half, 3);
        const up = c.value >= 0;
        return (
          <div key={`${c.label}-${i}`} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
            <div className="w-full flex flex-col items-center justify-center" style={{ height: plotH }}>
              <div className="w-full flex items-end justify-center" style={{ height: half }}>
                {up && <Bar h={barH} up title={`${c.label}: ${format(c.value)}`} />}
              </div>
              <div className="w-full flex items-start justify-center" style={{ height: half }}>
                {!up && <Bar h={barH} up={false} title={`${c.label}: ${format(c.value)}`} />}
              </div>
            </div>
            <span className="text-[11px] font-semibold text-muted truncate max-w-full">{c.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ h, up, title }: { h: number; up: boolean; title: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'block w-full max-w-[22px] min-w-[5px] transition-[filter] duration-150 hover:brightness-110',
        up ? 'bg-success rounded-t-[4px] origin-bottom' : 'bg-danger rounded-b-[4px] origin-top',
      )}
      style={{ height: h, animation: 'kz-grow 620ms var(--ease) backwards' }}
    />
  );
}
