/**
 * The component kit, redrawn.
 *
 * One function per export in `webapp/src/components/ui.tsx`, matching its
 * padding, radius, weight and token usage. Where the app writes a Tailwind
 * class the kit writes the value it compiles to, so the artboards depend on
 * nothing but tokens.css.
 */

const cx = (...xs) => xs.filter(Boolean).join('');

/** GlassCard — `.card` with `p-5`. `padded={false}` for self-padding content. */
export function card(inner, { padded = true, style = '', cls = '', cal = '' } = {}) {
  return `<div class="card ${cls} ${cal ? 'cal-host' : ''}" style="${padded ? 'padding:20px;' : ''}${style}">${cal}${inner}</div>`;
}

export function sectionHeader(title, action = '') {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px">
    <h2 style="font-size:15px;font-weight:600;letter-spacing:-0.02em;color:var(--ink);margin:0">${title}</h2>
    ${action}
  </div>`;
}

export function eyebrow(text) {
  return `<div style="font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)">${text}</div>`;
}

// ---- Buttons --------------------------------------------------------------
/** Three variants, not fifteen. `soft` and `danger` are aliases kept for call sites. */
const BTN = {
  primary: 'background:var(--primary);color:var(--primary-fg);border:1px solid transparent',
  secondary: 'background:transparent;color:var(--ink);border:1px solid var(--line-strong)',
  ghost: 'background:transparent;color:var(--ink-soft);border:1px solid transparent',
  danger: 'background:transparent;color:var(--danger);border:1px solid color-mix(in srgb,var(--danger) 35%,transparent)',
  // Rendered states, for the specimen sheets.
  'primary-hover': 'background:var(--accent-deep);color:var(--primary-fg);border:1px solid transparent',
  'secondary-hover': 'background:transparent;color:var(--accent);border:1px solid var(--accent)',
  'ghost-hover': 'background:var(--fill);color:var(--ink);border:1px solid transparent',
  'primary-focus': 'background:var(--primary);color:var(--primary-fg);border:1px solid transparent;box-shadow:0 0 0 2px var(--canvas),0 0 0 4px var(--accent-line)',
  'primary-disabled': 'background:var(--primary);color:var(--primary-fg);border:1px solid transparent;opacity:.4',
};

export function button(label, variant = 'primary', { icon = '', full = false } = {}) {
  return `<span style="display:${full ? 'flex' : 'inline-flex'};align-items:center;justify-content:center;gap:8px;
    height:36px;padding:0 14px;border-radius:var(--radius-btn);
    font-size:13px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;${BTN[variant]}">${icon}${label}</span>`;
}

export function segmented(options, activeIndex = 0) {
  return `<span style="display:inline-flex;padding:3px;gap:1px;border-radius:11px;background:var(--fill)">
    ${options.map((o, i) => `<span style="padding:5px 12px;border-radius:9px;font-size:12.5px;font-weight:600;letter-spacing:-0.01em;
      ${i === activeIndex ? 'background:var(--surface);color:var(--ink);box-shadow:var(--shadow-1)' : 'color:var(--muted)'}">${o}</span>`).join('')}
  </span>`;
}

// ---- Inputs ---------------------------------------------------------------
export function input(value, { placeholder = false, focus = false, w = '100%', icon = '' } = {}) {
  return `<span style="display:flex;align-items:center;gap:8px;width:${w};height:38px;padding:0 12px;
    border-radius:var(--radius-input);border:1px solid ${focus ? 'var(--accent)' : 'var(--line-strong)'};
    background:var(--surface);font-size:14px;color:var(--${placeholder ? 'muted' : 'ink'});
    ${focus ? 'box-shadow:0 0 0 2px var(--canvas),0 0 0 4px var(--accent-line);' : ''}">${icon}${value}</span>`;
}

export function field(label, control, hint = '') {
  return `<label style="display:block">
    <span style="font-size:12px;font-weight:600;color:var(--ink-soft)">${label}</span>
    <div style="margin-top:6px">${control}</div>
    ${hint ? `<span style="display:block;margin-top:6px;font-size:11.5px;color:var(--muted)">${hint}</span>` : ''}
  </label>`;
}

export function select(value, { w = '100%' } = {}) {
  return `<span style="display:flex;align-items:center;width:${w};height:38px;padding:0 12px;
    border-radius:var(--radius-input);border:1px solid var(--line-strong);background:var(--surface);font-size:14px;color:var(--ink)">
    ${value}<span style="margin-left:auto;color:var(--muted);font-size:10px">▾</span></span>`;
}

// ---- Feedback -------------------------------------------------------------
/** Budget zones: >90% danger, ≥70% warning, else success. */
export function progress(fraction, { height = 7, color = null } = {}) {
  const p = Math.min(100, Math.max(0, fraction * 100));
  const c = color ?? (p > 90 ? 'var(--danger)' : p >= 70 ? 'var(--warning)' : 'var(--success)');
  return `<div style="width:100%;height:${height}px;border-radius:999px;background:var(--fill-strong);overflow:hidden">
    <div style="height:100%;border-radius:999px;width:${p.toFixed(1)}%;background:${c}"></div></div>`;
}

const CHIP = {
  neutral: 'background:var(--fill);color:var(--ink-soft);border-color:var(--line)',
  accent: 'background:var(--accent-soft);color:var(--accent);border-color:var(--accent-line)',
  success: 'background:var(--success-soft);color:var(--success);border-color:color-mix(in srgb,var(--success) 26%,transparent)',
  danger: 'background:var(--danger-soft);color:var(--danger);border-color:color-mix(in srgb,var(--danger) 26%,transparent)',
  warning: 'background:var(--warning-soft);color:var(--warning);border-color:color-mix(in srgb,var(--warning) 30%,transparent)',
  violet: 'background:var(--violet-soft);color:var(--violet);border-color:color-mix(in srgb,var(--violet) 30%,transparent)',
};

export function chip(label, tone = 'neutral') {
  return `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;
    border:1px solid;font-size:11px;font-weight:600;white-space:nowrap;${CHIP[tone]}">${label}</span>`;
}

/**
 * A signed change. The arrow carries the same information as the colour, so a
 * colourblind reader is never relying on hue alone.
 */
export function delta(value, { suffix = '%', digits = 2, text = null } = {}) {
  if (value == null) return `<span style="color:var(--muted);font-size:11.5px">—</span>`;
  const up = value > 0, down = value < 0;
  const style = up ? 'background:var(--success-soft);color:var(--success)'
    : down ? 'background:var(--danger-soft);color:var(--danger)'
      : 'background:var(--fill);color:var(--muted)';
  const body = text ?? `${Math.abs(value).toFixed(digits)}${suffix}`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;
    font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;${style}">
    <span>${up ? '↑' : down ? '↓' : '·'}</span>${body}</span>`;
}

// ---- Figures --------------------------------------------------------------
/** StatStrip — the KPI row every screen opens with. One card, divided. */
export function statStrip(items, { cal = '' } = {}) {
  return `<div class="card ${cal ? 'cal-host' : ''}" style="overflow:hidden">${cal}
    <div style="display:grid;grid-template-columns:repeat(${items.length},minmax(0,1fr))">
      ${items.map((it, i) => `
        <div style="padding:16px 20px;min-width:0;${i ? 'border-left:1px solid var(--line)' : ''}">
          <div style="font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.label}</div>
          <div style="margin-top:8px;font-size:22px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${it.accent ? `color:${it.accent}` : ''}">${it.value}</div>
          ${it.sub ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.sub}</div>` : ''}
        </div>`).join('')}
    </div></div>`;
}

/** StatTile — a standalone figure card with an optional sparkline. */
export function statTile({ label, value, sub = '', foot = '', accent = null }) {
  return card(`
    ${eyebrow(label)}
    <div style="margin-top:8px;font-size:26px;font-weight:700;letter-spacing:-0.04em;font-variant-numeric:tabular-nums;${accent ? `color:${accent}` : ''}">${value}</div>
    ${sub ? `<div style="margin-top:4px;font-size:12px;color:var(--muted)">${sub}</div>` : ''}
    ${foot ? `<div style="margin-top:12px">${foot}</div>` : ''}`);
}

export function pageIntro(title, subtitle = '', action = '') {
  return `<div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:24px">
    <div style="min-width:0">
      <h1 style="font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-0.03em;margin:0;color:var(--ink)">${title}</h1>
      ${subtitle ? `<p style="color:var(--ink-soft);font-size:14px;margin:6px 0 0">${subtitle}</p>` : ''}
    </div>
    ${action ? `<div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap">${action}</div>` : ''}
  </div>`;
}

export function emptyState(title, hint = '', action = '') {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:56px 16px">
    <div style="width:48px;height:48px;border-radius:16px;background:var(--fill);border:1px solid var(--line);color:var(--ink-soft);display:grid;place-items:center;margin-bottom:16px;font-size:19px">◦</div>
    <p style="font-weight:600;color:var(--ink);font-size:15px;margin:0">${title}</p>
    ${hint ? `<p style="font-size:13px;color:var(--muted);margin:8px 0 0;max-width:360px;line-height:1.6">${hint}</p>` : ''}
    ${action ? `<div style="margin-top:20px">${action}</div>` : ''}
  </div>`;
}

// ---- DataGrid -------------------------------------------------------------
/**
 * The table. Header row is uppercase 9.5px; body rows are 44px with a hairline
 * between them; numeric columns are right-aligned and tabular.
 */
export function table({ head, rows, align = [], w = [], cal = '' }) {
  const al = (i) => (align[i] === 'r' ? 'text-align:right' : align[i] === 'c' ? 'text-align:center' : '');
  return `<div ${cal ? 'class="cal-host"' : ''} style="width:100%">${cal}
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      ${head.map((h, i) => `<th style="padding:0 12px 9px 0;font-size:9.5px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;
        color:var(--muted);border-bottom:1px solid var(--line);white-space:nowrap;${al(i)};${w[i] ? `width:${w[i]}` : ''}">${h}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>${r.map((c, i) => `<td style="padding:10px 12px 10px 0;font-size:12.5px;color:var(--ink-soft);
        border-bottom:1px solid var(--line);white-space:nowrap;font-variant-numeric:tabular-nums;${al(i)}">${c}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table></div>`;
}

/** A divided list — transactions, holdings, bills. */
export function list(rows, { cal = '' } = {}) {
  return `<div ${cal ? 'class="cal-host"' : ''}>${cal}
    ${rows.map((r, i) => `<div style="display:flex;align-items:center;gap:12px;padding:11px 0;${i ? 'border-top:1px solid var(--line)' : ''}">${r}</div>`).join('')}
  </div>`;
}

/** The circular monogram used as a merchant / account / symbol avatar. */
export function avatar(text, { size = 34, tone = 'var(--fill)', color = 'var(--ink-soft)' } = {}) {
  return `<span style="flex:none;width:${size}px;height:${size}px;border-radius:${size >= 32 ? '11px' : '9px'};background:${tone};color:${color};
    display:grid;place-items:center;font-size:${size >= 32 ? 12 : 10.5}px;font-weight:700;letter-spacing:-0.01em">${text}</span>`;
}

/** Row of label + value used inside cards. */
export function kv(rows) {
  return `<div>${rows.map((r, i) => `
    <div style="display:flex;align-items:baseline;gap:12px;padding:8px 0;${i ? 'border-top:1px solid var(--line)' : ''}">
      <span style="font-size:12.5px;color:var(--muted)">${r[0]}</span>
      <span style="margin-left:auto;font-size:12.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums">${r[1]}</span>
    </div>`).join('')}</div>`;
}

/** A tinted advisory strip — insights, warnings, the demo badge. */
export function banner(title, body, tone = 'accent', { icon = '' } = {}) {
  const map = {
    accent: ['var(--accent-soft)', 'var(--accent-line)', 'var(--accent)'],
    warning: ['var(--warning-soft)', 'color-mix(in srgb,var(--warning) 30%,transparent)', 'var(--warning)'],
    danger: ['var(--danger-soft)', 'color-mix(in srgb,var(--danger) 26%,transparent)', 'var(--danger)'],
    neutral: ['var(--fill)', 'var(--line)', 'var(--ink-soft)'],
    info: ['color-mix(in srgb,var(--info) 12%,transparent)', 'color-mix(in srgb,var(--info) 28%,transparent)', 'var(--info)'],
  }[tone];
  return `<div style="display:flex;gap:12px;padding:13px 15px;border-radius:var(--radius-input);background:${map[0]};border:1px solid ${map[1]}">
    ${icon ? `<span style="flex:none;color:${map[2]};font-size:14px;line-height:1.35">${icon}</span>` : ''}
    <div style="min-width:0">
      <div style="font-size:12.5px;font-weight:600;color:var(--ink)">${title}</div>
      ${body ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:3px;line-height:1.55">${body}</div>` : ''}
    </div></div>`;
}

export { cx };
