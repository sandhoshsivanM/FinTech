/**
 * Part D — the phone at 390 × 844, printed 1:1.
 *
 * The web client's five bottom-nav destinations match the Flutter tab bar
 * exactly (a test asserts it), so these frames double as the mobile spec for
 * both clients.
 */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { phone } from '../chrome.js';
import { page, divider } from '../doc.js';

const CAT_ICON = {
  Food: 'coins', Transport: 'car', Rent: 'home', Utilities: 'building-2', Shopping: 'receipt',
  Health: 'heart-pulse', Entertainment: 'sparkles', EMI: 'landmark', Salary: 'wallet',
  Investment: 'trending-up', Other: 'file-text',
};

const mCard = (inner, style = '') => `<div class="card" style="padding:14px;${style}">${inner}</div>`;
const mEyebrow = (t) => `<div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">${t}</div>`;

// ---- Overview -------------------------------------------------------------
const overview = phone({
  path: '/dashboard', title: 'Overview', fab: true,
  body: `
    <div class="hero-gradient" style="padding:16px;margin-bottom:12px">
      <div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.62)">Net worth</div>
      <div style="margin-top:7px;font-size:31px;font-weight:700;letter-spacing:-0.04em;color:#fff;font-variant-numeric:tabular-nums">${D.compact(D.NET_WORTH)}</div>
      <div style="margin-top:7px;display:flex;align-items:center;gap:9px">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(32,201,138,.20);color:#34C98A;font-size:11px;font-weight:600">↑ 22.0%</span>
        <span style="font-size:11px;color:rgba(255,255,255,.55)">over 90 days</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      ${[['Portfolio', D.compact(D.PORTFOLIO.current), `${D.PORTFOLIO.count} holdings`],
         ['Cash', D.compact(D.CASH), '3 accounts'],
         ['This month', D.compact(D.MONTH_EXPENSE), 'spent'],
         ['Debt', D.compact(D.DEBT), '3 accounts']].map(([l, v, s]) => mCard(`
        ${mEyebrow(l)}
        <div style="margin-top:6px;font-size:17px;font-weight:700;letter-spacing:-0.03em;font-variant-numeric:tabular-nums">${v}</div>
        <div style="font-size:10.5px;color:var(--muted);margin-top:1px">${s}</div>`)).join('')}
    </div>

    ${mCard(`
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <span style="font-size:13.5px;font-weight:600">Allocation</span>
        <span style="margin-left:auto;font-size:11px;color:var(--accent);font-weight:600">Details ›</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px">
        ${C.donut({ segments: D.rollup('group').map((g) => ({ label: g.label, value: g.current, color: g.color })), size: 96, thickness: 15, center: D.compact(D.PORTFOLIO.current) })}
        ${C.legend(D.rollup('group').map((g) => ({ label: g.label, color: g.color, right: `${g.share.toFixed(1)}%` })))}
      </div>`, 'margin-bottom:12px')}

    ${mCard(`
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <span style="font-size:13.5px;font-weight:600">Recent</span>
        <span style="margin-left:auto;font-size:11px;color:var(--accent);font-weight:600">All ›</span>
      </div>
      ${D.LEDGER.filter((r) => r.d <= 3 && r.type === 'expense').slice(0, 3).map((r, i) => `
        <div style="display:flex;align-items:center;gap:11px;padding:8px 0;${i ? 'border-top:1px solid var(--line)' : ''}">
          ${K.avatar(icon(CAT_ICON[r.category], 15), { size: 32 })}
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${r.merchant}</span>
            <span style="display:block;font-size:10.5px;color:var(--muted)">${r.category}</span></span>
          <span style="font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">−${D.money0(r.amount)}</span>
        </div>`).join('')}`)}`,
});

// ---- Cash Flow ------------------------------------------------------------
const cashflow = phone({
  path: '/transactions', title: 'Cash Flow', fab: true,
  body: `
    <div style="display:flex;gap:10px;margin-bottom:12px">
      ${[['In', D.compact(D.MONTH_INCOME), 'var(--success)'], ['Out', D.compact(D.MONTH_EXPENSE), 'var(--danger)'], ['Net', D.compact(D.MONTH_INCOME - D.MONTH_EXPENSE), 'var(--ink)']].map(([l, v, c]) => `
        <div class="card" style="flex:1;padding:11px 12px">
          ${mEyebrow(l)}
          <div style="margin-top:5px;font-size:15px;font-weight:700;letter-spacing:-0.03em;color:${c};font-variant-numeric:tabular-nums">${v}</div>
        </div>`).join('')}
    </div>

    <div style="margin-bottom:12px">${K.segmented(['All', 'Expense', 'Income', 'Transfer'], 0)}</div>

    ${mCard(D.BUDGETS.slice(0, 3).map((b, i) => `
      <div style="padding:${i ? '9px' : '0'} 0 9px">
        <div style="display:flex;font-size:11.5px;margin-bottom:5px">
          <span style="color:var(--ink-soft)">${b.category}</span>
          <span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(b.spent)} / ${D.money0(b.limit)}</span>
        </div>${K.progress(b.fraction, { height: 5 })}
      </div>`).join(''), 'margin-bottom:12px')}

    ${[0, 1, 3].map((d) => {
      const rows = D.LEDGER.filter((r) => r.d === d);
      // The day header carries the day's NET, so income and expense cannot both
      // be summed as outflow — the mistake that makes a payday look ruinous.
      const net = rows.reduce((a, r) => a + (r.type === 'income' ? r.amount : -r.amount), 0);
      return `
      <div style="display:flex;align-items:baseline;padding:11px 2px 6px">
        <span style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">
          ${d === 0 ? 'Today' : d === 1 ? 'Yesterday' : D.dmy(D.daysAgo(d))}</span>
        <span style="margin-left:auto;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--${net >= 0 ? 'success' : 'muted'})">
          ${D.signed(net, D.money0)}</span>
      </div>
      ${mCard(rows.map((r, i) => `
        <div style="display:flex;align-items:center;gap:11px;padding:${i ? '9px' : '0'} 0 9px;${i ? 'border-top:1px solid var(--line)' : ''}">
          ${K.avatar(icon(CAT_ICON[r.category] ?? 'file-text', 15), {
            size: 32,
            tone: r.type === 'income' ? 'var(--success-soft)' : 'var(--fill)',
            color: r.type === 'income' ? 'var(--success)' : 'var(--ink-soft)' })}
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${r.merchant}</span>
            <span style="display:block;font-size:10.5px;color:var(--muted)">${r.category}</span></span>
          <span style="font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--${r.type === 'income' ? 'success' : 'ink'})">
            ${r.type === 'income' ? '+' : '−'}${D.money0(r.amount)}</span>
        </div>`).join(''))}`;
    }).join('')}`,
});

// ---- Investments ----------------------------------------------------------
const investments = phone({
  path: '/investments', title: 'Investments',
  body: `
    ${mCard(`
      ${mEyebrow('Portfolio value')}
      <div style="margin-top:6px;font-size:27px;font-weight:700;letter-spacing:-0.04em;font-variant-numeric:tabular-nums">${D.money0(D.PORTFOLIO.current)}</div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
        ${K.delta(D.PORTFOLIO.pnlPct)}
        <span style="font-size:11.5px;color:var(--muted)">${D.signed(D.PORTFOLIO.pnl, D.compact)} overall</span>
      </div>
      <div style="margin-top:12px">${C.area({ points: D.SNAPSHOTS.map((s) => s.investments), w: 330, h: 78, id: 'mob', grid: false })}</div>`,
      'margin-bottom:12px')}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      ${[['Invested', D.compact(D.PORTFOLIO.invested)], ["Today", D.signed(D.PORTFOLIO.dayPnl, D.compact)]].map(([l, v]) => mCard(`
        ${mEyebrow(l)}
        <div style="margin-top:5px;font-size:16px;font-weight:700;letter-spacing:-0.03em;font-variant-numeric:tabular-nums">${v}</div>`)).join('')}
    </div>

    <div style="margin-bottom:12px">${K.segmented(['Holdings', 'Allocation', 'Movers'], 0)}</div>

    ${mCard(D.byValue.slice(0, 6).map((h, i) => `
      <div style="display:flex;align-items:center;gap:11px;padding:${i ? '9px' : '0'} 0 9px;${i ? 'border-top:1px solid var(--line)' : ''}">
        ${K.avatar(h.symbol.slice(0, 2), { size: 30 })}
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:12.5px;font-weight:600">${h.symbol}</span>
          <span style="display:block;font-size:10.5px;color:var(--muted)">${D.qty(h.qty)} @ ${D.money0(h.avg)}</span></span>
        <span style="text-align:right">
          <span style="display:block;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">${D.compact(h.current)}</span>
          <span style="display:block;margin-top:2px">${K.delta(h.pnlPct)}</span></span>
      </div>`).join(''))}`,
});

// ---- Score ----------------------------------------------------------------
const score = phone({
  path: '/score', title: 'Score',
  body: `
    ${mCard(`
      <div style="display:flex;justify-content:center;padding:6px 0 2px">
        ${C.gauge({ value: D.HEALTH, size: 198, grade: D.healthGrade(D.HEALTH), label: '92% of inputs tracked' })}
      </div>`, 'margin-bottom:12px')}

    ${D.HEALTH_CATEGORIES.map((c) => mCard(`
      <div style="display:flex;align-items:center;gap:13px">
        ${C.ring({ fraction: c.score / 100, size: 52, stroke: 7, center: String(c.score) })}
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:baseline;gap:8px">
            <span style="font-size:13px;font-weight:600">${c.label}</span>
            <span style="margin-left:auto;font-size:10.5px;color:var(--muted)">weight ${c.weight}%</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;line-height:1.45">${c.metrics[0][2]}</div>
        </div>
        <span style="color:var(--muted);flex:none">${icon('chevron-right', 16)}</span>
      </div>`, 'margin-bottom:10px')).join('')}

    ${K.banner('Informational only — not investment advice', '', 'neutral', { icon: icon('shield-check', 14) })}`,
});

// ---- Settings -------------------------------------------------------------
const mRow = (ic, title, detail, right = '') => `
  <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line)">
    <span style="flex:none;color:var(--ink-soft)">${icon(ic, 17)}</span>
    <span style="flex:1;min-width:0">
      <span style="display:block;font-size:12.5px;font-weight:600">${title}</span>
      ${detail ? `<span style="display:block;font-size:10.5px;color:var(--muted);margin-top:1px">${detail}</span>` : ''}
    </span>
    ${right || `<span style="color:var(--muted)">${icon('chevron-right', 15)}</span>`}
  </div>`;

const settings = phone({
  path: '/settings', title: 'Settings',
  body: `
    ${mCard(`
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:44px;height:44px;border-radius:999px;background:var(--accent);color:var(--primary-fg);display:grid;place-items:center;font-size:15px;font-weight:700">SS</span>
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:600">Personal</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">Self · vault unlocked</div>
        </div>
        <span style="margin-left:auto;color:var(--muted)">${icon('chevron-right', 16)}</span>
      </div>`, 'margin-bottom:12px')}

    ${mCard(`${mEyebrow('Appearance')}
      ${mRow('moon', 'Theme', 'Vault — dark', `<span style="font-size:11.5px;color:var(--muted)">Dark</span>`)}
      ${mRow('sparkles', 'Accent', 'Emerald')}
      ${mRow('eye-off', 'Ghost mode', 'Mask every figure')}`, 'margin-bottom:12px')}

    ${mCard(`${mEyebrow('Security')}
      ${mRow('lock', 'Auto-lock', 'After 5 minutes')}
      ${mRow('fingerprint-pattern', 'Biometric unlock', 'Enabled')}
      ${mRow('shield-check', 'Change PIN', '')}`, 'margin-bottom:12px')}

    ${mCard(`${mEyebrow('Data')}
      ${mRow('download', 'Back up vault', 'Encrypted .ftos file')}
      ${mRow('upload', 'Restore', '')}
      ${mRow('trash-2', 'Erase everything', 'Irreversible')}`)}`,
});

// ---- Add ------------------------------------------------------------------
const add = phone({
  path: null, title: 'Add Transaction', top: true,
  body: `
    <div style="margin-bottom:16px">${K.segmented(['Expense', 'Income', 'Transfer'], 0)}</div>

    <div style="text-align:center;padding:16px 0 22px">
      ${mEyebrow('Amount')}
      <div style="margin-top:8px;font-size:44px;font-weight:700;letter-spacing:-0.045em;font-variant-numeric:tabular-nums">₹1,240<span style="color:var(--muted)">.00</span></div>
    </div>

    ${mEyebrow('Category')}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 16px">
      ${['Food', 'Transport', 'Rent', 'Utilities', 'Shopping', 'Health', 'Fun', 'EMI'].map((c, i) => `
        <div style="border-radius:12px;border:1px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'};padding:11px 4px;text-align:center;
          background:${i === 0 ? 'var(--accent-soft)' : 'transparent'};color:var(--${i === 0 ? 'accent' : 'ink-soft'})">
          ${icon(['coins', 'car', 'home', 'building-2', 'receipt', 'heart-pulse', 'sparkles', 'landmark'][i], 16, { style: 'margin:0 auto' })}
          <div style="font-size:9.5px;font-weight:600;margin-top:5px">${c}</div>
        </div>`).join('')}
    </div>

    <div style="display:flex;flex-direction:column;gap:11px">
      ${K.field('Merchant', K.input('Swiggy'))}
      ${K.field('Account', K.select('ICICI Spends'))}
      ${K.field('Date', K.input('09 Aug 2026'))}
    </div>

    <div style="margin-top:18px">${K.button('Save transaction', 'primary', { full: true, icon: icon('check', 15) })}</div>`,
});

// ---- Gate -----------------------------------------------------------------
const MARK = '../../assets/brand/khazana-mark.png';
const gate = `<div style="width:390px;height:844px;display:flex;align-items:center;justify-content:center;padding:24px;
  background:var(--canvas);color:var(--ink);font-family:'Inter',sans-serif;font-variant-numeric:tabular-nums">
  <div style="width:100%">
    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:28px">
      <img src="${MARK}" width="84" height="84" style="object-fit:contain" alt="">
      <span style="margin-top:16px;font-size:22px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase">Khazana</span>
      <p style="margin:9px 0 0;font-size:10.5px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:var(--gold-ink)">Your wealth. Your vault.</p>
    </div>
    <div class="card" style="padding:20px">
      <h2 style="margin:0 0 14px;font-size:17px;font-weight:700;letter-spacing:-0.025em">Unlock</h2>
      <div style="display:flex;align-items:center;height:48px;padding:0 16px;border-radius:14px;background:var(--fill);
        border:1px solid var(--accent);box-shadow:0 0 0 3px var(--accent-line);letter-spacing:.35em;font-size:16px">••••</div>
      <div style="margin-top:14px">${K.button('Unlock', 'primary', { full: true, icon: icon('lock', 15) })}</div>
      <div style="margin-top:9px">${K.button('Use biometrics', 'secondary', { full: true, icon: icon('fingerprint-pattern', 15) })}</div>
    </div>
    <div style="display:flex;gap:14px;margin-top:22px">
      ${[['100% private', 'No server.'], ['Encrypted', 'AES-256 at rest.'], ['Offline first', 'No internet.']].map(([t, d]) => `
        <div style="flex:1;min-width:0">
          <div style="font-size:10.5px;font-weight:700">${t}</div>
          <div style="font-size:9.5px;color:var(--muted);margin-top:2px">${d}</div>
        </div>`).join('')}
    </div>
  </div></div>`;

// ---- Sheets ---------------------------------------------------------------
/**
 * Up to four phones per sheet.
 *
 * Four 390px frames plus their gutters take 1626px of a 1568px well, so the
 * annotation rail cannot sit beside them the way it does on a desktop sheet.
 * Notes run underneath in columns instead, which keeps the promise that mobile
 * frames print 1:1 — scaling them down to buy a rail would break it.
 */
function phoneSheet({ title, sub, frames, theme, notes = [], specs = [] }) {
  const chip = theme === 'dark'
    ? '<span class="tchip vault"><i></i>Vault · dark</span>'
    : '<span class="tchip ledger"><i></i>Ledger · light</span>';
  return page({
    part: 'Part D · Mobile', title, sub, meta: '390 × 844 · printed 1:1',
    body: `
      <div style="display:flex;flex-direction:column;height:100%">
        <div style="display:flex;gap:20px;flex:none">
          ${frames.map(([label, art]) => `
            <div style="flex:none">
              <div class="fname" style="margin-bottom:7px"><b>${label}</b>${chip}</div>
              <div class="frame mobile" style="height:844px">
                <div class="frame-scale thm-${theme}" style="height:844px">${art}</div>
              </div>
            </div>`).join('')}
          ${specs.length ? `
            <div style="flex:1;min-width:0;padding-left:14px">
              <div class="note-h" style="margin-top:22px">Spec</div>
              <table class="kv">${specs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
            </div>` : ''}
        </div>
        ${notes.length ? `
          <div style="margin-top:22px;padding-top:16px;border-top:1px solid #DCE4DF">
            <div style="display:grid;grid-template-columns:repeat(${Math.min(4, notes.length)},1fr);gap:26px">
              ${notes.map((n, i) => `
                <div style="display:flex;gap:9px">
                  <span class="n" style="flex:none;width:19px;height:19px;border-radius:999px;background:#C73D46;color:#fff;
                    font-size:10.5px;font-weight:700;line-height:19px;text-align:center;margin-top:1px">${i + 1}</span>
                  <span style="font-size:11.5px;line-height:1.55;color:#53625B">${n}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}
      </div>`,
  });
}

const NAV_NOTES = [
  `<b>Five tabs, matched across clients.</b> Overview, Cash Flow, Investments, Score, Settings —
   the same five as the Flutter app's bottom bar, asserted by a test so the two cannot drift.`,
  `<b>The active tab gets a pill</b>, not just a colour change: a 999px accent-soft capsule behind
   the glyph, with the label below in accent ink.`,
  `<b>The FAB is not on every tab.</b> It appears where creating a transaction is the obvious next
   action — Overview and Cash Flow — and is absent from Investments, Score and Settings.`,
  `<b>The topbar loses the sidebar toggle and the search field</b>, keeping the mark, the title and
   two icon actions. Search moves behind its icon.`,
];

const NAV_SPECS = [
  ['Viewport', '390 × 844'], ['Bottom bar', '62px'], ['Top bar', '56px'],
  ['Page padding', '14px 16px'], ['Card padding', '14px'], ['Card gap', '10–12px'],
  ['FAB', '54px, 18px radius'], ['Min touch target', '48px'],
  ['Tab label', '10.5px / 500'], ['Active pill', 'accent-soft, 999px'],
];

export default [
  divider({
    part: 'Part D',
    title: 'Mobile',
    lede: `The same product at 390 points. Seven frames printed 1:1 — the five bottom-nav
      destinations, the vault gate and quick add — in both themes.`,
    contents: ['Overview', 'Cash Flow', 'Investments', 'Score', 'Settings', 'Add', 'Gate'],
  }),

  phoneSheet({
    title: 'Bottom-nav destinations', sub: 'Overview · Cash Flow · Investments',
    theme: 'dark',
    frames: [['Overview', overview], ['Cash Flow', cashflow], ['Investments', investments]],
    notes: NAV_NOTES, specs: NAV_SPECS,
  }),

  phoneSheet({
    title: 'Score, settings and quick add', sub: 'Vault',
    theme: 'dark',
    frames: [['Score', score], ['Settings', settings], ['Add Transaction', add]],
    notes: [
      `<b>Settings rows are 48px minimum</b>, icon-led, with the current value on the right — the
       platform convention, because a settings list is not a place to be inventive.`,
      `<b>Quick add drops to a 4-column category grid</b> from six, and the amount steps from 52px to
       44px. The hierarchy is identical; only the density changes.`,
      `<b>Add Transaction has no bottom bar.</b> It is a modal destination — the way out is Save or
       the back chevron, so a tab bar would offer an ambiguous third exit.`,
      `<b>Score keeps the full 198px gauge.</b> The category rows shrink to 52px rings with one
       metric sentence each; the twelve-metric breakdown moves behind a row tap.`,
    ],
    specs: [
      ['Settings row', '≥48px'], ['Category grid', '4 columns'], ['Amount', '44px / 700'],
      ['Gauge', '198px'], ['Category ring', '52px, 7px stroke'], ['Modal exits', 'save · back'],
      ['Chevron', '15–16px lucide'],
    ],
  }),

  phoneSheet({
    title: 'The gate at 390', sub: 'Vault and Ledger, side by side',
    theme: 'dark',
    frames: [['Vault gate · dark', gate]],
    notes: [
      `<b>Already centred.</b> The gate is the one screen that needs no reflow between breakpoints —
       only the mark steps from 96px to 84px.`,
      `<b>The PIN field stays 48px</b> at every width. It is the single interactive target on the
       screen and the one that must never be mis-tapped.`,
      `<b>Trust points survive the narrow width</b> as three columns of two lines rather than being
       dropped — they are the reason a first-time user types a PIN at all.`,
    ],
    specs: [['Mark', '84px on mobile · 96px desktop'], ['Card padding', '20px · 24px desktop'], ['PIN field', '48px h, 14px r'], ['Trust points', '3 columns, kept']],
  }),

  phoneSheet({
    title: 'The same frames in Ledger', sub: 'Light theme',
    theme: 'light',
    frames: [['Overview', overview], ['Cash Flow', cashflow], ['Investments', investments]],
    notes: [
      `<b>The hero keeps its dark plate in both themes.</b> <code>--ink-surface</code> is the one
       surface that does not invert: the net-worth figure is the focal point of the app, and giving
       it a constant ground is what makes the two themes feel like one product.`,
      `<b>Cards become the brightest surface</b> in Ledger — white on a #F5F7F5 page — which is the
       single step that replaces the four-level dark ladder.`,
      `<b>Shadow appears.</b> Vault has none; Ledger adds a 1px shadow under every card, which is
       what keeps the light theme from reading as flat paper.`,
    ],
    specs: [['Hero', 'constant ink-surface'], ['Card', '#FFFFFF on #F5F7F5'], ['Shadow', '0 1px 2px rgba(16,22,19,.05)'], ['Hairline', '#DCE4DF']],
  }),

  phoneSheet({
    title: 'Score, settings and the gate in Ledger', sub: 'Light theme',
    theme: 'light',
    frames: [['Score', score], ['Settings', settings], ['Vault gate', gate]],
    notes: [
      `<b>The gauge keeps its emerald</b> at the darker Ledger step. Because the arc sits on a white
       card rather than near-black, #087A56 carries it at 5.6:1 where the bright step would wash out.`,
      `<b>Faint band arcs survive the theme change</b> at the same 30% opacity — they read against
       both grounds because they are drawn from semantic tokens, not from fixed greys.`,
      `<b>Settings icons drop to <code>--ink-soft</code></b>, which is #53625B in Ledger against
       #A0ADA7 in Vault. Both land near 5:1 on their own card.`,
      `<b>Gold is the one constant.</b> The tagline uses <code>--gold-ink</code>, which steps to
       #8E641B in Ledger purely to clear the 4.5:1 text bar — the mark itself keeps #A97922.`,
    ],
    specs: [['Gauge arc', '#20C98A → #087A56'], ['Band opacity', '0.30, both themes'], ['Icon ink', '#A0ADA7 → #53625B'], ['Gold text', '#D9AD52 → #8E641B'], ['Card', '#151E1A → #FFFFFF']],
  }),
];
