'use client';
import { useState } from 'react';
import { CHART } from './tokens';

export interface SunburstNode {
  key: string;
  label: string;
  /** Any positive magnitude; normalised internally. */
  value: number;
  color: string;
  children?: SunburstNode[];
}

interface Segment {
  node: SunburstNode;
  depth: 0 | 1;
  index: number;
  start: number;
  sweep: number;
}

/**
 * Two-ring hierarchical allocation with drill-down. The web twin of Flutter's
 * `SunburstChart`.
 *
 * Answers "what do I own" and "what is it made of" in one figure, because the
 * sector sits literally inside its asset class.
 *
 * Segments render in the order given and are never re-sorted: for the inner ring
 * that order is ASSET_GROUP_ORDER, and the palette's colourblind guarantee is a
 * property of that exact adjacency.
 *
 * Every arc is a focusable button with an aria-label and a native `<title>`, so
 * the chart is navigable by keyboard and readable by a screen reader — a pie
 * chart is otherwise completely silent.
 */
export function Sunburst({
  root,
  size = 220,
  ringWidth = 34,
  formatValue = (n) => String(Math.round(n)),
  centerSub,
  onFocusChange,
  showLegend = true,
}: {
  root: SunburstNode;
  size?: number;
  ringWidth?: number;
  formatValue?: (n: number) => string;
  centerSub?: string;
  onFocusChange?: (path: SunburstNode[]) => void;
  showLegend?: boolean;
}) {
  const [path, setPath] = useState<number[]>([]);
  const [selected, setSelected] = useState<SunburstNode | null>(null);

  const pathNodes: SunburstNode[] = [root];
  let focus = root;
  for (const i of path) {
    const next = focus.children?.[i];
    if (!next) break;
    focus = next;
    pathNodes.push(next);
  }

  const setFocusPath = (next: number[]) => {
    setPath(next);
    setSelected(null);
    if (onFocusChange) {
      const nodes: SunburstNode[] = [root];
      let cur = root;
      for (const i of next) {
        const child = cur.children?.[i];
        if (!child) break;
        cur = child;
        nodes.push(child);
      }
      onFocusChange(nodes);
    }
  };

  const children = focus.children ?? [];
  const total = children.reduce((s, c) => s + Math.max(0, c.value), 0);

  if (children.length === 0 || total <= 0) {
    return (
      <div className="h-40 grid place-items-center text-muted text-[13px]">
        Nothing to show yet
      </div>
    );
  }

  // Layout. Computed once and used for both drawing and interaction, so a click
  // can never land on a different slice than the one under the pointer.
  const cx = size / 2;
  const cy = size / 2;
  const innerR = size / 2 - ringWidth * 1.5;
  const outerR = size / 2 - ringWidth * 0.5;
  const gap = (CHART.arcGapDegrees * Math.PI) / 180;

  const segments: Segment[] = [];
  let angle = -Math.PI / 2;
  children.forEach((child, i) => {
    if (child.value <= 0) return;
    const sweep = (child.value / total) * 2 * Math.PI;
    segments.push({ node: child, depth: 0, index: i, start: angle + gap / 2, sweep: Math.max(0, sweep - gap) });

    const grandTotal = (child.children ?? []).reduce((s, c) => s + Math.max(0, c.value), 0);
    if (grandTotal > 0) {
      let inner = angle;
      for (const grand of child.children!) {
        if (grand.value <= 0) continue;
        const gs = (grand.value / grandTotal) * sweep;
        segments.push({ node: grand, depth: 1, index: -1, start: inner + gap / 2, sweep: Math.max(0, gs - gap) });
        inner += gs;
      }
    }
    angle += sweep;
  });

  const arcPath = (s: Segment, radius: number) => {
    const x1 = cx + Math.cos(s.start) * radius;
    const y1 = cy + Math.sin(s.start) * radius;
    const end = s.start + s.sweep;
    const x2 = cx + Math.cos(end) * radius;
    const y2 = cy + Math.sin(end) * radius;
    const large = s.sweep > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  const activate = (s: Segment) => {
    if (s.depth === 0 && (s.node.children?.length ?? 0) > 0) {
      setFocusPath([...path, s.index]);
    } else {
      // A childless segment cannot be zoomed into; select it for the caption so
      // a click is never a no-op.
      setSelected(s.node);
    }
  };

  const described = selected ?? focus;
  const share = described === focus ? 1 : described.value / total;

  return (
    <div>
      {pathNodes.length > 1 && (
        <nav aria-label="Chart drill-down" className="flex items-center gap-1 mb-2 overflow-x-auto text-[13px]">
          {pathNodes.map((n, i) => (
            <span key={n.key} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-muted">›</span>}
              {i === pathNodes.length - 1 ? (
                <span className="font-semibold text-ink">{n.label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setFocusPath(path.slice(0, i))}
                  className="focus-ring rounded px-1 text-accent font-medium hover:underline"
                >
                  {n.label}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((s, i) => (
            <path
              key={`${s.depth}-${s.node.key}-${i}`}
              d={arcPath(s, s.depth === 0 ? innerR : outerR)}
              fill="none"
              stroke={s.node.color}
              strokeWidth={ringWidth}
              role="button"
              tabIndex={0}
              aria-label={`${s.node.label}, ${Math.round((s.node.value / (focus.value || total)) * 100)}%`}
              className="focus-ring cursor-pointer outline-none"
              onClick={() => activate(s)}
              onMouseEnter={() => setSelected(s.node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(s);
                } else if (e.key === 'Escape' && path.length > 0) {
                  setFocusPath(path.slice(0, -1));
                }
              }}
            >
              {/* Native tooltip — free, and it works before JS hydrates. */}
              <title>{`${s.node.label} · ${formatValue(s.node.value)}`}</title>
            </path>
          ))}
        </svg>

        {/* Centre: the total, and the way back out. */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <button
            type="button"
            disabled={path.length === 0}
            onClick={() => setFocusPath(path.slice(0, -1))}
            aria-label={path.length === 0 ? undefined : 'Zoom out one level'}
            className="focus-ring pointer-events-auto rounded-full grid place-items-center text-center disabled:cursor-default"
            style={{ width: (innerR - ringWidth / 2) * 2, height: (innerR - ringWidth / 2) * 2 }}
          >
            <span>
              <span className="block text-[17px] font-bold tracking-tight tnum">
                {formatValue(focus.value)}
              </span>
              <span className="block text-[10.5px] text-muted">
                {path.length === 0 ? (centerSub ?? focus.label) : 'Zoom out'}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* The caption is the tooltip: it always says something, so nothing is
          hover-only, and it doubles as the live description. */}
      <div className="flex items-center gap-2.5 mt-3 text-[13.5px]">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: described.color }} />
        <span className="flex-1 min-w-0 truncate font-medium">{described.label}</span>
        <span className="shrink-0 text-muted tnum">
          {formatValue(described.value)} · {Math.round(Math.min(1, share) * 100)}%
        </span>
      </div>

      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
          {children.filter((c) => c.value > 0).map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
              {c.label} {Math.round((c.value / total) * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
