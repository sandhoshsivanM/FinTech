/**
 * Budgets measured against the calendar: each bar is the share of the budget
 * spent, and one mark shows how much of the month has gone. A bar past its
 * mark is spending faster than the month is passing — the warning a plain
 * "72% used" cannot give on the 5th versus the 28th.
 */
import type { PaceStatus } from '@/domain/dashboardCharts';
import { Chip } from '../ui';

export interface PaceRow {
  label: string;
  /** Spent ÷ limit, unclamped. */
  ratio: number;
  status: PaceStatus;
  /** Already formatted, e.g. "₹18,640 of ₹15,000". */
  amounts: string;
  /** Already formatted overspend, shown on the chip when `status` is 'over'. */
  over?: string;
}

const COLOR: Record<PaceStatus, string> = {
  over: 'var(--data-rose)', ahead: 'var(--data-amber)', onTrack: 'var(--data-blue)',
};

export function PaceBars({ rows, elapsed, elapsedLabel }: {
  rows: PaceRow[];
  /** Share of the period gone, 0–1. */
  elapsed: number;
  /** e.g. "Where spending should be on 17 Oct". */
  elapsedLabel: string;
}) {
  const mark = `${Math.min(Math.max(elapsed, 0), 1) * 100}%`;
  return (
    <div>
      <ul className="grid gap-4">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-center gap-2 text-[13.5px]">
              <span className="mr-auto font-medium truncate">{r.label}</span>
              {r.status === 'over'
                ? <Chip tone="danger">Over{r.over ? ` by ${r.over}` : ''}</Chip>
                : r.status === 'ahead'
                  ? <Chip tone="warning">Ahead of pace</Chip>
                  : <Chip tone="success">On track</Chip>}
            </div>
            <div
              role="img"
              aria-label={`${r.label}: ${Math.round(r.ratio * 100)}% of budget used, ${Math.round(elapsed * 100)}% of the month gone`}
              className="relative h-3 mt-2 rounded-full bg-tray"
            >
              <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-standard"
                style={{ width: `${Math.min(Math.max(r.ratio, 0), 1) * 100}%`, background: COLOR[r.status] }} />
              <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-ink" style={{ left: mark }} />
            </div>
            <div className="mt-1 text-[12px] text-muted tnum">{r.amounts}</div>
          </li>
        ))}
      </ul>
      <p className="mt-3.5 flex items-center gap-1.5 text-[11.5px] text-muted">
        <span aria-hidden className="w-0.5 h-3 rounded-sm bg-ink" />{elapsedLabel}
      </p>
    </div>
  );
}
