/** Part B — the component kit, every variant and state, in both themes. */
import { page, divider } from '../doc.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import * as D from '../data.js';
import { icon } from '../icons.js';

/** A specimen shown on both theme canvases side by side. */
function pair(inner, { h = null } = {}) {
  return `<div class="grid g2" style="gap:14px">
    <div class="stage thm-dark"${h ? ` style="min-height:${h}px"` : ''}>
      <div class="stage-h">Vault</div>${inner}</div>
    <div class="stage thm-light"${h ? ` style="min-height:${h}px"` : ''}>
      <div class="stage-h">Ledger</div>${inner}</div>
  </div>`;
}

function spec(rows) {
  return `<table class="kv" style="margin-top:12px">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

// ---------------------------------------------------------------- Buttons
const buttonsPage = page({
  part: 'Part B · Components', title: 'Buttons, chips and controls', meta: 'components/ui.tsx',
  body: `
  <div style="display:flex;gap:32px;height:100%">
    <div style="flex:2;min-width:0">
      <div class="note-h" style="margin-top:0">Button — three variants, not fifteen</div>
      ${pair(`<div class="row">
        ${K.button('Add transaction', 'primary', { icon: icon('plus', 15) })}
        ${K.button('Import', 'secondary', { icon: icon('upload', 15) })}
        ${K.button('Cancel', 'ghost')}
        ${K.button('Erase vault', 'danger', { icon: icon('trash-2', 15) })}
      </div>`)}

      <div class="note-h">States</div>
      ${pair(`<div class="row">
        ${K.button('Default', 'primary')}
        ${K.button('Hover', 'primary-hover')}
        ${K.button('Focus', 'primary-focus')}
        ${K.button('Disabled', 'primary-disabled')}
        <span style="width:14px"></span>
        ${K.button('Default', 'secondary')}
        ${K.button('Hover', 'secondary-hover')}
        ${K.button('Ghost hover', 'ghost-hover')}
      </div>`)}

      <div class="note-h">Chip — six tones</div>
      ${pair(`<div class="row">
        ${K.chip('Neutral', 'neutral')}${K.chip('Accent', 'accent')}${K.chip('Success', 'success')}
        ${K.chip('Danger', 'danger')}${K.chip('Warning', 'warning')}${K.chip('Transfer', 'violet')}
      </div>`)}

      <div class="note-h">Delta — direction carried twice</div>
      ${pair(`<div class="row">
        ${K.delta(19.42)}${K.delta(-6.02)}${K.delta(0)}${K.delta(null)}
        ${K.delta(22.0, { text: '22.0% · 90 days' })}
      </div>`)}

      <div class="note-h">Segmented control</div>
      ${pair(`<div class="row">
        ${K.segmented(['1W', '1M', '3M', '6M', '1Y', 'ALL'], 2)}
        ${K.segmented(['Expense', 'Income', 'Transfer'], 0)}
      </div>`)}
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:32px">
      <div class="note-h" style="margin-top:0">Why three</div>
      <p class="note-p">
        <b>Primary</b> — emerald fill, the one action a screen most wants. <b>Secondary</b> —
        bordered, everything else. <b>Ghost</b> — no chrome, tertiary and in-table.
        <code>soft</code> and <code>danger</code> are kept as aliases so forty existing call sites
        did not have to change in one commit: soft maps to secondary, and danger is secondary tinted
        rather than a fourth shape.</p>

      <div class="note-h">Emerald is the interaction colour</div>
      <p class="note-p">
        Gold never lands on a button. On Vault the fill is #20C98A with near-black ink at 9.4:1;
        white on that emerald would be 2.4:1.</p>

      ${spec([
        ['Height', '36px'], ['Padding', '0 14px'], ['Radius', '9px'],
        ['Type', '13px / 600 / −0.01em'], ['Icon gap', '8px'],
        ['Transition', '150ms standard'], ['Active', 'translateY(1px)'],
        ['Disabled', 'opacity 0.4, no press'],
        ['Focus ring', '2px canvas + 2px accent-line'],
      ])}

      <div class="note-h">Delta carries an arrow</div>
      <p class="note-p">
        Colour alone fails for a colourblind reader and in print, so the glyph repeats the
        information: ↑ up, ↓ down, · flat. A null value renders an em dash in muted ink — never a
        zero, which would assert a fact the vault does not have.</p>

      <div class="note-h">Chip tones are semantic</div>
      <p class="note-p">
        Each tone is a soft background, a matching ink, and a border mixed from the same token at
        26–30% — so a chip holds its shape on any of the four surface levels.</p>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Surfaces & forms
const formsPage = page({
  part: 'Part B · Components', title: 'Surfaces, forms and feedback', meta: 'components/ui.tsx',
  body: `
  <div style="display:flex;gap:32px;height:100%">
    <div style="flex:2;min-width:0">
      <div class="note-h" style="margin-top:0">Card, section header, eyebrow</div>
      ${pair(`
        ${K.card(`${K.sectionHeader('Portfolio performance', K.segmented(['1M', '3M', '1Y'], 1))}
          ${K.eyebrow('Market value')}
          <div style="margin-top:7px;font-size:26px;font-weight:700;letter-spacing:-0.04em;font-variant-numeric:tabular-nums">${D.money0(D.PORTFOLIO.current)}</div>`)}`)}

      <div class="note-h">Inputs</div>
      ${pair(`<div style="display:flex;gap:14px">
        <div style="flex:1">${K.field('Amount', K.input('₹1,240.00'), 'Decimals are optional.')}</div>
        <div style="flex:1">${K.field('Merchant', K.input('Search…', { placeholder: true }))}</div>
        <div style="flex:1">${K.field('Account', K.select('ICICI Spends'))}</div>
        <div style="flex:1">${K.field('Focused', K.input('₹1,240.00', { focus: true }))}</div>
      </div>`)}

      <div class="note-h">Progress — one zone rule everywhere</div>
      ${pair(`<div style="display:flex;flex-direction:column;gap:11px">
        ${[[0.45, 'Food · 45%'], [0.73, 'Transport · 73%'], [0.98, 'Shopping · 98%']].map(([f, l]) => `
          <div>
            <div style="display:flex;font-size:11.5px;color:var(--ink-soft);margin-bottom:5px"><span>${l}</span></div>
            ${K.progress(f)}
          </div>`).join('')}
      </div>`)}

      <div class="note-h">Banner</div>
      ${pair(`<div style="display:flex;flex-direction:column;gap:9px">
        ${K.banner('Net worth is up 22.0% over 90 days', 'Informational only — not investment advice.', 'accent', { icon: icon('trending-up', 15) })}
        ${K.banner('Shopping is 98% through its budget', `${D.money0(D.TIGHTEST_BUDGET.spent)} of ${D.money0(D.TIGHTEST_BUDGET.limit)}.`, 'warning', { icon: icon('triangle-alert', 15) })}
        ${K.banner('This address can’t encrypt your vault', 'Browsers only allow encryption over https or on localhost.', 'danger', { icon: icon('circle-alert', 15) })}
      </div>`)}
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:32px">
      <div class="note-h" style="margin-top:0">The card</div>
      <p class="note-p">
        One surface, one radius, one padding. <code>padded={false}</code> exists because the previous
        version hard-coded <code>p-5</code> and callers fought it with <code>p-0</code> — a table or a
        divided list owns its own padding.</p>
      ${spec([
        ['Padding', '20px'], ['Radius', '14px'], ['Border', '1px --line'],
        ['Shadow', 'none (Vault) · 0 1px 2px (Ledger)'],
        ['Hover lift', '−2px + shadow-2, opt-in'],
      ])}

      <div class="note-h">Fields</div>
      ${spec([
        ['Height', '38px'], ['Radius', '10px'], ['Padding', '0 12px'],
        ['Border', '1px --line-strong'], ['Background', '--surface'],
        ['Label', '12px / 600 --ink-soft'], ['Hint', '11.5px --muted'],
        ['Focus', 'accent border + 3px ring'],
      ])}

      <div class="note-h">Progress zones</div>
      <p class="note-p">
        Under 70% success, 70–90% warning, over 90% danger — derived from the fraction, never
        stored. The same function drives budget tiles, credit utilisation, coverage gaps and the
        transactions rail, so two bars showing the same ratio can never disagree.</p>

      <div class="note-h">Banners are not toasts</div>
      <p class="note-p">
        They sit in the layout and persist. Nothing important in this product is announced by
        something that disappears on a timer.</p>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Figures & data
const dataPage = page({
  part: 'Part B · Components', title: 'Figures and data display', meta: 'ui.tsx · DataGrid.tsx',
  body: `
  <div style="display:flex;gap:32px;height:100%">
    <div style="flex:2;min-width:0">
      <div class="note-h" style="margin-top:0">StatStrip — the KPI row</div>
      ${pair(K.statStrip([
        { label: 'Portfolio value', value: D.compact(D.PORTFOLIO.current), sub: '24 holdings' },
        { label: 'Overall return', value: D.pct(D.PORTFOLIO.pnlPct), sub: D.signed(D.PORTFOLIO.pnl, D.compact), accent: 'var(--success)' },
        { label: "Today's gain", value: D.signed(D.PORTFOLIO.dayPnl, D.compact), sub: D.pct(D.PORTFOLIO.dayPct), accent: 'var(--danger)' },
      ]))}
      <p class="note-p" style="margin-top:9px">
        Shown three-up at specimen width. On a real screen the strip carries five to seven cells
        across the full 1560px well — see the Dashboard and Portfolio artboards in Part C.</p>

      <div class="note-h">Table</div>
      ${pair(K.table({
        head: ['Instrument', 'Qty', 'Avg cost', 'Value', 'P&amp;L', 'Return'],
        align: ['l', 'r', 'r', 'r', 'r', 'r'],
        rows: D.byValue.slice(0, 3).map((h) => [
          `<span style="display:flex;align-items:center;gap:9px">${K.avatar(h.symbol.slice(0, 2), { size: 25 })}
            <span><b style="color:var(--ink);font-weight:600">${h.symbol}</b>
            <span style="display:block;font-size:10.5px;color:var(--muted)">${h.name}</span></span></span>`,
          D.qty(h.qty), D.money0(h.avg), D.money0(h.current),
          `<span style="color:var(--success)">${D.signed(h.pnl, D.money0)}</span>`, K.delta(h.pnlPct),
        ]),
      }))}

      <div class="note-h">Divided list and avatars</div>
      ${pair(K.list(D.RECURRING.slice(0, 3).map((r) => `
        ${K.avatar(r.merchant.slice(0, 2), { size: 32 })}
        <span style="flex:1;min-width:0">
          <span style="display:block;font-size:13px;font-weight:600">${r.merchant}</span>
          <span style="display:block;font-size:11px;color:var(--muted)">${r.category} · in ${r.inDays} days</span></span>
        <span style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(r.amount)}</span>`)))}

      <div class="note-h">Key–value rows</div>
      ${pair(K.kv([['Rule set', 'tax_rules.json v4'], ['Effective from', '23 Jul 2024'], ['LTCG exemption', '₹1,25,000']]))}
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:32px">
      <div class="note-h" style="margin-top:0">One card, divided</div>
      <p class="note-p">
        The KPI row is a single card split by hairlines, not four cards. Four separate cards read as
        four sections and compete with the real sections below them.</p>
      ${spec([
        ['Cell padding', '16px 20px'], ['Label', '10.5px / 700 / 0.1em, uppercase'],
        ['Figure', '22px / 700 / −0.035em'], ['Sub', '11.5px --muted'],
        ['Divider', '1px --line'], ['Overflow', 'ellipsis, never wrap'],
      ])}

      <div class="note-h">Table rules</div>
      ${spec([
        ['Header', '9.5px / 700 / 0.11em'], ['Body', '12.5px'],
        ['Row padding', '10px 12px 10px 0'], ['Row rule', '1px --line'],
        ['Numerics', 'right-aligned, tabular'], ['First column', 'left-aligned'],
        ['Wrapping', 'none — truncate'],
      ])}

      <div class="note-h">Avatars</div>
      <p class="note-p">
        A monogram plate, not a logo. Two letters at 700 on <code>--fill</code>, 11px radius at 32px
        and above, 9px below. Tinted by semantics where the type matters — success wash for income,
        violet for transfers.</p>

      <div class="note-h">Truncation is deliberate</div>
      <p class="note-p">
        Every cell truncates rather than wraps. A table whose rows change height as data changes
        cannot be scanned, and in a ledger scanning is the whole job.</p>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Charts
const chartsPage = page({
  part: 'Part B · Components', title: 'The chart family', meta: 'components/charts/',
  body: `
  <div style="display:flex;gap:32px;height:100%">
    <div style="flex:2.1;min-width:0">
      <div class="grid g2" style="gap:14px">
        <div class="stage thm-dark">
          <div class="stage-h">Donut + legend</div>
          <div style="display:flex;align-items:center;gap:16px">
            ${C.donut({ segments: D.rollup('group').map((g) => ({ label: g.label, value: g.current, color: g.color })), size: 126, thickness: 18, center: D.compact(D.PORTFOLIO.current) })}
            ${C.legend(D.rollup('group').map((g) => ({ label: g.label, color: g.color, right: `${g.share.toFixed(1)}%` })))}
          </div>
        </div>
        <div class="stage thm-light">
          <div class="stage-h">Gauge — 240° with bands</div>
          <div style="display:flex;justify-content:center">
            ${C.gauge({ value: D.HEALTH, size: 168, grade: D.healthGrade(D.HEALTH), label: '92% tracked' })}
          </div>
        </div>
        <div class="stage thm-dark">
          <div class="stage-h">Area — filled, with gradient</div>
          ${C.area({ points: D.SNAPSHOTS.map((s) => s.net), w: 540, h: 128, id: 'cb1', labels: ['11 May', '25 Jun', 'Today'] })}
        </div>
        <div class="stage thm-light">
          <div class="stage-h">Columns — two series</div>
          ${C.columns({ groups: ['Apr', 'May', 'Jun', 'Jul', 'Aug'].map((m, i) => ({
            label: m,
            values: [{ value: 285000 + i * 4000, color: 'var(--c1)' }, { value: 170000 + D.rnd(`c${i}`) * 60000, color: 'var(--c2)' }],
          })), h: 138 })}
        </div>
        <div class="stage thm-dark">
          <div class="stage-h">Diverging — sign is the message</div>
          ${C.diverging({ rows: [
            ...D.gainers.slice(0, 3),
            ...D.losers.filter((h) => h.pnl < 0).slice(0, 2),
          ].map((h) => ({ label: h.symbol, value: h.pnl, right: D.compact(h.pnl) })) })}
        </div>
        <div class="stage thm-light">
          <div class="stage-h">Rings, sparkline, sunburst</div>
          <div class="row" style="gap:20px">
            ${C.ring({ fraction: 0.62, size: 78, stroke: 9, center: '62%' })}
            ${C.ring({ fraction: 0.28, size: 78, stroke: 9, center: '28%' })}
            <div>${C.spark({ points: D.SNAPSHOTS.slice(-30).map((s) => s.net), w: 110, h: 34 })}
              <div style="font-size:10px;color:var(--muted);margin-top:5px">30-day sparkline</div></div>
            ${C.sunburst({ size: 112, nodes: D.rollup('group').map((g) => ({
              value: g.current, color: g.color,
              children: D.HOLDINGS.filter((h) => h.group === g.key).sort((a, b) => b.current - a.current).slice(0, 5).map((h, i) => ({ value: h.current, op: 0.75 - i * 0.1 })),
            })) })}
          </div>
        </div>
      </div>

      <div class="note-h">Empty state</div>
      ${pair(K.emptyState('No holdings yet', 'Import a broker export, or add your first position by hand.', K.button('Add holding', 'primary', { icon: icon('plus', 15) })))}
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:32px">
      <div class="note-h" style="margin-top:0">Shared rules</div>
      <p class="note-p">
        Every chart takes its colours from tokens, draws its grid from
        <code>--grid-line</code>, and labels its axes in <code>--muted</code> at 10.5px. None of them
        renders a tooltip through the <code>title</code> attribute — an OS tooltip waits a second, is
        styled by the platform, and never appears on a touch screen at all.</p>

      ${spec([
        ['Donut thickness', '18–22px'], ['Donut gap', '0.014 rad'],
        ['Donut track', '--fill-strong'], ['Area stroke', '2px, non-scaling'],
        ['Area fill', '26% → 0% gradient'], ['Grid lines', '3, at 25/50/75%'],
        ['Column width', '12px'], ['Column radius', '4px top'],
        ['Column gap', '2px'], ['Bar height', '9px'],
        ['Ring stroke', '9–11px, round cap'], ['Gauge sweep', '240°'],
        ['Gauge stroke', '15px'], ['Band arc', '3.5px at 30%'],
      ])}

      <div class="note-h">Order, not sorting</div>
      <p class="note-p">
        Asset-group donuts render in the fixed group order. Sorting slices by value would reshuffle
        which hues sit adjacent, and adjacency is exactly what the colourblind validation was run
        against.</p>

      <div class="note-h">Entrance</div>
      <p class="note-p">
        Lines draw in via <code>stroke-dashoffset</code>, bars grow from the baseline via
        <code>scaleY</code>, rings and gauges animate <code>stroke-dashoffset</code> over 600ms.
        All are suppressed entirely under reduced motion — see Part E.</p>
    </div>
  </div>`,
});

export default [
  divider({
    part: 'Part B',
    title: 'Components',
    lede: `The primitive kit every screen is assembled from — each specimen shown on both theme
      canvases, with the states, measurements and reasoning behind it.`,
    contents: ['Buttons · chips · controls', 'Surfaces · forms · feedback', 'Figures · tables · lists', 'Charts'],
  }),
  buttonsPage,
  formsPage,
  dataPage,
  chartsPage,
];
