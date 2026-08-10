/**
 * The chart family, as static SVG.
 *
 * Mirrors `webapp/src/components/charts/` — same geometry, same stroke widths,
 * same token colours. Everything is drawn at its final state; the app animates
 * these in (see the motion spec in Part E), which a printed page cannot show.
 */

const TAU = Math.PI * 2;
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];

/**
 * Donut. Segments render in the order given — never sorted by value, because
 * the categorical palette's order is what keeps it colourblind-safe.
 */
export function donut({ segments, size = 168, thickness = 22, center = '', sub = '', gap = 0.014 }) {
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let a = 0;
  const arcs = segments.map((s) => {
    const frac = s.value / total;
    const start = a + gap / 2;
    const end = a + frac * TAU - gap / 2;
    a += frac * TAU;
    if (end <= start) return '';
    const [x1, y1] = pt(cx, cy, r, start);
    const [x2, y2] = pt(cx, cy, r, end);
    const large = end - start > Math.PI ? 1 : 0;
    return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"
      fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-linecap="butt"/>`;
  }).join('');

  return `<div style="position:relative;width:${size}px;height:${size}px;flex:none">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--fill-strong)" stroke-width="${thickness}"/>
      ${arcs}
    </svg>
    ${center ? `<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
      <div>
        <div style="font-size:19px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${center}</div>
        ${sub ? `<div style="font-size:10.5px;color:var(--muted);margin-top:1px">${sub}</div>` : ''}
      </div></div>` : ''}
  </div>`;
}

/** The legend that always accompanies a donut — colour, label, share. */
export function legend(segments, { cols = 1, showValue = true } = {}) {
  return `<div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:7px 18px;flex:1;min-width:0">
    ${segments.map((s) => `
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <span style="width:9px;height:9px;border-radius:3px;background:${s.color};flex:none"></span>
        <span style="font-size:12px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.label}</span>
        ${showValue ? `<span style="margin-left:auto;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap">${s.right ?? ''}</span>` : ''}
      </div>`).join('')}
  </div>`;
}

/**
 * Filled area chart with a gradient under the line. `points` is a plain array
 * of numbers; the x axis is implicit and evenly spaced, as in AreaChart.tsx.
 */
export function area({ points, w = 640, h = 180, color = 'var(--accent)', id = 'a', labels = [], grid = true, fill = true }) {
  const min = Math.min(...points), max = Math.max(...points);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad, hi = max + pad;
  const x = (i) => (i / (points.length - 1)) * w;
  const y = (v) => h - ((v - lo) / (hi - lo)) * h;
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const gid = `grad-${id}`;
  const last = points[points.length - 1];

  return `<svg width="100%" viewBox="0 0 ${w} ${h + (labels.length ? 20 : 0)}" preserveAspectRatio="none" style="display:block;overflow:visible">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid ? [0.25, 0.5, 0.75].map((f) => `<line x1="0" y1="${(h * f).toFixed(1)}" x2="${w}" y2="${(h * f).toFixed(1)}" stroke="var(--grid-line)" stroke-width="1"/>`).join('') : ''}
    ${fill ? `<path d="${d} L ${w} ${h} L 0 ${h} Z" fill="url(#${gid})"/>` : ''}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${w}" cy="${y(last).toFixed(1)}" r="3.5" fill="${color}"/>
    ${labels.map((l, i) => `<text x="${(i / (labels.length - 1)) * w}" y="${h + 15}" fill="var(--muted)" font-size="10.5" text-anchor="${i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}">${l}</text>`).join('')}
  </svg>`;
}

/** Two-series grouped column chart — the Reports income-vs-expense shape. */
export function columns({ groups, h = 190, formatY = (n) => n }) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value)));
  return `<div style="display:flex;align-items:end;gap:8px;height:${h}px">
    ${groups.map((g) => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0">
        <div style="display:flex;align-items:end;justify-content:center;gap:2px;width:100%;height:${h - 22}px">
          ${g.values.map((v) => `<div style="width:12px;max-width:100%;border-radius:4px 4px 0 0;background:${v.color};height:${Math.max(v.value > 0 ? 3 : 0, (v.value / max) * 100)}%"></div>`).join('')}
        </div>
        <span style="font-size:10.5px;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center">${g.label}</span>
      </div>`).join('')}
  </div>`;
}

/** Horizontal magnitude bars — sector roll-ups, spend-by-category. */
export function hbars({ rows, height = 9 }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  return `<div style="display:flex;flex-direction:column;gap:11px">
    ${rows.map((r) => `
      <div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:5px">
          <span style="font-size:12px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.label}</span>
          <span style="margin-left:auto;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;${r.tone ? `color:${r.tone}` : ''}">${r.right}</span>
        </div>
        <div style="height:${height}px;border-radius:999px;background:var(--fill-strong);overflow:hidden">
          <div style="height:100%;border-radius:999px;width:${((Math.abs(r.value) / max) * 100).toFixed(1)}%;background:${r.color ?? 'var(--accent)'}"></div>
        </div>
      </div>`).join('')}
  </div>`;
}

/** Diverging bars — P&L by stock, where sign is the point. */
export function diverging({ rows, height = 9 }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  return `<div style="display:flex;flex-direction:column;gap:9px">
    ${rows.map((r) => {
      const w = (Math.abs(r.value) / max) * 50;
      const up = r.value >= 0;
      return `<div style="display:flex;align-items:center;gap:10px">
        <span style="flex:none;width:96px;font-size:11.5px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.label}</span>
        <div style="flex:1;position:relative;height:${height}px">
          <div style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line)"></div>
          <div style="position:absolute;top:0;height:100%;border-radius:3px;background:${up ? 'var(--success)' : 'var(--danger)'};
            ${up ? `left:50%;width:${w.toFixed(1)}%` : `right:50%;width:${w.toFixed(1)}%`}"></div>
        </div>
        <span style="flex:none;width:78px;text-align:right;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;color:${up ? 'var(--success)' : 'var(--danger)'}">${r.right}</span>
      </div>`;
    }).join('')}
  </div>`;
}

/** HEALTH_BANDS from charts/Gauge.tsx. */
export const HEALTH_BANDS = [
  { min: 0, max: 40, label: 'At risk', color: 'var(--danger)' },
  { min: 40, max: 55, label: 'Needs work', color: 'var(--warning)' },
  { min: 55, max: 70, label: 'Fair', color: 'var(--warning)' },
  { min: 70, max: 85, label: 'Strong', color: 'var(--success)' },
  { min: 85, max: 100, label: 'Excellent', color: 'var(--success)' },
];

/** 240° arc gauge with a banded track — the financial-health dial. */
export function gauge({ value, size = 200, label = '', grade = '' }) {
  const stroke = 15;
  const r = (size - stroke) / 2 - 4;
  const cx = size / 2, cy = size / 2;
  const A0 = -Math.PI * (2 / 3), A1 = Math.PI * (2 / 3);   // 240° sweep
  const at = (v) => A0 + (v / 100) * (A1 - A0);
  const arc = (v0, v1, color, width) => {
    const [x1, y1] = pt(cx, cy, r, at(v0));
    const [x2, y2] = pt(cx, cy, r, at(v1));
    const large = at(v1) - at(v0) > Math.PI ? 1 : 0;
    return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}"
      fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  };
  const [nx, ny] = pt(cx, cy, r, at(value));

  return `<div style="position:relative;width:${size}px;height:${size * 0.82}px;flex:none">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;top:0;left:0">
      ${arc(0, 100, 'var(--fill-strong)', stroke)}
      ${HEALTH_BANDS.map((b) => arc(b.min + 0.6, b.max - 0.6, b.color, 3.5)).join('').replace(/stroke-width="3.5"/g, 'stroke-width="3.5" opacity="0.30"')}
      ${arc(0, Math.max(0.5, value), 'var(--accent)', stroke)}
      <circle cx="${nx.toFixed(2)}" cy="${ny.toFixed(2)}" r="5" fill="var(--card)" stroke="var(--accent)" stroke-width="3"/>
    </svg>
    <div style="position:absolute;left:0;right:0;top:${size * 0.30}px;text-align:center">
      <div style="font-size:44px;font-weight:700;letter-spacing:-0.045em;line-height:1;font-variant-numeric:tabular-nums">${value}</div>
      ${grade ? `<div style="font-size:12.5px;font-weight:700;color:var(--accent);margin-top:6px">${grade}</div>` : ''}
      ${label ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px">${label}</div>` : ''}
    </div>
  </div>`;
}

/** Progress ring — goals, per-category health. */
export function ring({ fraction, size = 108, stroke = 11, color = 'var(--accent)', center = '', sub = '' }) {
  const r = (size - stroke) / 2;
  const c = TAU * r;
  const f = Math.min(1, Math.max(0, fraction));
  return `<div style="position:relative;width:${size}px;height:${size}px;flex:none;display:grid;place-items:center">
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fill-strong)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - f)).toFixed(1)}"/>
    </svg>
    <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">
      <div>
        <div style="font-size:16px;font-weight:700;letter-spacing:-0.03em;font-variant-numeric:tabular-nums">${center}</div>
        ${sub ? `<div style="font-size:9.5px;color:var(--muted)">${sub}</div>` : ''}
      </div>
    </div>
  </div>`;
}

/** Inline sparkline for table rows and stat tiles. */
export function spark({ points, w = 86, h = 26, color = 'var(--accent)' }) {
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${((i / (points.length - 1)) * w).toFixed(1)} ${(h - ((v - min) / span) * h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" style="display:block;overflow:visible">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/** Two-level sunburst — asset group on the inner ring, holdings on the outer. */
export function sunburst({ nodes, size = 200 }) {
  const cx = size / 2, cy = size / 2;
  const rIn = size * 0.20, rMid = size * 0.31, rOut = size * 0.46;
  const total = nodes.reduce((a, n) => a + n.value, 0) || 1;
  let a = 0;
  const seg = (r0, r1, start, end, color, op = 1) => {
    const [x1, y1] = pt(cx, cy, r1, start), [x2, y2] = pt(cx, cy, r1, end);
    const [x3, y3] = pt(cx, cy, r0, end), [x4, y4] = pt(cx, cy, r0, start);
    const large = end - start > Math.PI ? 1 : 0;
    return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r1} ${r1} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
      L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${r0} ${r0} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z"
      fill="${color}" opacity="${op}" stroke="var(--card)" stroke-width="1"/>`;
  };
  let out = '';
  for (const n of nodes) {
    const start = a, end = a + (n.value / total) * TAU;
    out += seg(rIn, rMid, start, end, n.color);
    let b = start;
    for (const c of n.children ?? []) {
      const e = b + (c.value / n.value) * (end - start);
      out += seg(rMid + 1, rOut, b, e, n.color, c.op ?? 0.62);
      b = e;
    }
    a = end;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:none">${out}</svg>`;
}
