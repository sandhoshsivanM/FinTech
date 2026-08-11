/**
 * The application shell.
 *
 * Sidebar, topbar, content well and bottom bar, at the metrics `Shell.tsx`
 * compiles to: 248px nav (76px collapsed rail), 64px topbar, 32px page padding
 * at desktop, 1560px content max. Every artboard in Part C is this shell with a
 * different `body`.
 */
import { icon } from './icons.js';

const MARK = '../../assets/brand/khazana-mark.png';

/** NAV_GROUPS from webapp/src/components/navConfig.ts, verbatim. */
export const NAV_GROUPS = [
  ['Overview', [
    ['/dashboard', 'Dashboard', 'layout-dashboard'],
    ['/analytics', 'Analytics', 'line-chart'],
    ['/reports', 'Reports', 'bar-chart-3'],
    ['/forecast', 'Forecast', 'calendar-clock'],
  ]],
  ['Invest', [
    ['/investments', 'Portfolio', 'trending-up'],
    ['/holdings', 'Holdings', 'table-2'],
    ['/watchlist', 'Watchlist', 'star'],
    ['/markets', 'Markets', 'candlestick-chart'],
    ['/dividends', 'Dividends', 'coins'],
    ['/tax', 'Tax Centre', 'landmark'],
  ]],
  ['Money', [
    ['/accounts', 'Accounts', 'wallet'],
    ['/transactions', 'Transactions', 'receipt'],
    ['/calendar', 'Calendar', 'calendar-days'],
    ['/budget', 'Budget', 'pie-chart'],
    ['/recurring', 'Recurring', 'repeat'],
    ['/goals', 'Goals', 'flag'],
  ]],
  ['Protect', [
    ['/liabilities', 'Liabilities', 'credit-card'],
    ['/insurance', 'Insurance', 'shield'],
    ['/safety-net', 'Safety Net', 'life-buoy'],
  ]],
  // Things you operate the vault WITH, rather than things you look at.
  ['Tools', [
    ['/import', 'Import', 'upload'],
    ['/reconcile', 'Reconcile', 'scale'],
    ['/alerts', 'Alerts', 'bell'],
    ['/diagnostics', 'Diagnostics', 'stethoscope'],
    ['/news', 'News', 'newspaper'],
    ['/settings', 'Settings', 'settings'],
    ['/help', 'Help', 'circle-help'],
  ]],
];

/** BOTTOM_NAV — the five phone destinations, matching the Flutter tab bar. */
export const BOTTOM_NAV = [
  ['/dashboard', 'Overview', 'layout-dashboard'],
  ['/transactions', 'Cash Flow', 'receipt'],
  ['/investments', 'Investments', 'trending-up'],
  ['/score', 'Financial Health', 'gauge'],
  ['/settings', 'Settings', 'settings'],
];

const isActive = (href, path) => path === href || (href !== '/dashboard' && path.startsWith(href));

export function sidebar(path, { cal = '' } = {}) {
  return `<aside class="${cal ? 'cal-host' : ''}" style="width:248px;flex:none;height:100%;display:flex;flex-direction:column;
    background:var(--surface);border-right:1px solid var(--line)">${cal}
    <div style="display:flex;align-items:center;gap:12px;padding:18px 20px 16px">
      <img src="${MARK}" width="34" height="34" style="object-fit:contain;flex:none" alt="">
      <span style="font-size:15px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink)">Khazana</span>
    </div>
    <nav style="flex:1;padding:0 12px 12px;overflow:hidden">
      ${NAV_GROUPS.map(([label, items]) => `
        <div style="margin-bottom:10px">
          <p style="margin:0 0 6px;padding:0 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.11em;color:var(--muted)">${label}</p>
          ${items.map(([href, name, ic]) => {
            const on = isActive(href, path);
            return `<div style="display:flex;align-items:center;gap:12px;border-radius:11px;margin-bottom:2px;padding:6px 10px;
              font-size:13.5px;line-height:1.45;font-weight:${on ? 600 : 400};
              ${on ? 'background:var(--accent-soft);color:var(--accent)' : 'color:var(--ink-soft)'}">
              ${icon(ic, 16.5)}<span>${name}</span></div>`;
          }).join('')}
        </div>`).join('')}
    </nav>
    <div style="padding:12px;border-top:1px solid var(--line);display:grid;gap:10px">
      <span style="display:flex;align-items:center;justify-content:center;gap:8px;height:40px;border-radius:var(--radius-btn);
        background:var(--primary);color:var(--primary-fg);font-size:13px;font-weight:600">
        ${icon('plus', 15)}Add transaction</span>
      <p style="display:flex;align-items:center;gap:8px;margin:0;padding:0 4px;font-size:11px;color:var(--muted)">
        <span style="width:6px;height:6px;border-radius:999px;background:var(--success);box-shadow:0 0 0 3px var(--success-soft);flex:none"></span>
        Vault unlocked · encrypted
      </p>
    </div>
  </aside>`;
}

export function topbar(title, { cal = '', marketOpen = true, actions = true } = {}) {
  return `<header class="${cal ? 'cal-host' : ''}" style="height:64px;flex:none;display:flex;align-items:center;gap:8px;
    padding:0 32px;border-bottom:1px solid var(--line);background:var(--canvas)">${cal}
    <span style="width:36px;height:36px;display:grid;place-items:center;border-radius:10px;color:var(--ink-soft)">${icon('panel-left-close', 17)}</span>
    <span style="font-size:15px;font-weight:600;letter-spacing:-0.02em;color:var(--ink);margin-left:2px">${title}</span>

    <span style="margin-left:16px;display:flex;align-items:center;gap:10px;height:36px;padding:0 10px 0 6px;
      border-radius:var(--radius-btn);border:1px solid var(--line);background:var(--card)">
      <span style="width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:var(--accent-soft);
        color:var(--accent);font-size:11.5px;font-weight:700;box-shadow:inset 0 0 0 1px var(--accent-line)">SS</span>
      <span style="min-width:0">
        <span style="display:block;font-size:13px;font-weight:600;line-height:1.15;color:var(--ink)">Personal</span>
        <span style="display:block;font-size:10.5px;line-height:1.15;color:var(--muted)">Self</span>
      </span>
      ${icon('chevron-down', 13, { style: 'color:var(--muted)' })}
    </span>

    <span style="display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;flex:1;max-width:380px;
      border-radius:var(--radius-btn);border:1px solid var(--line);background:var(--card);color:var(--muted);font-size:13px">
      ${icon('search', 15)}<span>Search transactions, holdings…</span>
      <span style="margin-left:auto;font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:6px;
        background:var(--fill-strong);border:1px solid var(--line)">⌘K</span>
    </span>

    ${actions ? `
    <span style="margin-left:auto;display:flex;align-items:center;gap:6px">
      <span style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:999px;
        font-size:11.5px;font-weight:600;white-space:nowrap;
        ${marketOpen ? 'background:var(--success-soft);color:var(--success)' : 'background:var(--fill);color:var(--muted)'}">
        <span style="width:7px;height:7px;border-radius:999px;background:currentColor"></span>
        NSE ${marketOpen ? 'open' : 'closed'} · 27,412.35
      </span>
      ${['refresh-cw', 'download', 'bell', 'moon'].map((n) => `<span style="width:36px;height:36px;display:grid;place-items:center;border-radius:10px;color:var(--ink-soft)">${icon(n, 17)}</span>`).join('')}
      <span style="width:32px;height:32px;display:grid;place-items:center;border-radius:999px;background:var(--accent);
        color:var(--primary-fg);font-size:12px;font-weight:700;margin-left:2px">SS</span>
    </span>` : ''}
  </header>`;
}

/**
 * A complete desktop artboard: chrome plus a page body.
 * `h` is the artboard height; content is clipped by the frame, as in Figma.
 */
export function shell({ path, title, body, h = 940, sidebarCal = '', topbarCal = '' }) {
  return `<div style="display:flex;height:${h}px;background:var(--canvas);color:var(--ink);
    font-family:'Inter',sans-serif;font-size:14px;line-height:1.5;letter-spacing:-0.006em;font-variant-numeric:tabular-nums">
    ${sidebar(path, { cal: sidebarCal })}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      ${topbar(title, { cal: topbarCal })}
      <main style="flex:1;min-height:0;padding:24px 32px;overflow:hidden">
        <div style="max-width:1560px;margin:0 auto">${body}</div>
      </main>
    </div>
  </div>`;
}

// ---- Mobile ---------------------------------------------------------------
export function mobileTop(title, { back = false } = {}) {
  return `<div style="height:56px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;
    border-bottom:1px solid var(--line);background:var(--canvas)">
    ${back ? `<span style="color:var(--ink-soft)">${icon('chevron-left', 20)}</span>`
      : `<img src="${MARK}" width="26" height="26" style="object-fit:contain" alt="">`}
    <span style="font-size:15px;font-weight:600;letter-spacing:-0.02em">${title}</span>
    <span style="margin-left:auto;display:flex;gap:4px;color:var(--ink-soft)">
      ${icon('search', 18)}${icon('bell', 18)}
    </span>
  </div>`;
}

export function bottomNav(path) {
  return `<div style="height:62px;flex:none;display:flex;align-items:stretch;border-top:1px solid var(--line);background:var(--canvas)">
    ${BOTTOM_NAV.map(([href, label, ic]) => {
      const on = isActive(href, path);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding-top:8px;
        font-size:10.5px;font-weight:500;color:${on ? 'var(--accent)' : 'var(--muted)'}">
        <span style="padding:2px 16px;border-radius:999px;${on ? 'background:var(--accent-soft)' : ''}">${icon(ic, 19)}</span>
        <span>${label}</span></div>`;
    }).join('')}
  </div>`;
}

/** A 390×844 phone artboard. */
export function phone({ path, title, body, fab = false, top = true, h = 844 }) {
  return `<div style="width:390px;height:${h}px;display:flex;flex-direction:column;position:relative;
    background:var(--canvas);color:var(--ink);font-family:'Inter',sans-serif;font-size:14px;line-height:1.5;
    letter-spacing:-0.006em;font-variant-numeric:tabular-nums;overflow:hidden">
    ${top ? mobileTop(title) : ''}
    <div style="flex:1;min-height:0;padding:14px 16px;overflow:hidden">${body}</div>
    ${fab ? `<span style="position:absolute;right:16px;bottom:78px;width:54px;height:54px;border-radius:18px;
      background:var(--primary);color:var(--primary-fg);display:grid;place-items:center;
      box-shadow:0 8px 24px -8px color-mix(in srgb,var(--primary) 75%,transparent)">${icon('plus', 24)}</span>` : ''}
    ${path ? bottomNav(path) : ''}
  </div>`;
}
