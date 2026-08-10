/** Protect group — /liabilities, /insurance, /safety-net, /score. */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { shell } from '../chrome.js';
import { cal } from '../doc.js';

// -------------------------------------------------------------- /liabilities
const card = D.LIABILITIES.find((l) => l.kind === 'credit_card');
const utilisation = (card.principal / card.limit) * 100;
const weightedApr = D.LIABILITIES.reduce((a, l) => a + l.apr * l.principal, 0) / D.DEBT;
const monthlyObligation = D.LIABILITIES.filter((l) => l.emi).reduce((a, l) => a + l.emi, 0);

const liabilitiesBody = `
  ${K.pageIntro('Liabilities', 'What you owe, and what it costs to carry',
    K.button('Payoff plan', 'secondary', { icon: icon('trending-down', 15) }) + K.button('Add liability', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Total outstanding', value: D.money0(D.DEBT), sub: `${D.LIABILITIES.length} accounts`, accent: 'var(--danger)' },
    { label: 'Monthly obligation', value: D.money0(monthlyObligation), sub: '2 EMIs' },
    { label: 'Credit utilisation', value: `${utilisation.toFixed(1)}%`, sub: `of ${D.money0(card.limit)} limit`, accent: 'var(--success)' },
    { label: 'Avg interest rate', value: `${weightedApr.toFixed(2)}%`, sub: 'balance-weighted' },
    { label: 'Interest this month', value: D.money0(D.LIABILITIES.reduce((a, l) => a + (l.principal * l.apr) / 1200, 0)) },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    <div style="flex:1.6;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${D.LIABILITIES.map((l, i) => K.card(`
        <div style="display:flex;align-items:center;gap:14px">
          ${K.avatar(icon(l.kind === 'credit_card' ? 'credit-card' : 'landmark', 17), {
            size: 40, tone: l.apr > 24 ? 'var(--danger-soft)' : 'var(--fill)', color: l.apr > 24 ? 'var(--danger)' : 'var(--ink-soft)' })}
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:14px;font-weight:600;color:var(--ink)">${l.name}</span>
              ${l.apr > 24 ? K.chip('High APR', 'danger') : ''}
            </div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">
              ${l.apr}% APR${l.term ? ` · ${l.term} months remaining` : ` · limit ${D.money0(l.limit)}`}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${D.money0(l.principal)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${l.emi ? `EMI ${D.money0(l.emi)}` : `${D.money0((l.principal * l.apr) / 1200)} interest / mo`}</div>
          </div>
        </div>
        ${l.limit ? `<div style="margin-top:13px">${K.progress(l.principal / l.limit, { height: 7 })}
          <div style="display:flex;margin-top:6px;font-size:11px;color:var(--muted)"><span>Utilisation</span>
          <span style="margin-left:auto;font-variant-numeric:tabular-nums">${utilisation.toFixed(1)}% of ${D.money0(l.limit)}</span></div></div>` : ''}`,
        { cal: i === 0 ? cal(2, 'tl') : '' })).join('')}
    </div>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Debt payoff simulator', K.segmented(['Avalanche', 'Snowball'], 0))}
        ${K.field('Extra each month', K.input('₹15,000', { focus: true }))}
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
          ${K.kv([
            ['Order', 'Card → Car → Home'],
            ['Debt-free in', '13 yr 2 mo'],
            ['Interest saved', D.compact(1840000)],
            ['Months saved', '31'],
          ])}
        </div>
        <p style="margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
          Avalanche targets the highest rate first; snowball targets the smallest balance. Both are
          simulated locally — nothing is scheduled or paid.</p>`, { cal: cal(3, 'tl') })}

      ${K.card(`${K.sectionHeader('Balance by account')}
        <div style="display:flex;align-items:center;gap:16px">
          ${C.donut({ segments: D.LIABILITIES.map((l, i) => ({ label: l.name, value: l.principal, color: `var(--c${i + 4})`, right: D.compact(l.principal) })), size: 128, thickness: 18, center: D.compact(D.DEBT) })}
          ${C.legend(D.LIABILITIES.map((l, i) => ({ label: l.name, color: `var(--c${i + 4})`, right: `${((l.principal / D.DEBT) * 100).toFixed(0)}%` })))}
        </div>`)}
    </div>
  </div>`;

// ---------------------------------------------------------------- /insurance
const insuranceBody = `
  ${K.pageIntro('Insurance', 'Policies, the cover they provide, and where it falls short',
    K.button('Add policy', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Total cover', value: D.compact(D.INSURANCE.reduce((a, p) => a + p.cover, 0)), sub: `${D.INSURANCE.length} policies` },
    { label: 'Annual premium', value: D.money0(D.INSURANCE.reduce((a, p) => a + p.premium, 0)) },
    { label: 'Life cover gap', value: D.compact(D.LIFE_TARGET - D.LIFE_COVER), sub: `target ${D.compact(D.LIFE_TARGET)}`, accent: 'var(--warning)' },
    { label: 'Health cover', value: D.compact(D.HEALTH_COVER), sub: `floor ${D.compact(D.HEALTH_FLOOR)}`, accent: 'var(--success)' },
    { label: 'Next renewal', value: 'in 12 days', sub: 'Car — comprehensive', accent: 'var(--danger)' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    <div style="flex:1.55;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${D.INSURANCE.map((p, i) => K.card(`
        <div style="display:flex;align-items:center;gap:14px">
          ${K.avatar(icon(p.type === 'health' ? 'heart-pulse' : p.type === 'vehicle' ? 'car' : 'shield', 17), { size: 40, tone: 'var(--accent-soft)', color: 'var(--accent)' })}
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:14px;font-weight:600;color:var(--ink)">${p.name}</span>
              ${K.chip(p.type[0].toUpperCase() + p.type.slice(1), 'neutral')}
              ${p.renewIn <= 30 ? K.chip(`Renews in ${p.renewIn}d`, 'danger') : ''}
            </div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:3px">${p.provider} · renews ${D.dmy(D.daysAhead(p.renewIn))}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${D.compact(p.cover)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${D.money0(p.premium)} / year</div>
          </div>
        </div>`, { cal: i === 0 ? cal(2, 'tl') : '' })).join('')}

      ${K.card(`${K.sectionHeader('Renewal timeline')}
        ${C.hbars({ rows: D.INSURANCE.slice().sort((a, b) => a.renewIn - b.renewIn).map((p) => ({
          label: p.name, value: 365 - p.renewIn, right: `${p.renewIn} days`,
          color: p.renewIn <= 30 ? 'var(--danger)' : p.renewIn <= 60 ? 'var(--warning)' : 'var(--c1)',
        })) })}`)}
    </div>

    ${K.card(`${K.sectionHeader('Coverage gaps')}
      ${[
        ['Life cover', D.LIFE_COVER, D.LIFE_TARGET, '10 × annual income'],
        ['Health cover', D.HEALTH_COVER, D.HEALTH_FLOOR, 'half income, floor ₹5 L'],
      ].map(([label, have, want, rule]) => {
        const f = Math.min(1, have / want);
        return `<div style="padding:12px 0;border-top:1px solid var(--line)">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
            <span style="font-size:13px;font-weight:600;color:var(--ink)">${label}</span>
            <span style="margin-left:auto;font-size:12px;font-variant-numeric:tabular-nums">${D.compact(have)} <span style="color:var(--muted)">of ${D.compact(want)}</span></span>
          </div>
          ${K.progress(f, { height: 1200, color: f >= 1 ? 'var(--success)' : 'var(--warning)' })}
          <div style="display:flex;margin-top:7px;font-size:11px;color:var(--muted)">
            <span>${rule}</span>
            <span style="margin-left:auto;color:var(--${f >= 1 ? 'success' : 'warning'})">${f >= 1 ? 'Covered' : `${D.compact(want - have)} short`}</span>
          </div></div>`;
      }).join('')}
      <div style="margin-top:14px">
        ${K.banner('Vehicle and home cover are untracked', 'Untracked is not the same as uncovered — the health score renormalises around what it knows rather than scoring these as zero.', 'neutral', { icon: icon('info', 15) })}
      </div>`, { style: 'flex:1;min-width:0', cal: cal(3, 'tl') })}
  </div>`;

// --------------------------------------------------------------- /safety-net
const SAFETY = [
  { key: 'emergency', label: 'Emergency fund', weight: 35, current: 1495000, recommended: D.MONTH_EXPENSE * 6, detail: `${D.EMERGENCY_MONTHS.toFixed(1)} months of expenses covered` },
  { key: 'life', label: 'Life cover', weight: 25, current: D.LIFE_COVER, recommended: D.LIFE_TARGET, detail: '10 × annual income of ' + D.compact(D.ANNUAL_INCOME) },
  { key: 'health', label: 'Health cover', weight: 25, current: D.HEALTH_COVER, recommended: D.HEALTH_FLOOR, detail: 'half of annual income, floor ₹5 L' },
  { key: 'retirement', label: 'Retirement assets', weight: 15, current: D.RETIREMENT_VALUE, recommended: D.ANNUAL_INCOME * 5, detail: 'NPS Tier I — Scheme E' },
].map((s) => ({ ...s, coveredPct: Math.min(100, (s.current / s.recommended) * 100), gap: Math.max(0, s.recommended - s.current) }));

const readiness = Math.round(SAFETY.reduce((a, s) => a + (s.coveredPct / 100) * s.weight, 0));

const safetyNetBody = `
  ${K.pageIntro('Safety Net', 'How long you could absorb a shock without selling anything')}

  ${K.statStrip([
    { label: 'Readiness', value: String(readiness), sub: 'of 100', accent: 'var(--warning)' },
    { label: 'Months covered', value: D.EMERGENCY_MONTHS.toFixed(1), sub: 'target 6 months' },
    { label: 'Emergency fund', value: D.compact(1495000), sub: `of ${D.compact(D.MONTH_EXPENSE * 6)} recommended` },
    { label: 'Annual premium', value: D.money0(D.INSURANCE.reduce((a, p) => a + p.premium, 0)), sub: 'across 3 policies' },
    { label: 'Annual income', value: D.compact(D.ANNUAL_INCOME), sub: 'basis for every target' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Readiness')}
      <div style="display:flex;align-items:center;gap:22px">
        ${C.gauge({ value: readiness, size: 192, grade: readiness >= 70 ? 'Strong' : 'Fair', label: 'weighted across four components' })}
        <div style="flex:1;min-width:0">
          ${C.legend(SAFETY.map((s, i) => ({ label: `${s.label} · ${s.weight}%`, color: `var(--c${i + 1})`, right: `${s.coveredPct.toFixed(0)}%` })))}
          <p style="margin:14px 0 0;font-size:11px;color:var(--muted);line-height:1.55">
            Weights are fixed: emergency 35, life 25, health 25, retirement 15. This screen is
            read-only — it reports, it never asks you to change anything.</p>
        </div>
      </div>`, { style: 'flex:1.15;min-width:0', cal: cal(2, 'tl') })}

    ${K.card(`${K.sectionHeader('Components')}
      ${SAFETY.map((s) => `
        <div style="padding:13px 0;border-top:1px solid var(--line)">
          <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:7px">
            <span style="font-size:13px;font-weight:600;color:var(--ink)">${s.label}</span>
            ${K.chip(`${s.weight}%`, 'neutral')}
            <span style="margin-left:auto;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">${D.compact(s.current)}
              <span style="color:var(--muted);font-weight:400">of ${D.compact(s.recommended)}</span></span>
          </div>
          ${K.progress(s.coveredPct / 100, { height: 7 })}
          <div style="display:flex;margin-top:6px;font-size:11px;color:var(--muted)">
            <span>${s.detail}</span>
            <span style="margin-left:auto;${s.gap ? 'color:var(--warning)' : 'color:var(--success)'}">${s.gap ? `${D.compact(s.gap)} short` : 'Covered'}</span>
          </div>
        </div>`).join('')}`, { style: 'flex:1.35;min-width:0', cal: cal(3, 'tl') })}
  </div>`;

// -------------------------------------------------------------------- /score
const scoreBody = `
  ${K.pageIntro('Financial health', `${D.healthGrade(D.HEALTH)} — 92% of the inputs are tracked`,
    K.segmented(['Now', '3M', '6M', '1Y'], 0))}

  <div style="display:flex;gap:16px">
    ${K.card(`
      <div style="display:flex;align-items:center;gap:26px">
        ${C.gauge({ value: D.HEALTH, size: 216, grade: D.healthGrade(D.HEALTH), label: 'financial health score' })}
        <div style="flex:1;min-width:0">
          <p style="margin:0 0 14px;font-size:13px;color:var(--ink-soft);line-height:1.65">
            One score over four weighted categories. Anything the vault cannot see is
            <b style="color:var(--ink)">untracked, not zero</b> — the weights renormalise over what
            is known, and the grade is withheld entirely below 50% tracked weight.</p>
          ${C.area({ points: D.SNAPSHOTS.map((s) => s.health), w: 460, h: 108, id: 'score', grid: false, labels: [D.dm(D.SNAPSHOTS[0].date), D.dm(D.SNAPSHOTS[45].date), 'Today'] })}
        </div>
      </div>`, { style: 'flex:1.25;min-width:0', cal: cal(1, 'tl') })}

    ${K.card(`${K.sectionHeader('Bands')}
      ${C.HEALTH_BANDS.slice().reverse().map((b) => `
        <div style="display:flex;align-items:center;gap:11px;padding:8px 0;${D.HEALTH >= b.min && D.HEALTH < b.max ? 'font-weight:600' : ''}">
          <span style="width:26px;height:9px;border-radius:999px;background:${b.color};opacity:${D.HEALTH >= b.min && D.HEALTH < b.max ? 1 : 0.32};flex:none"></span>
          <span style="font-size:12.5px;color:var(--ink)">${b.label}</span>
          <span style="margin-left:auto;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums">${b.min}–${b.max}</span>
        </div>`).join('')}
      <p style="margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.55">
        Bands are drawn faintly on every gauge track so a score has a scale, not just a number.</p>`,
      { style: 'flex:1;min-width:0', cal: cal(2, 'tl') })}
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:16px">
    ${D.HEALTH_CATEGORIES.map((c, i) => K.card(`
      <div style="display:flex;align-items:center;gap:14px">
        ${C.ring({ fraction: c.score / 100, size: 74, stroke: 9, center: String(c.score) })}
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--ink)">${c.label}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">weight ${c.weight}%</div>
        </div>
      </div>
      <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--line)">
        ${c.metrics.map(([label, w, detail]) => `
          <div style="padding:6px 0">
            <div style="display:flex;align-items:baseline;gap:8px">
              <span style="font-size:12px;font-weight:600;color:var(--ink)">${label}</span>
              <span style="margin-left:auto;font-size:10.5px;color:var(--muted)">${w} pts</span>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;line-height:1.45">${detail}</div>
          </div>`).join('')}
      </div>`, { cal: i === 0 ? cal(3, 'tl') : '' })).join('')}
  </div>

  ${K.card(`
    ${K.banner('Informational only — not investment advice', 'The score is a summary of what this vault contains. It is not a rating, it is not shared with anyone, and it never leaves the device.', 'neutral', { icon: icon('shield-check', 15) })}`,
    { style: 'margin-top:16px', cal: cal(4, 'tl') })}`;

export default [
  {
    art: shell({ path: '/liabilities', title: 'Liabilities', body: liabilitiesBody, h: 1200 }),
    meta: {
      name: 'Liabilities', route: '/liabilities', height: 1200,
      purpose: `Loans and credit cards with their real carrying cost, plus a local payoff simulator
        that compares avalanche against snowball ordering.`,
      notes: [
        `<b>Average rate is balance-weighted.</b> A simple mean of 42%, 8.6% and 9.4% would say 20%
         and be useless — the ₹48 L home loan dominates, and the figure says so.`,
        `<b>High APR is flagged on the account</b>, and the same fact applies a ×0.85 factor inside
         the health score's debt-load metric. One condition, two consistent consequences.`,
        `<b>Utilisation uses the budget zone colours</b>, so a credit card reads with the same
         grammar as a spending envelope.`,
      ],
      specs: [['Utilisation zones', '70% · 90%'], ['High-APR threshold', '24%'], ['Payoff strategies', 'avalanche · snowball'], ['Balance type', '20px / 700']],
    },
  },
  {
    art: shell({ path: '/insurance', title: 'Insurance', body: insuranceBody, h: 1200 }),
    meta: {
      name: 'Insurance', route: '/insurance', height: 1200,
      purpose: `Policies held, what each covers, when each renews, and the two gaps the app can
        actually compute — life and health — against rules stated on screen.`,
      notes: [
        `<b>Renewals inside 30 days become a danger chip</b> on the policy itself, and the same
         window drives the notification menu in the topbar.`,
        `<b>Gap rules are printed beside the bars.</b> “10 × annual income” is a stated assumption a
         reader can disagree with, not a black-box target.`,
        `<b>Untracked ≠ uncovered.</b> Vehicle and home cover are absent from the gap panel rather
         than shown at zero, and the note says why.`,
      ],
      specs: [['Life multiple', '10 × annual income'], ['Health floor', 'max(₹5 L, income ÷ 2)'], ['Renewal warning', '≤ 30 days'], ['Cover type', '20px / 700']],
    },
  },
  {
    art: shell({ path: '/safety-net', title: 'Safety Net', body: safetyNetBody, h: 1200 }),
    meta: {
      name: 'Safety Net', route: '/safety-net', height: 1200,
      purpose: `A read-only readiness reading over four weighted components — emergency fund, life
        cover, health cover and retirement assets. The one screen with no actions at all.`,
      notes: [
        `<b>No buttons, deliberately.</b> Every component is owned by another screen. Adding “fix
         this” actions here would duplicate those flows and put the user two places at once.`,
        `<b>Every target traces to income.</b> Six months of expenses, ten times income, half of
         income — the annual-income KPI is in the strip so the basis of all four is visible.`,
        `<b>Coverage caps at 100%.</b> Being over-insured does not buy a higher score, so a component
         cannot inflate the total past its weight.`,
      ],
      specs: [['Weights', 'emergency 35 · life 25 · health 25 · retirement 15'], ['Emergency target', '6 months'], ['Bar height', '7px'], ['Actions', 'none']],
    },
  },
  {
    art: shell({ path: '/score', title: 'Score', body: scoreBody, h: 1200 }),
    meta: {
      name: 'Score', route: '/score', height: 1200,
      purpose: `The financial health score and the twelve metrics behind it, each with the points it
        contributes and the sentence that explains its current reading.`,
      notes: [
        `<b>Every point is accounted for.</b> Four categories at 30/25/25/20, twelve metrics summing
         to their category weight. A score with no visible derivation is a horoscope.`,
        `<b>The trend is the score's own history</b>, taken from the daily snapshots rather than
         recomputed — so the line matches whatever the score was on the day.`,
        `<b>Category rings, not bars.</b> Same component as Goals at 74px, which keeps “progress
         towards a whole” one visual idea across the product.`,
        `<b>The disclaimer is a component</b>, not a footnote in small print, and it names the
         privacy property alongside the legal one.`,
      ],
      specs: [['Category weights', '30 / 25 / 25 / 20'], ['Metrics', '12'], ['Min gradable weight', '50%'], ['Bands', '85 / 70 / 55 / 40'], ['Ring', '74px, 9px stroke']],
    },
  },
];
