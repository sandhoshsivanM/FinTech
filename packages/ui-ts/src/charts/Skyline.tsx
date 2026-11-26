'use client';
/**
 * A run of days as a 3D "skyline": one bar per day, weeks running left to
 * right and weekdays front to back, bar height and shade by the day's figure.
 * A Grid view shows the same cells flat, like the spend calendar.
 *
 * Drawn as one flat SVG in isometric projection: three polygons per bar,
 * painted back to front so no depth buffer is needed. No 3D engine, no canvas,
 * nothing per frame. Geometry is built once per data change; hover and the
 * arrow keys only move an outline and a readout, directly on the DOM, so they
 * never re-render React. The grow-in is a single CSS transition, skipped under
 * Reduce motion.
 *
 * Heights are on a square-root scale of the largest day, so one rent payment
 * does not flatten every other bar; the shading uses the spend calendar's five
 * steps. In `change` mode bars are signed: green for a rise, rose for a fall,
 * height by the size of the move.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '../ui';
import { useEntrance } from './useEntrance';

export interface SkylineCell {
  day: number;
  week: number;
  weekday: number;
  /** Null = no figure (outside the range, still to come, or no reading). */
  value: number | null;
}

export type SkylineView = '3d' | 'grid';

const STEPS = [16, 30, 48, 72, 100];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_ROWS: [number, string][] = [[0, 'Sun'], [2, 'Tue'], [4, 'Thu'], [6, 'Sat']];
/** Week axis down-right, weekday axis down-left, in viewBox units per cell. */
const EX: [number, number] = [17, 5.2];
const EY: [number, number] = [-10, 7.5];
const MAX_H = 120;
const INSET = 0.13;
/** Below this width the card shows only the most recent `narrowWeeks`. */
const NARROW_PX = 520;
/** On-screen label size, in CSS px, whatever the chart's scale. */
const MIN_LABEL_PX = 12;
/** Wider than this the chart only gets taller, not clearer. */
const MAX_W_PX = 920;

const level = (v: number, max: number) => (max <= 0 || v <= 0 ? -1 : Math.min(4, Math.floor(Math.sqrt(v / max) * 5)));
const shade = (hue: string, s: number) => `color-mix(in srgb, ${hue} ${STEPS[s]}%, var(--card))`;
const darker = (fill: string, pct: number) => `color-mix(in srgb, ${fill}, #000 ${pct}%)`;
const pt = (x: number, y: number, z: number) => [x * EX[0] + y * EY[0], x * EX[1] + y * EY[1] - z] as const;
const poly = (...ps: (readonly [number, number])[]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

interface Shape { i: number | null; faces: { points: string; fill: string; dashed?: boolean }[] }

function SkylineImpl({ cells, describe, label, mode = 'spend', narrowWeeks }: {
  cells: SkylineCell[];
  /** Readout text for a cell, e.g. "Tue 14 Oct · ₹2,340 · 3 entries". */
  describe: (index: number) => string;
  /** Accessible summary of the whole chart. */
  label: string;
  mode?: 'spend' | 'change';
  /** On a narrow card, show only this many most recent weeks. Omit to always show all. */
  narrowWeeks?: number;
}) {
  const [view, setView] = useState<SkylineView>('3d');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Only crossing the narrow breakpoint or a large resize matters, so the
    // state changes rarely; label size is recomputed from it.
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width / 40) * 40;
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = width > 0 && width < NARROW_PX;
  const totalWeeks = cells.length / 7;
  const firstWeek = narrow && narrowWeeks && narrowWeeks < totalWeeks ? totalWeeks - narrowWeeks : 0;
  const shown = useMemo(
    () => cells.map((c, i) => ({ ...c, i })).filter((c) => c.week >= firstWeek).map((c) => ({ ...c, week: c.week - firstWeek })),
    [cells, firstWeek],
  );
  const weeks = totalWeeks - firstWeek;

  const max = useMemo(() => Math.max(0, ...shown.map((c) => Math.abs(c.value ?? 0))), [shown]);
  const hueFor = (v: number) => (mode === 'change' && v < 0 ? 'var(--data-rose)' : mode === 'change' ? 'var(--data-green)' : 'var(--data-rose)');

  const geo = useMemo(() => {
    if (view !== '3d') return null;
    const pad = 0.35;
    const base = poly(pt(-pad, -pad, 0), pt(weeks + pad, -pad, 0), pt(weeks + pad, 7 + pad, 0), pt(-pad, 7 + pad, 0));
    const order = [...shown].sort((a, b) => (a.week + a.weekday) - (b.week + b.weekday) || a.week - b.week);
    const shapes: Shape[] = order.map((c) => {
      const x0 = c.week + INSET, x1 = c.week + 1 - INSET, y0 = c.weekday + INSET, y1 = c.weekday + 1 - INSET;
      const flat = poly(pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y1, 0), pt(x0, y1, 0));
      if (c.value == null) return { i: null, faces: [{ points: flat, fill: 'none', dashed: true }] };
      const s = level(Math.abs(c.value), max);
      if (s < 0) return { i: c.i, faces: [{ points: flat, fill: 'var(--line-strong)' }] };
      const h = Math.max(2.5, Math.sqrt(Math.abs(c.value) / max) * MAX_H);
      const top = shade(hueFor(c.value), s);
      return {
        i: c.i,
        faces: [
          { points: poly(pt(x0, y1, 0), pt(x1, y1, 0), pt(x1, y1, h), pt(x0, y1, h)), fill: darker(top, 14) },
          { points: poly(pt(x1, y0, 0), pt(x1, y1, 0), pt(x1, y1, h), pt(x1, y0, h)), fill: darker(top, 30) },
          { points: poly(pt(x0, y0, h), pt(x1, y0, h), pt(x1, y1, h), pt(x0, y1, h)), fill: top },
        ],
      };
    });
    const left = pt(-pad, 7 + pad, 0)[0] - 8;
    const right = Math.max(pt(weeks + pad, -pad, 0)[0], pt(weeks + 0.7, 6.5, 0)[0] + (narrow ? 0 : 30)) + 8;
    const top = pt(0, 0, MAX_H)[1] - 8;
    const bottom = pt(weeks + pad, 7 + pad, 0)[1] + 28;
    return { base, shapes, vb: [left, top, right - left, bottom - top] as const };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hueFor is derived from mode
  }, [view, shown, weeks, max, mode, narrow]);

  // Labels scale with the SVG; keep them at least MIN_LABEL_PX on screen.
  const vbWidth = geo ? geo.vb[2] : 30 + weeks * 19;
  // `width` is the drawn width, capped at MAX_W_PX by the CSS below.
  const drawn = Math.min(width, MAX_W_PX);
  const fs = drawn > 0 ? (MIN_LABEL_PX * vbWidth) / drawn : 11;

  const monthStarts = useMemo(() => {
    const out: { week: number; label: string }[] = [];
    let last = -1;
    for (let w = 0; w < weeks; w++) {
      // The week's last day that is in range: a padding day past the end
      // of the period must not name a month the period never reaches.
      const inWeek = shown.filter((c) => c.week === w && c.value != null);
      const ref = inWeek[inWeek.length - 1] ?? (w === weeks - 1 ? null : shown.find((c) => c.week === w && c.weekday === 6));
      if (!ref) continue;
      const m = new Date(ref.day).getMonth();
      // Two labels a week apart collide; the later (the full month) wins.
      if (m !== last) {
        if (out.length && w - out[out.length - 1].week < 3) out.pop();
        out.push({ week: w, label: MONTHS[m] });
        last = m;
      }
    }
    return out;
  }, [shown, weeks]);

  const { progress, transition } = useEntrance(view);

  // ---- Hover / keyboard: straight to the DOM, no React state ---------------
  const svgRef = useRef<SVGSVGElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const current = useRef<number | null>(null);
  const idle = 'Hover or tap a day';

  const show = (i: number | null) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.querySelector('[data-on]')?.removeAttribute('data-on');
    current.current = i;
    if (i == null) {
      if (readout.current) readout.current.textContent = idle;
      if (tip.current) tip.current.hidden = true;
      return;
    }
    const el = svg.querySelector<SVGGElement>(`[data-i="${i}"]`);
    if (!el) return;
    el.setAttribute('data-on', '');
    const text = describe(i);
    if (readout.current) readout.current.textContent = text;
    const t = tip.current;
    const host = box.current;
    if (t && host && !narrow) {
      const r = el.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      t.textContent = text;
      t.hidden = false;
      const x = Math.min(Math.max(r.left + r.width / 2 - hr.left, 80), hr.width - 80);
      t.style.transform = `translate(${x}px, ${r.top - hr.top}px) translate(-50%, calc(-100% - 10px))`;
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = ({ ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    const live = shown.filter((c) => c.value != null);
    if (!live.length) return;
    const at = current.current == null ? -1 : shown.findIndex((c) => c.i === current.current);
    const next = at < 0 ? live[live.length - 1] : shown[at + step];
    if (next && next.value != null) show(next.i);
  };

  const pointer = (e: React.PointerEvent) => {
    const g = (e.target as Element).closest('[data-i]');
    if (!g) return;
    const i = Number(g.getAttribute('data-i'));
    if (i !== current.current) show(i);
  };

  const legendHue = mode === 'change' ? 'var(--data-green)' : 'var(--data-rose)';

  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex items-center gap-3 flex-wrap">
        <Segmented<SkylineView>
          options={[{ value: '3d', label: '3D' }, { value: 'grid', label: 'Grid' }]}
          value={view}
          onChange={(v) => { show(null); setView(v); }}
        />
        {narrow && narrowWeeks && narrowWeeks < totalWeeks && (
          <span className="fs-12 text-muted">Last {narrowWeeks} weeks on this screen</span>
        )}
      </div>

      <div ref={box} className="relative min-w-0">
        <svg
          ref={svgRef}
          viewBox={geo ? geo.vb.map((n) => n.toFixed(0)).join(' ') : `0 0 ${30 + weeks * 19} ${7 * 19 + 22}`}
          role="img"
          aria-label={`${label} Use the arrow keys to read each day.`}
          tabIndex={0}
          className="block w-full max-w-[920px] mx-auto h-auto overflow-visible focus-ring rounded-xl touch-pan-y [&_[data-on]>polygon:last-child]:stroke-[var(--ink)] [&_[data-on]>polygon:last-child]:[stroke-width:1.4] [&_rect[data-on]]:stroke-[var(--ink)] [&_rect[data-on]]:[stroke-width:2]"
          onPointerMove={pointer}
          onPointerDown={pointer}
          onPointerLeave={() => show(null)}
          onBlur={() => show(null)}
          onKeyDown={onKey}
        >
          {geo ? (
            <>
              <polygon points={geo.base} fill="var(--tray)" />
              <g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', transform: `scaleY(${0.04 + 0.96 * progress})`, transition }}>
                {geo.shapes.map((s, k) => (
                  s.i == null
                    ? <polygon key={`f${k}`} points={s.faces[0].points} fill="none" stroke="var(--line-strong)" strokeDasharray="2 2" />
                    : (
                      <g key={s.i} data-i={s.i}>
                        {s.faces.map((f, j) => <polygon key={j} points={f.points} fill={f.fill} />)}
                      </g>
                    )
                ))}
              </g>
              {monthStarts.map((m) => {
                const [x, y] = pt(m.week + 0.5, 8.1, 0);
                return <text key={m.week} x={x} y={y} fontSize={fs} fill="var(--muted)" textAnchor="middle">{m.label}</text>;
              })}
              {!narrow && WEEKDAY_ROWS.map(([wd, t]) => {
                const [x, y] = pt(weeks + 0.7, wd + 0.5, 0);
                return <text key={t} x={x} y={y + fs / 3} fontSize={fs} fill="var(--muted)">{t}</text>;
              })}
            </>
          ) : (
            <>
              {shown.map((c) => {
                const x = 30 + c.week * 19;
                const y = c.weekday * 19;
                if (c.value == null) return <rect key={`f${c.i}`} x={x} y={y} width={16} height={16} rx={4} fill="none" stroke="var(--line-strong)" strokeDasharray="2 2" />;
                const s = level(Math.abs(c.value), max);
                return <rect key={c.i} data-i={c.i} x={x} y={y} width={16} height={16} rx={4} fill={s < 0 ? 'var(--tray)' : shade(hueFor(c.value), s)} />;
              })}
              {WEEKDAY_ROWS.map(([wd, t]) => <text key={t} x={24} y={wd * 19 + 12} fontSize={Math.min(fs, 12)} fill="var(--muted)" textAnchor="end">{t}</text>)}
              {monthStarts.map((m) => <text key={m.week} x={30 + m.week * 19} y={7 * 19 + 14} fontSize={Math.min(fs, 12)} fill="var(--muted)">{m.label}</text>)}
            </>
          )}
        </svg>
        <div
          ref={tip}
          hidden
          aria-hidden
          className="absolute left-0 top-0 pointer-events-none whitespace-nowrap rounded-xl bg-[var(--card-2)] px-2.5 py-1.5 fs-12.5 tnum text-ink shadow-[0_8px_22px_-10px_rgba(0,0,0,0.35),0_0_0_1px_var(--line)]"
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap fs-12 text-muted">
        <span ref={readout} className="tnum" aria-live="polite">{idle}</span>
        <span className="inline-flex items-center gap-1" aria-hidden>
          {mode === 'change' ? (
            <>
              <i className="inline-block w-3 h-3 rounded" style={{ background: 'var(--data-rose)' }} /> Fell
              <i className="inline-block w-3 h-3 rounded ml-2" style={{ background: 'var(--data-green)' }} /> Rose
            </>
          ) : (
            <>Less {STEPS.map((s) => <i key={s} className="inline-block w-3 h-3 rounded" style={{ background: `color-mix(in srgb, ${legendHue} ${s}%, var(--card))` }} />)} More</>
          )}
        </span>
      </div>
    </div>
  );
}

/** Memoised: callers pass stable cells and a stable `describe`. */
export const Skyline = memo(SkylineImpl);
