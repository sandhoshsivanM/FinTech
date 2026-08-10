/** /dashboard — the home screen. */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { shell } from '../chrome.js';
import { cal } from '../doc.js';

const groups = D.rollup('group');
const segs = groups.map((g) => ({ label: g.label, value: g.current, color: g.color, right: `${g.share.toFixed(1)}%` }));

const perf = D.SNAPSHOTS.map((s) => s.net);

const movers = [
  ...D.dayMovers.slice(0, 3).map((h) => ({ h, up: true })),
  ...D.dayMovers.slice(-3).reverse().map((h) => ({ h, up: false })),
];

const bills = D.RECURRING.filter((r) => r.type === 'expense').slice(0, 4);

export const body = `
  ${K.pageIntro('Dashboard', 'Everything, at a glance — as of ' + D.dmy(D.TODAY),
    K.segmented(['1W', '1M', '3M', '6M', '1Y', 'ALL'], 2) + K.button('Add transaction', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Portfolio value', value: D.compact(D.PORTFOLIO.current), sub: `${D.PORTFOLIO.count} holdings` },
    { label: "Today's gain", value: D.signed(D.PORTFOLIO.dayPnl), sub: D.pct(D.PORTFOLIO.dayPct), accent: D.PORTFOLIO.dayPnl >= 0 ? 'var(--success)' : 'var(--danger)' },
    { label: 'Overall return', value: D.pct(D.PORTFOLIO.pnlPct), sub: D.signed(D.PORTFOLIO.pnl), accent: 'var(--success)' },
    { label: 'Total invested', value: D.compact(D.PORTFOLIO.invested), sub: 'cost basis' },
    { label: 'Available cash', value: D.compact(D.CASH), sub: '3 accounts' },
    { label: 'Net worth', value: D.compact(D.NET_WORTH), sub: `less ${D.compact(D.DEBT)} debt` },
    { label: 'Dividends', value: D.compact(D.DIV_RECEIVED), sub: 'received, 12 months' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`
      ${K.sectionHeader('Portfolio performance',
        `<span style="display:flex;align-items:center;gap:12px">
          ${K.delta(22.0, { text: '22.0% · 90 days' })}
          ${K.segmented(['1W', '1M', '3M', '6M', '1Y', 'ALL'], 2)}
        </span>`)}
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
        <span style="font-size:32px;font-weight:700;letter-spacing:-0.04em;font-variant-numeric:tabular-nums">${D.money0(D.NET_WORTH)}</span>
        <span style="font-size:12px;color:var(--muted)">net worth · 91 daily snapshots</span>
      </div>
      ${C.area({ points: perf, w: 700, h: 208, id: 'dash', labels: [D.dm(D.SNAPSHOTS[0].date), D.dm(D.SNAPSHOTS[30].date), D.dm(D.SNAPSHOTS[60].date), 'Today'] })}`,
      { style: 'flex:1.75;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`
      ${K.sectionHeader('Allocation', K.segmented(['Asset', 'Sector', 'Cap'], 0))}
      <div style="display:flex;align-items:center;gap:20px">
        ${C.donut({ segments: segs, size: 156, thickness: 21, center: D.compact(D.PORTFOLIO.current), sub: 'market value' })}
        ${C.legend(segs)}
      </div>
      <p style="margin:16px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
        Slices render in a fixed group order, never sorted by value — the order is what keeps the palette readable for colourblind viewers.</p>`,
      { style: 'flex:1;min-width:0', cal: cal(3, 'tl') })}
  </div>

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`
      ${K.sectionHeader("Today's movers", `<span style="font-size:11px;color:var(--muted)">demo prices</span>`)}
      ${['Gainers', 'Losers'].map((h, col) => `
        <div style="${col ? 'margin-top:12px;padding-top:11px;border-top:1px solid var(--line)' : ''}">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">${h}</div>
          ${movers.filter((m) => (col === 0 ? m.up : !m.up)).map(({ h: x }) => `
            <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
              <span style="min-width:0;flex:1">
                <span style="display:block;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.symbol}</span>
                <span style="display:block;font-size:10.5px;color:var(--muted)">${x.name}</span>
              </span>
              <span style="font-size:12px;font-variant-numeric:tabular-nums;color:var(--ink-soft)">${D.money0(x.last)}</span>
              ${K.delta(x.dayPct)}
            </div>`).join('')}
        </div>`).join('')}`, { style: 'flex:1.35;min-width:0' })}

    ${K.card(`
      ${K.sectionHeader('Financial health')}
      <div style="display:flex;align-items:center;gap:18px">
        ${C.gauge({ value: D.HEALTH, size: 168, grade: D.healthGrade(D.HEALTH), label: '92% of inputs tracked' })}
        <div style="flex:1;min-width:0">
          ${D.HEALTH_CATEGORIES.map((c) => `
            <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
              <span style="font-size:11.5px;color:var(--ink-soft);width:74px">${c.label}</span>
              <span style="flex:1">${K.progress(c.score / 100, { height: 1200, color: 'var(--accent)' })}</span>
              <span style="font-size:11.5px;font-weight:600;width:24px;text-align:right;font-variant-numeric:tabular-nums">${c.score}</span>
            </div>`).join('')}
        </div>
      </div>`, { style: 'flex:1.15;min-width:0', cal: cal(4, 'tl') })}

    ${K.card(`
      ${K.sectionHeader('Insights')}
      <div style="display:flex;flex-direction:column;gap:9px">
        ${K.banner('Net worth is up 22.0% over 90 days', `From ${D.compact(D.SNAPSHOTS[0].net)} to ${D.compact(D.NET_WORTH)}.`, 'accent', { icon: icon('trending-up', 15) })}
        ${K.banner(`${D.TIGHTEST_BUDGET.category} is ${(D.TIGHTEST_BUDGET.fraction * 100).toFixed(0)}% through its budget`,
          `${D.money0(D.TIGHTEST_BUDGET.spent)} of ${D.money0(D.TIGHTEST_BUDGET.limit)} with ${D.DAYS_LEFT} days to go.`, 'warning', { icon: icon('triangle-alert', 15) })}
        ${K.banner(`Safe to spend ${D.money0(D.SAFE_TO_SPEND.perDay)} a day`,
          `${D.money0(D.SAFE_TO_SPEND.remaining)} left across your budgets this month.`, 'neutral', { icon: icon('sparkles', 15) })}
      </div>
      <p style="margin:12px 0 0;font-size:10.5px;color:var(--muted)">Informational only — not investment advice.</p>`,
      { style: 'flex:1.25;min-width:0', cal: cal(5, 'tl') })}
  </div>

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`
      ${K.sectionHeader('Top holdings', `<span style="font-size:12px;color:var(--accent);font-weight:600">View all ${D.PORTFOLIO.count} →</span>`)}
      ${K.table({
        head: ['Instrument', 'Qty', 'Avg cost', 'Last', 'Value', 'P&amp;L', 'Return'],
        align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'],
        w: ['30%'],
        rows: D.byValue.slice(0, 6).map((h) => [
          `<span style="display:flex;align-items:center;gap:10px">${K.avatar(h.symbol.slice(0, 2), { size: 26 })}
            <span><b style="color:var(--ink);font-weight:600">${h.symbol}</b>
            <span style="display:block;font-size:10.5px;color:var(--muted)">${h.name}</span></span></span>`,
          D.qty(h.qty), D.money0(h.avg), D.money0(h.last), D.money0(h.current),
          `<span style="color:var(--${h.pnl >= 0 ? 'success' : 'danger'})">${D.signed(h.pnl, D.money0)}</span>`,
          K.delta(h.pnlPct),
        ]),
      })}`, { style: 'flex:2;min-width:0', cal: cal(6, 'tl') })}

    ${K.card(`
      ${K.sectionHeader('Upcoming bills')}
      ${K.list(bills.map((b) => `
        ${K.avatar(b.merchant.slice(0, 2), { size: 30 })}
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.merchant}</span>
          <span style="display:block;font-size:11px;color:var(--muted)">${b.category} · in ${b.inDays} days</span>
        </span>
        <span style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(b.amount)}</span>`))}
      <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--line);display:flex;align-items:baseline">
        <span style="font-size:12px;color:var(--muted)">Monthly total</span>
        <span style="margin-left:auto;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">${D.money0(bills.reduce((a, b) => a + b.amount, 0))}</span>
      </div>`, { style: 'flex:1;min-width:0' })}
  </div>`;

const art = shell({ path: '/dashboard', title: 'Dashboard', body, h: 1200 });

const meta = {
  name: 'Dashboard',
  route: '/dashboard',
  height: 1200,
  purpose: `The one screen that answers “where do I stand”. Seven headline figures, then the
    net-worth trend, allocation, movers, health, generated insights, top positions and what is
    due next — in that order, because it descends from position to trajectory to detail.`,
  notes: [
    `<b>KPI strip.</b> One card, divided by hairlines rather than seven cards — a row of separate
     cards competes with the sections below it. Figures are 22px/700 at −0.035em tracking, tabular.`,
    `<b>Portfolio performance.</b> Reads the real 91-day snapshot series. With fewer than two
     snapshots the app draws a labelled derived estimate instead of an empty chart.`,
    `<b>Allocation.</b> Segmented control switches the roll-up dimension between asset group,
     sector and market cap. Any roll-up must sum exactly to the portfolio total.`,
    `<b>Health gauge.</b> 240° sweep with the five bands drawn faintly on the track. Below 50%
     tracked weight the grade renders <code>null</code>, not a low score.`,
    `<b>Insights.</b> Generated sentences filtered through a banned-phrase list (“consider”,
     “you should”, “invest in”) and always closed by the disclaimer.`,
    `<b>Top holdings.</b> Six rows of the ${D.PORTFOLIO.count}; the link states the full count so the
     truncation is never mistaken for the whole book.`,
  ],
  specs: [
    ['Content max', '1560px'],
    ['Page padding', '24px 32px'],
    ['Card gap', '16px'],
    ['Card padding', '20px'],
    ['Card radius', '14px'],
    ['KPI figure', '22px / 700 / −0.035em'],
    ['Donut thickness', '21px'],
    ['Chart height', '208px'],
  ],
};

export default [{ art, meta }];
