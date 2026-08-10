/** More group — /import, /add, /news, /alerts, /diagnostics, /settings, /help. */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { shell } from '../chrome.js';
import { cal } from '../doc.js';

// ------------------------------------------------------------------- /import
const IMPORT_ROWS = [
  ['INFY', 'NSE', 25, 1420.50, 1583.20, 'ok'],
  ['TCS', 'NSE', 10, 3550.00, 3712.85, 'ok'],
  ['HDFCBANK', 'NSE', 40, 1610.25, 1688.40, 'update'],
  ['RELIANCE', 'NSE', 15, 2410.00, 2645.00, 'ok'],
  ['ZZTEST', 'NSE', 5, 100.00, 0, 'reject'],
];

const importBody = `
  ${K.pageIntro('Import', 'Bring in holdings or transactions from a broker or bank export',
    K.button('Download template', 'secondary', { icon: icon('download', 15) }))}

  <div style="display:flex;gap:16px;margin-bottom:16px">
    ${['Choose a source', 'Preview', 'Confirm'].map((s, i) => `
      <div style="flex:1;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:var(--radius-panel);
        border:1px solid ${i === 1 ? 'var(--accent-line)' : 'var(--line)'};background:${i === 1 ? 'var(--accent-soft)' : 'var(--card)'}">
        <span style="width:26px;height:26px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:700;
          background:${i <= 1 ? 'var(--accent)' : 'var(--fill-strong)'};color:${i <= 1 ? 'var(--primary-fg)' : 'var(--muted)'}">
          ${i === 0 ? icon('check', 14, { stroke: 3 }) : i + 1}</span>
        <span style="font-size:13.5px;font-weight:600;color:var(--${i <= 1 ? 'ink' : 'muted'})">${s}</span>
      </div>`).join('')}
  </div>

  <div style="display:flex;gap:16px">
    ${K.card(`${K.sectionHeader('Preview — 5 rows parsed', `<span style="display:flex;gap:8px">${K.chip('4 to create', 'success')}${K.chip('1 to update', 'warning')}${K.chip('1 rejected', 'danger')}</span>`)}
      ${K.table({
        head: ['', 'Symbol', 'Exchange', 'Qty', 'Avg cost', 'Last price', 'Result'],
        align: ['c', 'l', 'l', 'r', 'r', 'r', 'l'],
        w: ['4%'],
        rows: IMPORT_ROWS.map((r) => [
          r[5] === 'reject'
            ? `<span style="color:var(--danger)">${icon('x', 15, { stroke: 2.5 })}</span>`
            : `<span style="display:inline-grid;place-items:center;width:17px;height:17px;border-radius:5px;background:var(--accent);color:var(--primary-fg)">${icon('check', 12, { stroke: 3 })}</span>`,
          `<b style="color:var(--ink);font-weight:600">${r[0]}</b>`, r[1], D.qty(r[2]), D.money(r[3]),
          r[4] ? D.money(r[4]) : '<span style="color:var(--muted)">—</span>',
          r[5] === 'ok' ? K.chip('New holding', 'success') : r[5] === 'update' ? K.chip('Updates existing', 'warning') : K.chip('Not in master', 'danger'),
        ]),
      })}
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;color:var(--muted)">Nothing is written until you confirm.</span>
        <span style="margin-left:auto;display:flex;gap:8px">${K.button('Cancel', 'ghost')}${K.button('Import 5 rows', 'primary')}</span>
      </div>`, { style: 'flex:2;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Source')}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${[['ZE', 'Zerodha', 'var(--c6)'], ['GR', 'Groww', 'var(--c1)'], ['IN', 'INDmoney', 'var(--c3)'],
             ['UP', 'Upstox', 'var(--c4)'], ['IC', 'ICICI Direct', 'var(--c2)'], ['CD', 'CDSL', 'var(--c5)']].map(([ini, name, col], i) => `
            <div style="border-radius:10px;border:1px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'};padding:11px 8px;text-align:center;
              background:${i === 0 ? 'var(--accent-soft)' : 'transparent'}">
              <span style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;background:${col};color:#fff;font-size:11px;font-weight:700">${ini}</span>
              <div style="font-size:10.5px;font-weight:600;margin-top:6px;color:var(--ink)">${name}</div>
            </div>`).join('')}
        </div>
        <div style="margin-top:14px">
          ${K.banner('How to export from Zerodha', 'Console → Portfolio → Holdings → download as CSV. Khazana reads the file locally; it is never uploaded.', 'accent', { icon: icon('file-text', 15) })}
        </div>`, { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('Recent batches')}
        ${K.list([
          ['holdings-aug.csv', '24 holdings created', 4],
          ['icici-statement.csv', '38 transactions created', 12],
        ].map(([f, r, d]) => `
          <span style="color:var(--ink-soft);flex:none">${icon('file-text', 17)}</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${f}</span>
            <span style="display:block;font-size:11px;color:var(--muted)">${r} · ${D.dm(D.daysAgo(d))}</span></span>
          ${K.button('Undo', 'ghost')}`))}
        <p style="margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
          Every import is one batch. Undo removes exactly the records that batch created — nothing
          you have edited since.</p>`, { cal: cal(3, 'tl') })}
    </div>
  </div>`;

// ---------------------------------------------------------------------- /add
const addBody = `
  ${K.pageIntro('Add transaction', 'Quick entry — or type it in plain language')}

  <div style="display:flex;gap:16px">
    ${K.card(`
      <div style="margin-bottom:18px">${K.segmented(['Expense', 'Income', 'Transfer'], 0)}</div>

      <div style="text-align:center;padding:22px 0 26px;border-bottom:1px solid var(--line);margin-bottom:20px">
        <div style="font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Amount</div>
        <div style="margin-top:10px;font-size:52px;font-weight:700;letter-spacing:-0.045em;font-variant-numeric:tabular-nums;color:var(--ink)">
          ₹1,240<span style="color:var(--muted)">.00</span></div>
      </div>

      <div style="font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:11px">Category</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-bottom:20px">
        ${['Food', 'Transport', 'Rent', 'Utilities', 'Shopping', 'Health', 'Entertainment', 'EMI', 'Salary', 'Investment', 'Other'].map((c, i) => `
          <div style="border-radius:12px;border:1px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'};padding:12px 6px;text-align:center;
            background:${i === 0 ? 'var(--accent-soft)' : 'transparent'};color:var(--${i === 0 ? 'accent' : 'ink-soft'})">
            ${icon(['coins', 'car', 'home', 'building-2', 'receipt', 'heart-pulse', 'sparkles', 'landmark', 'wallet', 'trending-up', 'file-text'][i], 17, { style: 'margin:0 auto' })}
            <div style="font-size:10.5px;font-weight:600;margin-top:6px">${c}</div>
          </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        ${K.field('Merchant', K.input('Swiggy'))}
        ${K.field('Account', K.select('ICICI Spends'))}
        ${K.field('Date', K.input('09 Aug 2026', { icon: `<span style="color:var(--muted)">${icon('calendar-days', 15)}</span>` }))}
        ${K.field('Note', K.input('Add a note…', { placeholder: true }))}
      </div>

      <div style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
        ${K.button('Cancel', 'ghost')}
        <span style="margin-left:auto">${K.button('Save and add another', 'secondary')}</span>
        ${K.button('Save transaction', 'primary', { icon: icon('check', 15) })}
      </div>`, { style: 'flex:1.5;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Quick add')}
        ${K.input('1240 swiggy food today', { focus: true })}
        <p style="margin:11px 0 14px;font-size:11.5px;color:var(--ink-soft);line-height:1.6">
          Parsed on device: amount, merchant, category and date, in any order. Nothing is sent
          anywhere to be understood.</p>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          ${K.chip('₹1,240', 'accent')}${K.chip('Swiggy', 'accent')}${K.chip('Food', 'accent')}${K.chip('09 Aug', 'accent')}
        </div>`, { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('Recent merchants')}
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${['Swiggy', 'Uber', 'Amazon India', 'BigBasket', 'Blue Tokai', 'Zomato', 'Netflix', 'Tata Power'].map((m) => K.chip(m, 'neutral')).join('')}
        </div>
        <p style="margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
          A merchant you have categorised before is remembered locally, so the next entry with the
          same name lands in the same category.</p>`)}

      ${K.card(`${K.sectionHeader('Budget impact')}
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:7px">
          <span style="font-size:12.5px;color:var(--ink-soft)">Food</span>
          <span style="margin-left:auto;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(D.BUDGETS[0].spent)} / ${D.money0(D.BUDGETS[0].limit)}</span>
        </div>
        ${K.progress(D.BUDGETS[0].fraction)}
        <p style="margin:9px 0 0;font-size:11px;color:var(--muted)">This entry moves Food to ${((D.BUDGETS[0].spent / D.BUDGETS[0].limit) * 100).toFixed(0)}% of its envelope.</p>`,
        { cal: cal(3, 'tl') })}
    </div>
  </div>`;

// --------------------------------------------------------------------- /news
const newsBody = `
  ${K.pageIntro('News', 'A demonstration feed — nothing is fetched',
    `<span style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:999px;background:var(--warning-soft);color:var(--warning);font-size:11.5px;font-weight:600">
      ${icon('circle-alert', 14)} Generated content</span>`)}

  <div style="display:flex;gap:16px">
    ${K.card(`
      ${D.NEWS.map((n, i) => `
        <div style="display:flex;gap:16px;padding:16px 0;${i ? 'border-top:1px solid var(--line)' : 'padding-top:0'}">
          ${K.avatar(icon('newspaper', 17), { size: 40 })}
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px">
              ${K.chip(n[1], 'neutral')}
              <span style="font-size:11px;color:var(--muted)">${n[2]} hours ago</span>
            </div>
            <div style="font-size:14.5px;font-weight:600;letter-spacing:-0.015em;color:var(--ink);line-height:1.4">${n[0]}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.55">
              Placeholder body copy. In the shipped app this feed exists to prove the layout, not to
              inform a decision.</div>
          </div>
          <span style="color:var(--muted);flex:none">${icon('external-link', 15)}</span>
        </div>`).join('')}`, { style: 'flex:2;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Why this is synthetic')}
        <p style="margin:0 0 14px;font-size:12.5px;color:var(--ink-soft);line-height:1.65">
          A real news feed means a request to a server, and a request from this app would carry the
          shape of what you hold. The product's core promise is that no such request exists — so the
          feed is generated locally and labelled as generated.</p>
        ${K.banner('Twelve fixed headlines', 'Deterministic, offline, and badged everywhere they appear.', 'warning', { icon: icon('circle-alert', 15) })}`,
        { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('Categories')}
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${['Monetary Policy', 'Earnings', 'Markets', 'Corporate Action', 'Commodities', 'Regulation', 'Sector'].map((c) => K.chip(c, 'neutral')).join('')}
        </div>`)}
    </div>
  </div>`;

// ------------------------------------------------------------------- /alerts
const alertsBody = `
  ${K.pageIntro('Alerts', 'Rules evaluated on this device, against your own prices',
    K.button('New alert', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Active rules', value: String(D.ALERTS.length) },
    { label: 'Triggered', value: '0', sub: 'since you last looked' },
    { label: 'Price rules', value: '2' },
    { label: 'Weight rules', value: '1' },
  ])}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Rules')}
      ${K.table({
        head: ['Rule', 'Instrument', 'Threshold', 'Current', 'Distance', 'Status', ''],
        align: ['l', 'l', 'r', 'r', 'r', 'l', 'r'],
        w: ['28%'],
        rows: D.ALERTS.map((a) => {
          const dist = a.current == null ? null : ((a.current - a.threshold) / a.threshold) * 100;
          return [
            `<span style="display:flex;align-items:center;gap:10px">${K.avatar(icon('bell', 15), { size: 30 })}
              <span style="font-size:12.5px;font-weight:600;color:var(--ink)">${a.label}</span></span>`,
            `<b style="color:var(--ink);font-weight:600">${a.symbol}</b>`,
            a.kind === 'weight_above' ? `${a.threshold}%` : D.money0(a.threshold),
            a.current == null ? '<span style="color:var(--muted)">—</span>' : D.money0(a.current),
            K.delta(dist),
            K.chip('Armed', 'accent'),
            `<span style="display:flex;gap:8px;justify-content:flex-end;color:var(--muted)">${icon('pencil', 14)}${icon('trash-2', 14)}</span>`,
          ];
        }),
      })}`, { style: 'flex:2;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('New rule')}
        ${K.field('Kind', K.select('Price rises above'))}
        <div style="margin-top:13px">${K.field('Instrument', K.select('RELIANCE — Reliance Industries'))}</div>
        <div style="margin-top:13px">${K.field('Threshold', K.input('₹2,800.00', { focus: true }), 'Currently ₹2,645.00 — 5.9% away.')}</div>
        <div style="margin-top:16px">${K.button('Create alert', 'primary', { full: true })}</div>`, { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('How alerts fire')}
        <p style="margin:0;font-size:12.5px;color:var(--ink-soft);line-height:1.65">
          Rules are evaluated when the app is open and prices change — there is no background service
          and no push. An armed rule with a stale price stays armed rather than firing on old data.</p>`)}
    </div>
  </div>`;

// -------------------------------------------------------------- /diagnostics
const CHECKS = [
  ['Double-entry balance', 'ok', 'Every entry sums to zero'],
  ['Ledger coverage', 'ok', 'All 61 transactions have postings'],
  ['Posting → account references', 'ok', 'No orphans'],
  ['Stored amount cleanliness', 'ok', 'No amounts stored as floats'],
  ['Transaction → category references', 'ok', 'All 61 resolve'],
  ['Unpriced holdings', 'ok', `All ${D.PORTFOLIO.count} priced`],
  ['Fixed income missing rates', 'ok', 'No fixed-income positions held'],
  ['Missing purchase dates', 'ok', `All ${D.PORTFOLIO.count} dated`],
  ['Lot reconciliation drift', 'warn', `${D.PORTFOLIO.count} holdings use synthetic lots`],
  ['Approximate FX rates', 'ok', 'All holdings are INR'],
];

const diagnosticsBody = `
  ${K.pageIntro('Diagnostics', 'What the vault knows about itself',
    K.button('Re-run checks', 'secondary', { icon: icon('refresh-cw', 15) }) + K.button('Export log', 'ghost'))}

  ${K.statStrip([
    { label: 'Checks passed', value: '9 / 10', accent: 'var(--success)' },
    { label: 'Warnings', value: '1', accent: 'var(--warning)' },
    { label: 'Errors', value: '0', accent: 'var(--success)' },
    { label: 'Records', value: '196', sub: 'in this vault' },
    { label: 'Last checked', value: 'just now' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Integrity checks')}
      ${CHECKS.map((c, i) => `
        <div style="display:flex;align-items:center;gap:13px;padding:11px 0;${i ? 'border-top:1px solid var(--line)' : ''}">
          <span style="flex:none;color:var(--${c[1] === 'ok' ? 'success' : 'warning'})">
            ${icon(c[1] === 'ok' ? 'circle-check' : 'triangle-alert', 17)}</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:13px;font-weight:600;color:var(--ink)">${c[0]}</span>
            <span style="display:block;font-size:11.5px;color:var(--muted);margin-top:1px">${c[2]}</span>
          </span>
          ${c[1] === 'ok' ? K.chip('Pass', 'success') : K.chip('Warning', 'warning')}
        </div>`).join('')}`, { style: 'flex:1.7;min-width:0', cal: cal(2, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Record counts')}
        ${K.kv([
          ['Transactions', '61'], ['Transfers', '6'], ['Postings', '134'], ['Accounts', '3'],
          ['Holdings', String(D.PORTFOLIO.count)], ['Snapshots', String(D.SNAPSHOTS.length)],
          ['Budgets', String(D.BUDGETS.length)], ['Goals', String(D.GOALS.length)],
          ['Policies', String(D.INSURANCE.length)], ['Dividends', String(D.DIVIDENDS.length)],
        ])}`, { cal: cal(3, 'tl') })}

      ${K.card(`${K.sectionHeader('The one warning')}
        ${K.banner('Holdings use synthetic lots', 'These positions were entered as a quantity and an average cost rather than as individual buys, so FIFO gains are approximated from a single derived lot. Import a trade file to replace them.', 'warning', { icon: icon('triangle-alert', 15) })}
        <div style="margin-top:12px">${K.button('Import trades', 'secondary', { full: true })}</div>`, { cal: cal(4, 'tl') })}
    </div>
  </div>`;

// ----------------------------------------------------------------- /settings
const toggle = (on) => `<span style="flex:none;width:38px;height:22px;border-radius:999px;padding:2px;display:flex;
  background:var(--${on ? 'accent' : 'fill-strong'});justify-content:${on ? 'flex-end' : 'flex-start'}">
  <span style="width:18px;height:18px;border-radius:999px;background:${on ? 'var(--primary-fg)' : 'var(--muted)'}"></span></span>`;

const settingRow = (title, detail, control) => `
  <div style="display:flex;align-items:center;gap:16px;padding:13px 0;border-top:1px solid var(--line)">
    <span style="flex:1;min-width:0">
      <span style="display:block;font-size:13.5px;font-weight:600;color:var(--ink)">${title}</span>
      <span style="display:block;font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.5">${detail}</span>
    </span>${control}</div>`;

const settingsBody = `
  ${K.pageIntro('Settings &amp; Privacy', 'Everything here happens on this device')}

  <div style="display:flex;gap:16px">
    <div style="flex:1.5;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Appearance')}
        ${settingRow('Theme', 'Vault, Ledger, or follow the system.', K.segmented(['Light', 'Dark', 'System'], 1))}
        ${settingRow('Accent', 'Five accents, each with a validated light and dark step.',
          `<span style="display:flex;gap:7px">${['#1B7F52', '#3B5FBF', '#6E5BB8', '#B4642A', '#A83A45'].map((c, i) => `
            <span style="width:24px;height:24px;border-radius:999px;background:${c};${i === 0 ? 'box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--accent)' : ''}"></span>`).join('')}</span>`)}
        ${settingRow('Ghost mode', 'Mask every figure as ••••••, for a shared screen.', toggle(false))}`,
        { cal: cal(1, 'tl') })}

      ${K.card(`${K.sectionHeader('Security')}
        ${settingRow('Auto-lock', 'Lock the vault after a period of inactivity.', K.select('After 5 minutes', { w: '180px' }))}
        ${settingRow('Biometric unlock', 'Use the platform authenticator instead of the PIN.', toggle(true))}
        ${settingRow('Change PIN', 'Re-encrypts the vault key. Data is never re-written.', K.button('Change', 'secondary'))}`,
        { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('Data')}
        ${settingRow('Back up vault', 'Encrypted .ftos file. Restores into the Flutter app too.', K.button('Export backup', 'secondary', { icon: icon('download', 15) }))}
        ${settingRow('Restore', 'Replaces everything in this vault.', K.button('Choose file', 'secondary'))}
        ${settingRow('Load sample data', 'Populate this vault with the demo portfolio and ledger.', K.button('Load', 'secondary'))}
        ${settingRow('Erase everything', 'Irreversible. The key is destroyed with the data.', K.button('Erase vault', 'danger', { icon: icon('trash-2', 15) }))}`,
        { cal: cal(3, 'tl') })}
    </div>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <span style="color:var(--accent)">${icon('shield-check', 22)}</span>
          <span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;color:var(--ink)">The privacy contract</span>
        </div>
        ${[
          ['No server', 'There is no account and no backend. Nothing to breach.'],
          ['Encrypted at rest', 'AES-256-GCM per record, keyed from your PIN.'],
          ['PIN never stored', 'It derives the key and is discarded.'],
          ['No telemetry', 'No analytics, no crash reporting, no network calls.'],
        ].map(([t, d]) => `
          <div style="display:flex;gap:11px;padding:9px 0;border-top:1px solid var(--line)">
            <span style="flex:none;color:var(--success);margin-top:1px">${icon('check', 15, { stroke: 2.5 })}</span>
            <span><span style="display:block;font-size:12.5px;font-weight:600;color:var(--ink)">${t}</span>
            <span style="display:block;font-size:11.5px;color:var(--muted);margin-top:1px;line-height:1.5">${d}</span></span>
          </div>`).join('')}`, { cal: cal(4, 'tl') })}

      ${K.card(`${K.sectionHeader('Vaults')}
        ${K.list([['Personal', 'Self · active'], ['Household', 'Spouse'], ['Studio', 'Business']].map(([n, k], i) => `
          ${K.avatar(n.slice(0, 2), { size: 30, tone: i === 0 ? 'var(--accent-soft)' : 'var(--fill)', color: i === 0 ? 'var(--accent)' : 'var(--ink-soft)' })}
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${n}</span>
            <span style="display:block;font-size:11px;color:var(--muted)">${k}</span></span>
          ${i === 0 ? `<span style="color:var(--accent)">${icon('check', 16, { stroke: 2.5 })}</span>` : ''}`))}
        <div style="margin-top:12px">${K.button('New vault', 'secondary', { full: true, icon: icon('plus', 15) })}</div>`)}

      ${K.card(`${K.sectionHeader('About')}
        ${K.kv([['Version', '1.4.0'], ['Storage', 'IndexedDB (fintech_os)'], ['Records', '196'], ['Vault created', '12 Feb 2026']])}`)}
    </div>
  </div>`;

// --------------------------------------------------------------------- /help
const helpBody = `
  ${K.pageIntro('Help', 'How Khazana works, and what it promises')}

  <div style="display:flex;gap:16px">
    ${K.card(`${K.sectionHeader('How it works')}
      ${[
        ['lock', 'Your PIN is the key', 'The PIN derives an AES-256 key. It is never stored, never transmitted, and cannot be recovered — which is the point. Lose it and the vault is unreadable, including to us.'],
        ['wallet', 'Double-entry underneath', 'Every transaction writes balanced postings. That is why account balances, the balance sheet and net worth always agree, and why a transfer moves money without inventing income.'],
        ['trending-up', 'You supply the prices', 'Holdings are priced by what you enter or import. No feed is called on your behalf, because a request for your holdings is a disclosure of your holdings.'],
        ['download', 'Backups are portable', 'An encrypted .ftos file restores into the mobile app and back. Both clients share the format, so neither can hold your data hostage.'],
      ].map(([ic, t, d], i) => `
        <div style="display:flex;gap:15px;padding:15px 0;${i ? 'border-top:1px solid var(--line)' : 'padding-top:0'}">
          ${K.avatar(icon(ic, 18), { size: 40, tone: 'var(--accent-soft)', color: 'var(--accent)' })}
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:600;color:var(--ink)">${t}</div>
            <div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;line-height:1.65">${d}</div>
          </div>
        </div>`).join('')}`, { style: 'flex:1.6;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Keyboard')}
        ${[['⌘K', 'Command palette'], ['N', 'New transaction'], ['⌘L', 'Lock the vault'], ['G then D', 'Go to dashboard'], ['/', 'Focus search']].map(([k, l]) => `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0">
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px;background:var(--fill-strong);border:1px solid var(--line);font-variant-numeric:tabular-nums">${k}</span>
            <span style="font-size:12.5px;color:var(--ink-soft)">${l}</span>
          </div>`).join('')}`, { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('Take the tour')}
        <p style="margin:0 0 13px;font-size:12.5px;color:var(--ink-soft);line-height:1.65">
          Thirteen pages covering the vault, the ledger, the portfolio and the score.</p>
        ${K.button('Start the tour', 'primary', { full: true, icon: icon('sparkles', 15) })}`)}

      ${K.card(`${K.sectionHeader('Deliberately absent')}
        ${['No account or sign-in', 'No cloud sync service', 'No live market feed', 'No advice or recommendations', 'No analytics of any kind'].map((t) => `
          <div style="display:flex;gap:10px;padding:7px 0;font-size:12.5px;color:var(--ink-soft)">
            <span style="color:var(--muted);flex:none">${icon('x', 15)}</span>${t}</div>`).join('')}`,
        { cal: cal(3, 'tl') })}
    </div>
  </div>`;

export default [
  {
    art: shell({ path: '/import', title: 'Import', body: importBody, h: 1200 }),
    meta: {
      name: 'Import', route: '/import', height: 1200,
      purpose: `Bulk entry from a broker or bank export. Three steps — choose a source, preview every
        parsed row, confirm — with an undo that is scoped to the batch.`,
      notes: [
        `<b>Preview is the whole feature.</b> The result of each row is stated before anything is
         written: new, updates existing, or rejected with the reason.`,
        `<b>Rejections are shown, not dropped.</b> A symbol missing from the instrument master fails
         loudly here rather than appearing later as an “Unclassified” slice.`,
        `<b>Undo is per batch.</b> It removes exactly the records that import created and leaves
         anything edited since alone.`,
      ],
      specs: [['Stepper', '3 steps, 16px radius'], ['Row states', 'new / update / reject'], ['Institutions', '10 presets'], ['Write point', 'confirm only']],
    },
  },
  {
    art: shell({ path: '/add', title: 'Add Transaction', body: addBody, h: 1200 }),
    meta: {
      name: 'Add Transaction', route: '/add', height: 1200,
      purpose: `The most-used screen in the product. Amount first at 52px, then a category grid, then
        the details — or one line of plain language that fills all of it.`,
      notes: [
        `<b>Amount is the hero.</b> 52px, tabular, paise in muted ink. Entry starts where attention
         already is rather than at the top-left of a form.`,
        `<b>Category is a grid, not a select.</b> Eleven categories fit in two rows and are reachable
         in one tap; a dropdown would cost two interactions on the highest-frequency field.`,
        `<b>Quick add parses on device.</b> The chips show what was understood before anything is
         saved — the parse is reviewable, not magic.`,
        `<b>Budget impact is shown pre-save</b>, so the consequence of the entry is visible while it
         can still be reconsidered.`,
      ],
      specs: [['Amount type', '52px / 700 / −0.045em'], ['Category tile', '12px radius'], ['Grid', '6 columns, 9px gap'], ['Field height', '38px'], ['Primary action', 'bottom right']],
    },
  },
  {
    art: shell({ path: '/news', title: 'News', body: newsBody, h: 1200 }),
    meta: {
      name: 'News', route: '/news', height: 1200,
      purpose: `A market story feed, generated locally. It exists to hold the layout that a real feed
        would occupy, and it says so on the screen rather than in a changelog.`,
      notes: [
        `<b>Badged in the page header.</b> The same warning treatment as Markets — synthesised
         content is never presented without its label, anywhere in the product.`,
        `<b>The explanation panel is part of the design.</b> The absence of a live feed is a
         deliberate consequence of the privacy contract, so the screen argues for it.`,
      ],
      specs: [['Story row', '~92px'], ['Headline', '14.5px / 600'], ['Category chip', 'neutral'], ['Headlines', '12 fixed']],
    },
  },
  {
    art: shell({ path: '/alerts', title: 'Alerts', body: alertsBody, h: 1200 }),
    meta: {
      name: 'Alerts', route: '/alerts', height: 1200,
      purpose: `Price and weight rules, evaluated locally against the prices in your vault. Armed
        rules show how far the current value sits from the threshold.`,
      notes: [
        `<b>Distance reuses Delta.</b> The same component that shows a day change shows how far a
         rule is from firing, so one visual idea covers both.`,
        `<b>A weight rule has no price.</b> Its “current” cell renders “—” rather than borrowing an
         unrelated number to fill the column.`,
        `<b>No background service.</b> Rules evaluate when the app is open; the panel says so, because
         a user who expects a push notification and does not get one has been misled by the UI.`,
      ],
      specs: [['Rule kinds', '5'], ['Status chip', 'accent — armed'], ['Evaluation', 'foreground only'], ['Null current', 'renders “—”']],
    },
  },
  {
    art: shell({ path: '/diagnostics', title: 'Diagnostics', body: diagnosticsBody, h: 1200 }),
    meta: {
      name: 'Diagnostics', route: '/diagnostics', height: 1200,
      purpose: `Ten integrity checks over the vault's own data — double-entry balance, orphaned
        references, unpriced holdings, lot drift — each with the records it implicates.`,
      notes: [
        `<b>Three levels, not two.</b> Pass, warning, error. Collapsing warnings into errors is what
         teaches users to ignore a red screen.`,
        `<b>A warning names its fix.</b> The synthetic-lot warning links straight to the import flow
         that resolves it, instead of describing a problem and stopping.`,
        `<b>Record counts are on the same sheet.</b> “Is the data there” and “is the data sound” are
         one question when something looks wrong.`,
      ],
      specs: [['Checks', '10'], ['Levels', 'ok / warn / error'], ['Check row', '~52px'], ['Status icons', '17px lucide']],
    },
  },
  {
    art: shell({ path: '/settings', title: 'Settings', body: settingsBody, h: 1200 }),
    meta: {
      name: 'Settings &amp; Privacy', route: '/settings', height: 1200,
      purpose: `Appearance, security, data and vaults — with the privacy contract stated as a panel
        rather than buried in a policy document.`,
      notes: [
        `<b>Every row states its consequence.</b> “Re-encrypts the vault key. Data is never
         re-written.” A settings row that only names itself makes the user guess.`,
        `<b>Destructive actions use the danger variant</b> — outlined, not filled. A filled red
         button next to a filled green one is a mis-click waiting to happen.`,
        `<b>The privacy panel is a feature surface.</b> It is the product's core claim, so it gets
         card weight on the screen where a user goes looking for it.`,
      ],
      specs: [['Toggle', '38 × 22, 999px'], ['Setting row', '~62px'], ['Danger button', 'outlined, danger tint'], ['Accent swatch', '24px, ring when active']],
    },
  },
  {
    art: shell({ path: '/help', title: 'Help', body: helpBody, h: 1200 }),
    meta: {
      name: 'Help', route: '/help', height: 1200,
      purpose: `How the product works and what it deliberately does not do — the four mechanisms a
        user has to trust, and an explicit list of the absences.`,
      notes: [
        `<b>Mechanism, not FAQ.</b> Four explanations of how the thing actually works beat twenty
         questions nobody asked.`,
        `<b>“Deliberately absent” is a list.</b> Naming what the product will not do is what stops
         each absence being read as an unfinished feature.`,
      ],
      specs: [['Explainer row', '~104px'], ['Icon plate', '40px, accent wash'], ['Keycap', '6px radius, fill-strong'], ['Tour', '13 pages']],
    },
  },
];
