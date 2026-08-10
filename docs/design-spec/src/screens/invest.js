/** Invest group — /investments, /holdings, /watchlist, /markets, /dividends, /tax. */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { shell } from '../chrome.js';
import { cal } from '../doc.js';

const groups = D.rollup('group');
const groupSegs = groups.map((g) => ({ label: g.label, value: g.current, color: g.color, right: `${g.share.toFixed(1)}%` }));
const sectors = D.rollup('sector');
const sectorSegs = sectors.map((s, i) => ({ label: s.label, value: s.current, color: `var(--c${(i % 8) + 1})`, right: `${s.share.toFixed(1)}%` }));

const profitSplit = [
  { label: 'In profit', value: D.HOLDINGS.filter((h) => h.pnl > 0).reduce((a, h) => a + h.current, 0), color: 'var(--c1)' },
  { label: 'At a loss', value: D.HOLDINGS.filter((h) => h.pnl <= 0).reduce((a, h) => a + h.current, 0), color: 'var(--c4)' },
].map((s) => ({ ...s, right: `${D.HOLDINGS.filter((h) => (s.label === 'In profit' ? h.pnl > 0 : h.pnl <= 0)).length} positions` }));

// -------------------------------------------------------------- /investments
const portfolioBody = `
  ${K.pageIntro('Portfolio', `${D.PORTFOLIO.count} positions across ${groups.length} asset groups`,
    K.button('Import', 'secondary', { icon: icon('upload', 15) }) + K.button('Add holding', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Portfolio value', value: D.money0(D.PORTFOLIO.current) },
    { label: 'Total investment', value: D.money0(D.PORTFOLIO.invested) },
    { label: 'Overall P&amp;L', value: D.signed(D.PORTFOLIO.pnl, D.money0), sub: D.pct(D.PORTFOLIO.pnlPct), accent: 'var(--success)' },
    { label: "Today's P&amp;L", value: D.signed(D.PORTFOLIO.dayPnl, D.money0), sub: D.pct(D.PORTFOLIO.dayPct), accent: 'var(--danger)' },
    { label: 'Holdings', value: String(D.PORTFOLIO.count), sub: `${sectors.length} sectors` },
    { label: 'Total quantity', value: D.qty(D.PORTFOLIO.totalQty), sub: 'units held' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Asset allocation')}
      <div style="display:flex;align-items:center;gap:16px">
        ${C.donut({ segments: groupSegs, size: 132, thickness: 18, center: D.compact(D.PORTFOLIO.current) })}
        ${C.legend(groupSegs)}
      </div>`, { style: 'flex:1;min-width:0', cal: cal(2, 'tl') })}
    ${K.card(`${K.sectionHeader('Sector allocation')}
      <div style="display:flex;align-items:center;gap:16px">
        ${C.donut({ segments: sectorSegs, size: 132, thickness: 18, center: String(sectors.length), sub: 'sectors' })}
        ${C.legend(sectorSegs.slice(0, 6))}
      </div>`, { style: 'flex:1.25;min-width:0' })}
    ${K.card(`${K.sectionHeader('Profit vs loss')}
      <div style="display:flex;align-items:center;gap:16px">
        ${C.donut({ segments: profitSplit, size: 132, thickness: 18, center: `${D.HOLDINGS.filter((h) => h.pnl > 0).length} / ${D.PORTFOLIO.count}`, sub: 'in profit' })}
        ${C.legend(profitSplit)}
      </div>`, { style: 'flex:1;min-width:0' })}
  </div>

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Top 5 gainers')}
      ${C.hbars({ rows: D.gainers.slice(0, 5).map((h) => ({ label: h.symbol, value: h.pnlPct, right: D.pct(h.pnlPct), color: 'var(--success)', tone: 'var(--success)' })) })}`,
      { style: 'flex:1;min-width:0' })}
    ${K.card(`${K.sectionHeader(`Positions at a loss (${D.HOLDINGS.filter((h) => h.pnl < 0).length})`)}
      ${C.hbars({ rows: D.losers.filter((h) => h.pnl < 0).map((h) => ({ label: h.symbol, value: h.pnlPct, right: D.pct(h.pnlPct), color: 'var(--danger)', tone: 'var(--danger)' })) })}
      <p style="margin:14px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
        Only three positions are below cost, so the card shows three rows rather than padding a
        “top 5” with holdings that are in profit.</p>`,
      { style: 'flex:1;min-width:0' })}
    ${K.card(`${K.sectionHeader('Overall P&amp;L by stock', '<span style="font-size:11px;color:var(--muted)">top 8 by magnitude</span>')}
      ${C.diverging({ rows: [...D.HOLDINGS].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8)
        .map((h) => ({ label: h.symbol, value: h.pnl, right: D.compact(h.pnl) })) })}`,
      { style: 'flex:1.6;min-width:0', cal: cal(3, 'tl') })}
  </div>

  ${K.card(`${K.sectionHeader('Holdings summary', `<span style="display:flex;gap:8px">${K.segmented(['All', 'Equity', 'Debt', 'Gold', 'Retirement'], 0)}</span>`)}
    ${K.table({
      head: ['Instrument', 'Sector', 'Qty', 'Avg cost', 'Last', 'Invested', 'Value', 'P&amp;L', 'Return', 'Today'],
      align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
      w: ['22%', '15%'],
      rows: D.byValue.slice(0, 9).map((h) => [
        `<span style="display:flex;align-items:center;gap:9px">${K.avatar(h.symbol.slice(0, 2), { size: 25 })}
          <span><b style="color:var(--ink);font-weight:600">${h.symbol}</b>
          <span style="display:block;font-size:10.5px;color:var(--muted)">${h.name}</span></span></span>`,
        `<span style="font-size:11.5px">${h.sector === 'Unclassified' ? '<span style="color:var(--muted)">Unclassified</span>' : h.sector}</span>`,
        D.qty(h.qty), D.money0(h.avg), D.money0(h.last), D.money0(h.invested), D.money0(h.current),
        `<span style="color:var(--${h.pnl >= 0 ? 'success' : 'danger'})">${D.signed(h.pnl, D.money0)}</span>`,
        K.delta(h.pnlPct), K.delta(h.dayPct),
      ]),
    })}`, { style: 'margin-top:16px', cal: cal(4, 'tl') })}`;

// ----------------------------------------------------------------- /holdings
const holdingsBody = `
  ${K.pageIntro('Holdings', 'Every position, sortable and filterable',
    K.button('Export', 'secondary', { icon: icon('download', 15) }) + K.button('Add lot', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Market value', value: D.money0(D.PORTFOLIO.current) },
    { label: 'Invested', value: D.money0(D.PORTFOLIO.invested) },
    { label: 'Unrealised P&amp;L', value: D.signed(D.PORTFOLIO.pnl, D.money0), sub: D.pct(D.PORTFOLIO.pnlPct), accent: 'var(--success)' },
    { label: 'Priced positions', value: `${D.PORTFOLIO.count} / ${D.PORTFOLIO.count}`, sub: 'none unpriced' },
  ])}

  ${K.card(`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      ${K.input(`<span style="color:var(--muted)">${icon('search', 15)}</span>Filter by symbol or name…`, { placeholder: true, w: '300px' })}
      ${K.segmented(['All', 'Equity', 'Debt', 'Gold', 'Retirement'], 0)}
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)">
        ${icon('filter', 14)} Sorted by value ${icon('chevron-down', 13)}</span>
    </div>
    ${K.table({
      head: ['Instrument', 'Type', 'Cap', 'Qty', 'Avg cost', 'Last', 'Invested', 'Value', 'P&amp;L', 'Return', 'Weight'],
      align: ['l', 'l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
      w: ['20%'],
      rows: D.byValue.slice(0, 15).map((h) => [
        `<span style="display:flex;align-items:center;gap:9px">${K.avatar(h.symbol.slice(0, 2), { size: 24 })}
          <span><b style="color:var(--ink);font-weight:600">${h.symbol}</b>
          <span style="display:block;font-size:10px;color:var(--muted)">${h.name}</span></span></span>`,
        K.chip(h.typeLabel, h.group === 'equity' ? 'accent' : h.group === 'gold' ? 'warning' : h.group === 'debt' ? 'violet' : 'neutral'),
        h.cap ? h.cap[0].toUpperCase() + h.cap.slice(1) : '<span style="color:var(--muted)">—</span>',
        D.qty(h.qty), D.money0(h.avg), D.money0(h.last), D.money0(h.invested), D.money0(h.current),
        `<span style="color:var(--${h.pnl >= 0 ? 'success' : 'danger'})">${D.signed(h.pnl, D.money0)}</span>`,
        K.delta(h.pnlPct),
        `${((h.current / D.PORTFOLIO.current) * 100).toFixed(1)}%`,
      ]),
    })}
    <div style="display:flex;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)">
      Showing 15 of ${D.PORTFOLIO.count}
      <span style="margin-left:auto;display:flex;gap:6px">${K.button('Previous', 'ghost')}${K.button('Next', 'secondary')}</span>
    </div>`, { style: 'margin-top:16px', cal: cal(1, 'tl') })}`;

// ---------------------------------------------------------------- /watchlist
const watchlistBody = `
  ${K.pageIntro('Watchlist', 'Tracked, not owned — prices you enter by hand',
    K.button('Add instrument', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Tracked', value: String(D.WATCHLIST.length), sub: 'instruments' },
    { label: 'Above target', value: String(D.WATCHLIST.filter((w) => w.price >= w.target).length), sub: 'of ' + D.WATCHLIST.length },
    { label: 'Nearest target', value: 'TATAPOWER', sub: '12.9% away' },
    { label: 'Last priced', value: D.dmy(D.TODAY), sub: 'entered manually' },
  ])}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Tracked instruments')}
      ${K.table({
        head: ['Instrument', 'Last price', 'Target', 'To target', 'Day', 'Added', ''],
        align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'],
        w: ['30%'],
        rows: D.WATCHLIST.map((w) => [
          `<span style="display:flex;align-items:center;gap:10px">${K.avatar(w.symbol.slice(0, 2), { size: 26 })}
            <span><b style="color:var(--ink);font-weight:600">${w.symbol}</b>
            <span style="display:block;font-size:10.5px;color:var(--muted)">${w.name}</span></span></span>`,
          D.money0(w.price), D.money0(w.target),
          K.delta(w.toTarget), K.delta(w.dayPct), D.dm(D.daysAgo(30 + D.WATCHLIST.indexOf(w) * 9)),
          `<span style="display:flex;gap:8px;justify-content:flex-end;color:var(--muted)">${icon('pencil', 14)}${icon('trash-2', 14)}</span>`,
        ]),
      })}`, { style: 'flex:2;min-width:0', cal: cal(1, 'tl') })}

    ${K.card(`${K.sectionHeader('Why prices are typed')}
      <p style="font-size:12.5px;color:var(--ink-soft);line-height:1.65;margin:0 0 14px">
        Khazana never calls a market data feed on its own. A price is here because you entered it,
        or because you pasted a broker export. That is the whole privacy contract: no request
        leaves the device carrying a list of what you own.</p>
      ${K.banner('Add a price provider', 'Settings → Market data lets you supply your own API key. The key is stored in the OS keychain, never in the vault.', 'info', { icon: icon('info', 15) })}
      <div style="margin-top:14px">${K.button('Open market data settings', 'secondary', { full: true })}</div>`,
      { style: 'flex:1;min-width:0', cal: cal(2, 'tl') })}
  </div>`;

// ------------------------------------------------------------------ /markets
const marketsBody = `
  ${K.pageIntro('Markets', 'Index levels and the day’s movers',
    `<span style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:999px;background:var(--warning-soft);color:var(--warning);font-size:11.5px;font-weight:600">
      ${icon('circle-alert', 14)} Demonstration feed</span>` + K.segmented(['1D', '1W', '1M', '3M', '1Y'], 0))}

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
    ${D.INDICES.map((idx, i) => K.card(`
      <div style="display:flex;align-items:flex-start">
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--ink)">${idx[0]}</div>
          <div style="margin-top:7px;font-size:24px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(idx[1])}</div>
        </div>
        <span style="margin-left:auto">${K.delta(idx[2])}</span>
      </div>
      <div style="margin-top:12px">${C.spark({ points: Array.from({ length: 26 }, (_, k) => 100 + Math.sin(k / 3 + i) * 4 + D.rnd(`${idx[0]}${k}`) * 5), w: 300, h: 34, color: idx[2] >= 0 ? 'var(--success)' : 'var(--danger)' })}</div>`,
      { cal: i === 0 ? cal(1, 'tl') : '' })).join('')}
  </div>

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Your holdings today', '<span style="font-size:11px;color:var(--muted)">synthesised day change</span>')}
      ${K.table({
        head: ['Instrument', 'Last', 'Change', 'Day P&amp;L', 'Value'],
        align: ['l', 'r', 'r', 'r', 'r'],
        rows: D.dayMovers.slice(0, 8).map((h) => [
          `<b style="color:var(--ink);font-weight:600">${h.symbol}</b> <span style="color:var(--muted);font-size:11px">${h.name}</span>`,
          D.money0(h.last), K.delta(h.dayPct),
          `<span style="color:var(--${h.dayPnl >= 0 ? 'success' : 'danger'})">${D.signed(h.dayPnl, D.money0)}</span>`,
          D.money0(h.current),
        ]),
      })}`, { style: 'flex:1.7;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`${K.sectionHeader('Session')}
      ${K.kv([
        ['Exchange', 'NSE'], ['Status', '<span style="color:var(--success)">Open</span>'],
        ['Local time', '14:28 IST'], ['Closes', '15:30 IST'],
        ['Advancing', '31'], ['Declining', '19'],
      ])}
      <div style="margin-top:14px">
        ${K.banner('These levels are generated', 'The session clock is real; the numbers are deterministic demonstration data, hashed from the symbol and the date. Nothing is fetched.', 'warning', { icon: icon('circle-alert', 15) })}
      </div>`, { style: 'flex:1;min-width:0', cal: cal(3, 'tl') })}
  </div>`;

// ---------------------------------------------------------------- /dividends
const divMonths = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const dividendsBody = `
  ${K.pageIntro('Dividends', 'Payouts received and expected, from your own records',
    K.button('Record payout', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Received', value: D.money0(D.DIV_RECEIVED), sub: 'last 12 months', accent: 'var(--success)' },
    { label: 'Expected', value: D.money0(D.DIV_EXPECTED), sub: '2 announced payouts' },
    { label: 'Yield on portfolio', value: `${((D.DIV_RECEIVED / D.PORTFOLIO.current) * 100).toFixed(2)}%`, sub: 'on market value' },
    { label: 'Paying instruments', value: '6', sub: `of ${D.PORTFOLIO.count} held` },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Payouts')}
      ${K.table({
        head: ['Instrument', 'Kind', 'Per share', 'Amount', 'Ex-date', 'Pay date', 'Status'],
        align: ['l', 'l', 'r', 'r', 'r', 'r', 'l'],
        rows: D.DIVIDENDS.map((d) => [
          `<b style="color:var(--ink);font-weight:600">${d.symbol}</b>`,
          K.chip('Dividend', 'neutral'),
          D.money(d.perShare), `<b style="color:var(--ink)">${D.money0(d.amount)}</b>`,
          D.dm(D.daysAgo(d.d + 12)), D.dm(d.date),
          d.received ? K.chip('Received', 'success') : K.chip('Announced', 'warning'),
        ]),
      })}`, { style: 'flex:1.8;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`${K.sectionHeader('Payouts by month')}
      ${C.columns({ groups: divMonths.map((m, i) => ({
        label: m,
        values: [{ value: [22605, 8370, 18720, 4200, 13125, 0, 15750][i], color: i === 5 ? 'var(--fill-strong)' : 'var(--c2)' }],
      })), h: 178 })}
      <p style="margin:14px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
        Bars past today are the announced payouts, drawn in the neutral fill so a forecast can never
        be mistaken for a receipt.</p>`, { style: 'flex:1;min-width:0', cal: cal(3, 'tl') })}
  </div>`;

// ---------------------------------------------------------------------- /tax
const taxBody = `
  ${K.pageIntro('Tax Center', 'Unrealised capital gains under India FY25 rules',
    K.segmented(['FY 2025-26', 'FY 2024-25'], 0) + K.button('Export', 'secondary', { icon: icon('download', 15) }))}

  ${K.statStrip([
    { label: 'Est. total tax', value: D.compact(D.TAX.tax), sub: 'if realised today', accent: 'var(--warning)' },
    { label: 'Long-term gain', value: D.compact(D.TAX.ltcg), sub: '12.5% above ₹1.25 L' },
    { label: 'Short-term gain', value: D.compact(D.TAX.stcg), sub: '20% on equity' },
    { label: 'Exemption used', value: D.money0(D.TAX.exemption), sub: 'LTCG, equity only' },
    { label: 'Unclassified', value: '0', sub: 'all positions typed', accent: 'var(--success)' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Position by position')}
      ${K.table({
        head: ['Instrument', 'Asset type', 'Held', 'Gain', 'Term', 'Rate', 'Est. tax'],
        align: ['l', 'l', 'r', 'r', 'l', 'r', 'r'],
        rows: D.TAX.rows.sort((a, b) => b.gain - a.gain).slice(0, 11).map((r) => [
          `<b style="color:var(--ink);font-weight:600">${r.symbol}</b>`,
          K.chip(r.typeLabel, r.group === 'equity' ? 'accent' : r.group === 'gold' ? 'warning' : 'neutral'),
          `${Math.floor(r.months)} mo`,
          `<span style="color:var(--success)">${D.money0(r.gain)}</span>`,
          r.long ? K.chip('Long', 'success') : K.chip('Short', 'warning'),
          r.slab ? 'Slab' : `${r.rate}%`,
          D.money0(r.gain * (r.rate / 100)),
        ]),
      })}`, { style: 'flex:2;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`${K.sectionHeader('Rules applied')}
      ${K.kv([
        ['Rule set', 'tax_rules.json v4'], ['Effective from', '23 Jul 2024'],
        ['Equity STCG', '20%'], ['Equity LTCG', '12.5%'],
        ['LTCG threshold', '12 months'], ['LTCG exemption', '₹1,25,000'],
        ['Debt / NPS', 'Slab, both terms'], ['Gold LTCG', '12.5% after 24 mo'],
        ['Crypto', '30% flat, no concession'],
      ])}
      <div style="margin-top:14px">
        ${K.banner('Estimates, not filings', 'Unrealised positions only, FIFO lots, no set-off against carried-forward losses. Informational only — not tax advice.', 'neutral', { icon: icon('info', 15) })}
      </div>`, { style: 'flex:1;min-width:0', cal: cal(3, 'tl') })}
  </div>`;

export default [
  {
    art: shell({ path: '/investments', title: 'Portfolio', body: portfolioBody, h: 1200 }),
    meta: {
      name: 'Portfolio', route: '/investments', height: 1200,
      purpose: `The investment home. Six headline figures, then allocation read three ways, the
        extremes of the book, and every position in one table. The route keeps its old
        <code>/investments</code> path because it is one of the five Flutter tabs — only the label moved.`,
      notes: [
        `<b>Six KPIs, not seven.</b> Portfolio screens answer value, cost, total return and today's
         return first; count and quantity are context, so they sit last.`,
        `<b>Three donuts, one grammar.</b> Asset group keeps the fixed palette order; sector and
         profit-split may sort by value because both are labelled in the legend beside them.`,
        `<b>Diverging P&amp;L.</b> Sign is the message, so the bars grow from a centre rule rather
         than from a left edge — magnitude and direction in one read.`,
        `<b>Holdings table.</b> Numeric columns are right-aligned and tabular so digits line up
         column-wise; only the instrument column is left-aligned.`,
      ],
      specs: [['Donut size', '132px'], ['Donut thickness', '18px'], ['Table row', '~41px'], ['Header type', '9.5px / 700 / 0.11em'], ['Body type', '12.5px'], ['Chip radius', '999px']],
    },
  },
  {
    art: shell({ path: '/holdings', title: 'Holdings', body: holdingsBody, h: 1200 }),
    meta: {
      name: 'Holdings', route: '/holdings', height: 1200,
      purpose: `The data grid, split out of Portfolio so the analysis screens stay readable. Filter,
        sort and page through every position with its classification and weight.`,
      notes: [
        `<b>Toolbar above the grid.</b> Search, type filter and sort state sit inside the card, not
         in the page header — they belong to the table, and moving with it keeps them findable when
         the page scrolls.`,
        `<b>Unclassified is a real state.</b> A market-cap band the instrument master does not cover
         renders “—” in muted ink, never an invented guess.`,
      ],
      specs: [['Grid rows / page', '15'], ['Row height', '~41px'], ['Search field', '38px h, 10px r'], ['Type chip', '11px / 600']],
    },
  },
  {
    art: shell({ path: '/watchlist', title: 'Watchlist', body: watchlistBody, h: 1200 }),
    meta: {
      name: 'Watchlist', route: '/watchlist', height: 1200,
      purpose: `Instruments tracked but not owned, with a target price and the distance to it.
        Prices are hand-entered; nothing on this screen calls out to a market feed.`,
      notes: [
        `<b>To target</b> reuses the Delta component. A negative distance means the price has passed
         the target — the arrow says so without the reader parsing the sign.`,
        `<b>The privacy panel is design, not documentation.</b> Explaining the missing live feed on
         the screen that most invites the question is what stops it reading as a broken feature.`,
      ],
      specs: [['Row actions', '14px icons, muted'], ['Avatar', '26px, 9px radius'], ['Empty target', 'renders “—”']],
    },
  },
  {
    art: shell({ path: '/markets', title: 'Markets', body: marketsBody, h: 1200 }),
    meta: {
      name: 'Markets', route: '/markets', height: 1200,
      purpose: `Index levels and the day's movement across your book. The only screen in the product
        that shows figures Khazana generated rather than figures you entered — which is why the
        demonstration badge sits in the page header, not in a footnote.`,
      notes: [
        `<b>Demo badge in the title row.</b> Warning tone, always visible, never dismissible on this
         screen. Synthesised numbers that look like a live feed are the most damaging thing a
         finance UI can ship quietly.`,
        `<b>Day change never blends.</b> If one real previous close exists in the vault, every
         synthesised day change is dropped rather than mixed with it.`,
        `<b>The session clock is real.</b> Market hours come from the device, so “open” is true even
         though the level beside it is not.`,
      ],
      specs: [['Index card', '3-up grid, 16px gap'], ['Sparkline', '300 × 34'], ['Level type', '24px / 700'], ['Badge', 'warning tone, 32px h']],
    },
  },
  {
    art: shell({ path: '/dividends', title: 'Dividends', body: dividendsBody, h: 1200 }),
    meta: {
      name: 'Dividends', route: '/dividends', height: 1200,
      purpose: `Income from holdings — what has landed, what has been announced, and the yield that
        implies against the portfolio's market value.`,
      notes: [
        `<b>Received vs announced.</b> Two chip tones and two bar fills. A forecast never borrows the
         success colour, because a number you might get and a number you have are not the same fact.`,
        `<b>Yield is on market value</b>, not on cost — stated in the sub-label so the basis is never
         ambiguous.`,
      ],
      specs: [['Chip tones', 'success / warning'], ['Future bar', 'var(--fill-strong)'], ['Column height', '178px']],
    },
  },
  {
    art: shell({ path: '/tax', title: 'Tax Center', body: taxBody, h: 1200 }),
    meta: {
      name: 'Tax Center', route: '/tax', height: 1200,
      purpose: `What the book would cost in capital-gains tax if it were realised today, position by
        position, under the India FY25 rules bundled with the app.`,
      notes: [
        `<b>Long / short is computed, not chosen.</b> Holding period against the per-asset-type
         threshold decides the term; the chip states which side each position fell on.`,
        `<b>Slab-rated positions</b> show “Slab” rather than a number, because the rate depends on
         income the app does not know. Inventing 30% here would be a confident wrong answer.`,
        `<b>The rules panel is versioned.</b> Schema version and effective date are on screen, so a
         figure can always be traced to the rule set that produced it.`,
      ],
      specs: [['Rule source', 'assets/tax_rules.json v4'], ['Effective', '2024-07-23'], ['Lot method', 'FIFO, not configurable'], ['LTCG exemption', '₹1,25,000']],
    },
  },
];
