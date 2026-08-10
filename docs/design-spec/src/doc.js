/**
 * Sheet helpers.
 *
 * Every page in the document is built by `page()`, which owns the running head
 * and drops a folio placeholder. `build.mjs` replaces those placeholders with
 * sequential numbers at the very end, so pages can be reordered or inserted
 * without renumbering anything by hand.
 */

export const FOLIO = '<!--FOLIO-->';

/** One sheet. */
export function page({ part = '', title = '', sub = '', meta = '', cls = '', head = true, body = '' }) {
  const rh = head
    ? `<div class="rh">
         ${part ? `<span class="rh-part">${part}</span>` : ''}
         ${title ? `<span class="rh-title">${title}</span>` : ''}
         ${sub ? `<span class="rh-sub">${sub}</span>` : ''}
         ${meta ? `<span class="rh-spacer"></span><span class="rh-meta">${meta}</span>` : ''}
       </div>`
    : '';
  return `<section class="page ${cls}">${rh}<div class="body">${body}</div><div class="folio">${FOLIO}</div></section>`;
}

/** A full-bleed divider announcing a new part. */
export function divider({ part, title, lede, contents = [] }) {
  return page({
    cls: 'sheet-plate',
    head: false,
    body: `
      <div style="height:100%;display:flex;flex-direction:column;justify-content:center;max-width:1080px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#D9AD52">${part}</div>
        <h1 style="font-size:62px;line-height:1.06;font-weight:700;letter-spacing:-0.035em;margin:18px 0 0">${title}</h1>
        <p class="lede" style="margin:22px 0 0;font-size:16px;color:rgba(255,255,255,.72);max-width:760px">${lede}</p>
        ${contents.length ? `
          <div style="margin-top:44px;display:flex;flex-wrap:wrap;gap:10px;max-width:900px">
            ${contents.map((c) => `<span style="font-size:12px;font-weight:600;padding:6px 13px;border-radius:999px;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.86)">${c}</span>`).join('')}
          </div>` : ''}
      </div>`,
  });
}

/**
 * A screen page: one scaled artboard beside an annotation rail.
 *
 * `art` is the 1440px-wide mockup markup; it is rendered inside a themed
 * wrapper so the same string produces the Vault and the Ledger frame.
 */
export function screenPage({ part = 'Part C · Screens', name, route, theme, art, height = 940, purpose = '', notes = [], specs = [], extra = '' }) {
  const isDark = theme === 'dark';
  const chip = isDark
    ? '<span class="tchip vault"><i></i>Vault · dark</span>'
    : '<span class="tchip ledger"><i></i>Ledger · light</span>';
  return page({
    part,
    title: name,
    sub: route,
    meta: `1440 × ${height} · desktop`,
    body: `
      <div class="frame-row">
        <div class="frame-col">
          <div class="fname">
            <b>${name}</b><span class="dim">/ Desktop / ${isDark ? 'Vault' : 'Ledger'}</span>
            ${chip}
            <span class="rh-spacer"></span><span class="dim">${route}</span>
          </div>
          <!-- The frame box carries the SCALED height. A CSS transform does not
               change layout size, so without this the box stays 1440-space tall
               and the sheet overflows by the difference. -->
          <div class="frame" style="height:${Math.round(height * 0.8194444)}px">
            <div class="frame-scale thm-${theme}" style="height:${height}px;background:var(--canvas);color:var(--ink)">${art}</div>
          </div>
        </div>
        <div class="note-col">
          ${purpose ? `<div class="note-h">What this screen is for</div><p class="note-p">${purpose}</p>` : ''}
          ${notes.length ? `<div class="note-h">Annotations</div><ol class="notes">${notes.map((n, i) => `<li><span class="n">${i + 1}</span><span>${n}</span></li>`).join('')}</ol>` : ''}
          ${specs.length ? `<div class="note-h">Spec</div><table class="kv">${specs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>` : ''}
          ${extra}
        </div>
      </div>`,
  });
}

/** Numbered callout badge, dropped inside a `.cal-host` element. */
export function cal(n, pos = '') { return `<span class="cal ${pos}">${n}</span>`; }

/** Escape for text interpolated into markup. */
export function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
