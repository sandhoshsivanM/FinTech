/** Overview group — /analytics and /reports. */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { shell } from '../chrome.js';
import { cal } from '../doc.js';

// ---------------------------------------------------------------- /analytics
const returnBuckets = (() => {
  const edges = [-20, -10, 0, 10, 20, 30, 40, 100];
  const labels = ['<−10%', '−10–0', '0–10%', '10–20%', '20–30%', '30–40%', '>40%'];
  return labels.map((label, i) => ({
    label,
    values: [{ value: D.HOLDINGS.filter((h) => h.pnlPct >= edges[i] && h.pnlPct < edges[i + 1]).length, color: i < 2 ? 'var(--danger)' : 'var(--c1)' }],
  }));
})();

const analyticsBody = `
  ${K.pageIntro('Analytics', 'How the portfolio is built, and how it behaves',
    K.segmented(['3M', '6M', '1Y', 'ALL'], 2))}

  ${K.statStrip([
    { label: 'Diversification', value: '54', sub: 'of 100 — concentrated', accent: 'var(--warning)' },
    { label: 'Concentration', value: `${D.CONCENTRATION.toFixed(1)}%`, sub: 'largest asset group' },
    { label: 'Positions', value: String(D.PORTFOLIO.count), sub: `${D.rollup('sector').length} sectors` },
    { label: 'Return quality', value: '68', sub: `${D.HOLDINGS.filter((h) => h.pnl > 0).length} of ${D.PORTFOLIO.count} in profit` },
    { label: 'Best position', value: D.gainers[0].symbol, sub: D.pct(D.gainers[0].pnlPct), accent: 'var(--success)' },
    { label: 'Weakest', value: D.losers[0].symbol, sub: D.pct(D.losers[0].pnlPct), accent: 'var(--danger)' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Risk &amp; diversification')}
      <div style="display:flex;gap:22px;align-items:center">
        ${C.gauge({ value: 54, size: 172, grade: 'Concentrated', label: 'diversification score' })}
        <div style="flex:1;min-width:0">
          ${K.kv([
            ['Holdings', String(D.PORTFOLIO.count)],
            ['Sectors represented', `${D.rollup('sector').length} of 19`],
            ['Largest position', `${D.byValue[0].symbol} · ${((D.byValue[0].current / D.PORTFOLIO.current) * 100).toFixed(1)}%`],
            ['Top 5 weight', `${(D.byValue.slice(0, 5).reduce((a, h) => a + h.current, 0) / D.PORTFOLIO.current * 100).toFixed(1)}%`],
            ['Equity weight', `${D.rollup('group')[0].share.toFixed(1)}%`],
            ['Non-equity sleeves', '3'],
          ])}
        </div>
      </div>`, { style: 'flex:1.15;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`${K.sectionHeader('Return distribution', '<span style="font-size:11px;color:var(--muted)">positions by unrealised return</span>')}
      ${C.columns({ groups: returnBuckets, h: 210 })}
      <p style="margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
        ${D.HOLDINGS.filter((h) => h.pnl < 0).length} of ${D.PORTFOLIO.count} positions sit below their cost basis. The two negative buckets take the
        danger token so the split is legible without reading the axis.</p>`,
      { style: 'flex:1;min-width:0', cal: cal(3, 'tl') })}

    ${K.card(`${K.sectionHeader('Concentration')}
      ${C.hbars({ rows: D.byValue.slice(0, 7).map((h) => ({
        label: h.symbol, value: h.current, right: `${((h.current / D.PORTFOLIO.current) * 100).toFixed(1)}%`, color: 'var(--c1)',
      })) })}
      <div style="margin-top:13px;padding-top:12px;border-top:1px solid var(--line)">
        ${K.banner('One position exceeds its alert weight', 'HDFCBANK is above the 8% ceiling you set.', 'warning', { icon: icon('triangle-alert', 15) })}
      </div>`, { style: 'flex:1;min-width:0' })}
  </div>

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Net worth trend', K.segmented(['3M', '6M', '1Y', 'ALL'], 0))}
      ${C.area({ points: D.SNAPSHOTS.map((s) => s.net), w: 640, h: 168, id: 'an1', labels: [D.dm(D.SNAPSHOTS[0].date), D.dm(D.SNAPSHOTS[45].date), 'Today'] })}`,
      { style: 'flex:1;min-width:0' })}
    ${K.card(`${K.sectionHeader('Net worth movement')}
      ${C.columns({ groups: [0, 15, 30, 45, 60, 75, 90].map((i, n, arr) => {
        const cur = D.SNAPSHOTS[i].net;
        const prev = n === 0 ? cur : D.SNAPSHOTS[arr[n - 1]].net;
        const diff = cur - prev;
        return { label: D.dm(D.SNAPSHOTS[i].date), values: [{ value: Math.abs(diff), color: diff >= 0 ? 'var(--c1)' : 'var(--danger)' }] };
      }), h: 168 })}`, { style: 'flex:1;min-width:0' })}
    ${K.card(`${K.sectionHeader('Where value sits')}
      <div style="display:flex;align-items:center;gap:18px">
        ${C.sunburst({ size: 186, nodes: D.rollup('group').map((g) => ({
          value: g.current, color: g.color,
          children: D.HOLDINGS.filter((h) => h.group === g.key).sort((a, b) => b.current - a.current).slice(0, 6).map((h, i) => ({ value: h.current, op: 0.75 - i * 0.09 })),
        })) })}
        ${C.legend(D.rollup('group').map((g) => ({ label: g.label, color: g.color, right: D.compact(g.current) })))}
      </div>`, { style: 'flex:1.1;min-width:0', cal: cal(4, 'tl') })}
  </div>`;

export const analytics = {
  art: shell({ path: '/analytics', title: 'Analytics', body: analyticsBody, h: 1200 }),
  meta: {
    name: 'Analytics', route: '/analytics', height: 1200,
    purpose: `Structural questions the Dashboard deliberately does not answer: how concentrated the
      book is, how returns are spread across positions, and where value actually sits once you
      drill past the asset group.`,
    notes: [
      `<b>Scores, not verdicts.</b> Diversification, concentration and return quality are indices
       over the book. When an input is missing the screen renders <code>null</code> — a dash — rather
       than a zero that would read as a real, terrible score.`,
      `<b>Diversification gauge.</b> Same 240° component as the health screen, different domain, so a
       reader who has learned one dial has learned both.`,
      `<b>Return distribution.</b> A count histogram, not a value one: the question is how many
       positions are working, which a value-weighted chart would hide behind the largest holding.`,
      `<b>Sunburst.</b> Asset group inner ring, positions outer. Outer-ring opacity steps down by
       rank inside the group rather than introducing new hues, which would break the palette.`,
    ],
    specs: [['Gauge sweep', '240°'], ['Gauge stroke', '15px'], ['Sunburst inner r', '0.20 × size'], ['Sunburst outer r', '0.46 × size'], ['Bar radius', '4px top'], ['Column gap', '2px']],
  },
};

// ------------------------------------------------------------------ /reports
const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const monthly = months.map((m, i) => ({
  label: m,
  values: [
    { value: 285000 + (D.rnd(`inc${i}`) - 0.5) * 24000, color: 'var(--c1)' },
    { value: 190000 + (D.rnd(`exp${i}`) - 0.5) * 70000, color: 'var(--c2)' },
  ],
}));

const catSpend = D.CATEGORIES
  .map((c) => ({ label: c, value: D.spentByCategory(c) }))
  .filter((r) => r.value > 0)
  .sort((a, b) => b.value - a.value);

const reportsBody = `
  ${K.pageIntro('Reports', 'Income, spending and the balance sheet, straight from the ledger',
    K.segmented(['This month', '3M', '6M', '12M'], 3) + K.button('Export CSV', 'secondary', { icon: icon('download', 15) }))}

  ${K.statStrip([
    { label: 'Income', value: D.money0(D.MONTH_INCOME), sub: 'this month', accent: 'var(--success)' },
    { label: 'Expenses', value: D.money0(D.MONTH_EXPENSE), sub: `${D.LEDGER.filter((r) => r.d <= 30 && r.type === 'expense').length} transactions`, accent: 'var(--danger)' },
    { label: 'Net', value: D.money0(D.MONTH_INCOME - D.MONTH_EXPENSE), sub: 'income less spending' },
    { label: 'Savings rate', value: `${D.SAVINGS_RATE.toFixed(0)}%`, sub: 'target 30%' },
    { label: 'Net worth', value: D.compact(D.NET_WORTH), sub: 'assets less liabilities' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Income vs expenses', `<span style="display:flex;gap:14px;font-size:11.5px;color:var(--muted)">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:3px;background:var(--c1)"></span>Income</span>
        <span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:3px;background:var(--c2)"></span>Expenses</span></span>`)}
      ${C.columns({ groups: monthly, h: 228 })}`, { style: 'flex:1.6;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`${K.sectionHeader('Spending by category')}
      ${C.hbars({ rows: catSpend.map((r, i) => ({ ...r, right: D.money0(r.value), color: `var(--c${(i % 8) + 1})` })) })}`,
      { style: 'flex:1;min-width:0' })}
  </div>

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Balance sheet', `<span class="tnum" style="font-size:11.5px;color:var(--success);font-weight:600">${icon('check', 13, { style: 'display:inline' })} Balanced</span>`)}
      <div style="display:flex;gap:26px">
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Assets</div>
          ${K.kv([
            ...D.ACCOUNTS.map((a) => [a.name, D.money0(a.balance)]),
            ['Investments', D.money0(D.PORTFOLIO.current)],
            ['<b style="color:var(--ink)">Total assets</b>', `<b>${D.money0(D.CASH + D.PORTFOLIO.current)}</b>`],
          ])}
        </div>
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Liabilities</div>
          ${K.kv([
            ...D.LIABILITIES.map((l) => [l.name, D.money0(l.principal)]),
            ['<b style="color:var(--ink)">Total liabilities</b>', `<b>${D.money0(D.DEBT)}</b>`],
            ['<b style="color:var(--ink)">Net worth</b>', `<b style="color:var(--accent)">${D.money0(D.NET_WORTH)}</b>`],
          ])}
        </div>
      </div>`, { style: 'flex:1.3;min-width:0', cal: cal(3, 'tl') })}

    ${K.card(`${K.sectionHeader('Net worth trend')}
      ${C.area({ points: D.SNAPSHOTS.map((s) => s.net), w: 520, h: 176, id: 'rep', labels: [D.dm(D.SNAPSHOTS[0].date), D.dm(D.SNAPSHOTS[45].date), 'Today'] })}`,
      { style: 'flex:1;min-width:0' })}
  </div>`;

export const reports = {
  art: shell({ path: '/reports', title: 'Reports', body: reportsBody, h: 1200 }),
  meta: {
    name: 'Reports', route: '/reports', height: 1200,
    purpose: `The accounting view. Twelve months of income against spending, where the money went,
      and a balance sheet assembled from the double-entry postings rather than from summed
      transactions.`,
    notes: [
      `<b>Savings rate</b> is income less spending over income, on the same window as the figures
       beside it — never a different period, which is the usual way this number lies.`,
      `<b>Two-series columns.</b> Income and expenses share a group with a 2px gap; the surface
       showing through is the separator, so no third colour is introduced.`,
      `<b>Balance sheet.</b> Built from postings, and the header states whether assets less
       liabilities less equity nets to zero within ₹0.005. Transfers never appear here — they are
       not income or expense, and the ledger keeps them out.`,
    ],
    specs: [['Column width', '12px'], ['Column radius', '4px 4px 0 0'], ['Bar height', '9px'], ['Balanced tolerance', '₹0.005'], ['Window', '12 months']],
  },
};

export default [analytics, reports];
