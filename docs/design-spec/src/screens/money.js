/** Money group — /accounts, /transactions, /calendar, /reconcile, /budget, /recurring, /goals. */
import * as D from '../data.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import { icon } from '../icons.js';
import { shell } from '../chrome.js';
import { cal } from '../doc.js';

const CAT_ICON = {
  Food: 'coins', Transport: 'car', Rent: 'home', Utilities: 'building-2', Shopping: 'receipt',
  Health: 'heart-pulse', Entertainment: 'sparkles', EMI: 'landmark', Salary: 'wallet',
  Investment: 'trending-up', Other: 'file-text',
};

// ----------------------------------------------------------------- /accounts
const accountsBody = `
  ${K.pageIntro('Accounts', 'Where the money is held, from the chart of accounts',
    K.button('Transfer', 'secondary', { icon: icon('repeat', 15) }) + K.button('Add account', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Liquid balance', value: D.money0(D.CASH), sub: 'bank and cash' },
    { label: 'Accounts', value: String(D.ACCOUNTS.length), sub: 'all asset · bank' },
    { label: 'Liabilities', value: D.money0(D.DEBT), sub: `${D.LIABILITIES.length} accounts`, accent: 'var(--danger)' },
    { label: 'Net position', value: D.money0(D.CASH - D.DEBT), sub: 'cash less debt' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    <div style="flex:1.5;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${D.ACCOUNTS.map((a, i) => K.card(`
        <div style="display:flex;align-items:center;gap:14px">
          ${K.avatar(a.name.slice(0, 2).toUpperCase(), { size: 42, tone: 'var(--accent-soft)', color: 'var(--accent)' })}
          <div style="min-width:0;flex:1">
            <div style="font-size:14px;font-weight:600;color:var(--ink)">${a.name}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Asset · Bank · opened with ${D.money0(a.opening)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:21px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums">${D.money0(a.balance)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${a.id === 'emergency' ? 'linked to a goal' : 'available'}</div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--line);display:flex;gap:8px">
          ${K.button('Transactions', 'ghost')}${K.button('Reconcile', 'ghost')}${K.button('Transfer out', 'ghost')}
        </div>`, { cal: i === 0 ? cal(2, 'tl') : '' })).join('')}
    </div>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Balance mix')}
        <div style="display:flex;align-items:center;gap:16px">
          ${C.donut({ segments: D.ACCOUNTS.map((a, i) => ({ label: a.name, value: a.balance, color: `var(--c${i + 1})`, right: D.compact(a.balance) })), size: 128, thickness: 18, center: D.compact(D.CASH) })}
          ${C.legend(D.ACCOUNTS.map((a, i) => ({ label: a.name, color: `var(--c${i + 1})`, right: `${((a.balance / D.CASH) * 100).toFixed(0)}%` })))}
        </div>`)}

      ${K.card(`${K.sectionHeader('Recent transfers')}
        ${K.list([89, 59, 29].flatMap((d) => [
          [150000, 'HDFC Salary', 'ICICI Spends', 'Monthly spending float', d],
          [25000, 'HDFC Salary', 'Emergency Fund', 'Emergency fund top-up', d],
        ]).slice(0, 4).map(([amt, from, to, note, d]) => `
          <span style="color:var(--violet);flex:none">${icon('repeat', 17)}</span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${from} → ${to}</span>
            <span style="display:block;font-size:11px;color:var(--muted)">${note} · ${D.dm(D.daysAgo(d))}</span>
          </span>
          <span style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(amt)}</span>`))}
        <p style="margin:13px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
          A transfer is neither income nor expense. Budgets and Reports are blind to these rows by design.</p>`,
        { cal: cal(3, 'tl') })}
    </div>
  </div>`;

// ------------------------------------------------------------- /transactions
const days = [...new Set(D.LEDGER.filter((r) => r.d <= 12).map((r) => r.d))].sort((a, b) => a - b);
const transactionsBody = `
  ${K.pageIntro('Transactions', 'One timeline over spending, income and transfers',
    K.button('Import', 'secondary', { icon: icon('upload', 15) }) + K.button('Add transaction', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'This month in', value: D.money0(D.MONTH_INCOME), accent: 'var(--success)' },
    { label: 'This month out', value: D.money0(D.MONTH_EXPENSE), accent: 'var(--danger)' },
    { label: 'Net', value: D.money0(D.MONTH_INCOME - D.MONTH_EXPENSE) },
    { label: 'Transactions', value: String(D.LEDGER.filter((r) => r.d <= 30).length), sub: 'last 30 days' },
  ])}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        ${K.input(`<span style="color:var(--muted)">${icon('search', 15)}</span>Search merchant, note or amount…`, { placeholder: true, w: '320px' })}
        ${K.segmented(['All', 'Expense', 'Income', 'Transfer'], 0)}
        <span style="margin-left:auto;color:var(--muted);display:flex;align-items:center;gap:7px;font-size:12px">${icon('calendar-days', 14)} August 2026</span>
      </div>
      ${days.slice(0, 7).map((d) => {
        const rows = D.LEDGER.filter((r) => r.d === d);
        const net = rows.reduce((a, r) => a + (r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0), 0);
        return `
        <div style="display:flex;align-items:baseline;gap:10px;padding:12px 0 7px;border-top:1px solid var(--line)">
          <span style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">
            ${d === 0 ? 'Today' : d === 1 ? 'Yesterday' : D.dmy(D.daysAgo(d))}</span>
          <span style="margin-left:auto;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--${net >= 0 ? 'success' : 'ink-soft'})">${D.signed(net, D.money0)}</span>
        </div>
        ${rows.map((r) => `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0">
            ${K.avatar(icon(r.type === 'transfer' ? 'repeat' : CAT_ICON[r.category] ?? 'file-text', 16), {
              size: 34,
              tone: r.type === 'income' ? 'var(--success-soft)' : r.type === 'transfer' ? 'var(--violet-soft)' : 'var(--fill)',
              color: r.type === 'income' ? 'var(--success)' : r.type === 'transfer' ? 'var(--violet)' : 'var(--ink-soft)',
            })}
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.merchant ?? `${r.from} → ${r.to}`}</span>
              <span style="display:block;font-size:11px;color:var(--muted)">${r.type === 'transfer' ? r.note : r.category + ' · ICICI Spends'}</span>
            </span>
            ${r.type === 'transfer' ? K.chip('Transfer', 'violet') : ''}
            <span style="font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--${r.type === 'income' ? 'success' : 'ink'})">
              ${r.type === 'income' ? '+' : r.type === 'expense' ? '−' : ''}${D.money0(r.amount)}</span>
          </div>`).join('')}`;
      }).join('')}`, { style: 'flex:2;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Budget strip')}
        ${D.BUDGETS.map((b) => `
          <div style="padding:7px 0">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:5px">
              <span style="font-size:12px;color:var(--ink-soft)">${b.category}</span>
              <span style="margin-left:auto;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(b.spent)} <span style="color:var(--muted);font-weight:400">/ ${D.money0(b.limit)}</span></span>
            </div>
            ${K.progress(b.fraction, { height: 6 })}
          </div>`).join('')}`, { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('Review queue')}
        ${K.banner('3 captured drafts need a category', 'Parsed from bank SMS on this device. Nothing is written to the ledger until you confirm it.', 'accent', { icon: icon('sparkles', 15) })}
        <div style="margin-top:12px">${K.button('Open capture inbox', 'secondary', { full: true })}</div>`,
        { cal: cal(3, 'tl') })}

      ${K.card(`${K.sectionHeader('Spending by category')}
        ${C.hbars({ rows: D.BUDGETS.map((b, i) => ({ label: b.category, value: b.spent, right: D.money0(b.spent), color: `var(--c${i + 1})` })) })}`)}
    </div>
  </div>`;

// ----------------------------------------------------------------- /calendar
const monthGrid = (() => {
  // August 2026 starts on a Saturday; the grid is Monday-first.
  const cells = [];
  for (let i = 0; i < 5; i++) cells.push(null);
  for (let day = 1; day <= 31; day++) {
    const d = 9 - day;
    const rows = D.LEDGER.filter((r) => r.d === d);
    cells.push({
      day,
      income: rows.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0),
      expense: rows.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0),
      future: day > 9,
      today: day === 9,
    });
  }
  return cells;
})();

const calendarBody = `
  ${K.pageIntro('Calendar', 'Day by day — what came in, what went out',
    `<span style="display:flex;align-items:center;gap:10px">
      <span style="color:var(--ink-soft)">${icon('chevron-left', 18)}</span>
      <span style="font-size:14px;font-weight:600;min-width:130px;text-align:center">August 2026</span>
      <span style="color:var(--ink-soft)">${icon('chevron-right', 18)}</span></span>` + K.button('Today', 'secondary'))}

  <div style="display:flex;gap:16px">
    ${K.card(`
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:8px">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div style="font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);text-align:center;padding-bottom:4px">${d}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">
        ${monthGrid.map((c) => {
          if (!c) return '<div></div>';
          const has = c.income > 0 || c.expense > 0;
          return `<div style="height:96px;border-radius:10px;padding:8px;border:1px solid ${c.today ? 'var(--accent)' : 'var(--line)'};
            background:${c.today ? 'var(--accent-soft)' : has ? 'var(--card-2)' : 'transparent'};${c.future ? 'opacity:.42;' : ''}">
            <div style="font-size:11.5px;font-weight:${c.today ? 700 : 500};color:var(--${c.today ? 'accent' : 'ink-soft'})">${c.day}</div>
            ${c.income > 0 ? `<div style="margin-top:5px;font-size:10.5px;font-weight:600;color:var(--success);font-variant-numeric:tabular-nums">+${D.compact(c.income)}</div>` : ''}
            ${c.expense > 0 ? `<div style="margin-top:2px;font-size:10.5px;font-weight:600;color:var(--danger);font-variant-numeric:tabular-nums">−${D.compact(c.expense)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`, { style: 'flex:2.1;min-width:0', cal: cal(1, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Sunday, 9 August')}
        ${K.list(D.LEDGER.filter((r) => r.d === 0).map((r) => `
          ${K.avatar(icon(CAT_ICON[r.category] ?? 'file-text', 15), { size: 32 })}
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${r.merchant}</span>
            <span style="display:block;font-size:11px;color:var(--muted)">${r.category}</span></span>
          <span style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">−${D.money0(r.amount)}</span>`))}
        <div style="margin-top:12px">${K.button('Add for this day', 'secondary', { full: true, icon: icon('plus', 15) })}</div>`,
        { cal: cal(2, 'tl') })}

      ${K.card(`${K.sectionHeader('This month')}
        ${K.kv([
          ['Income', `<span style="color:var(--success)">${D.money0(D.MONTH_INCOME)}</span>`],
          ['Spending', `<span style="color:var(--danger)">${D.money0(D.MONTH_EXPENSE)}</span>`],
          ['Net', D.money0(D.MONTH_INCOME - D.MONTH_EXPENSE)],
          ['Busiest day', '2 Aug · 4 entries'],
          ['Days with activity', '11 of 31'],
        ])}`)}

      ${K.card(`${K.sectionHeader('Budgets')}
        ${D.BUDGETS.slice(0, 3).map((b) => `
          <div style="padding:6px 0">
            <div style="display:flex;font-size:11.5px;margin-bottom:4px"><span style="color:var(--ink-soft)">${b.category}</span>
            <span style="margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums">${(b.fraction * 100).toFixed(0)}%</span></div>
            ${K.progress(b.fraction, { height: 5 })}
          </div>`).join('')}`)}
    </div>
  </div>`;

// ---------------------------------------------------------------- /reconcile
const clearedRows = D.LEDGER.filter((r) => r.d <= 30 && r.type !== 'transfer').slice(0, 9);
const reconcileBody = `
  ${K.pageIntro('Reconcile', 'Tick the book against a bank statement',
    K.select('ICICI Spends', { w: '190px' }) + K.button('Finish', 'primary', { icon: icon('check', 15) }))}

  ${K.statStrip([
    { label: 'Opening balance', value: D.money0(42000), sub: '1 Aug 2026' },
    { label: 'Cleared balance', value: D.money0(118420), sub: '9 entries ticked' },
    { label: 'Book balance', value: D.money0(132891), sub: 'all entries' },
    { label: 'Difference', value: D.money0(14471), sub: 'statement less cleared', accent: 'var(--warning)' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Entries', `<span style="font-size:12px;color:var(--muted)">9 cleared · 8 outstanding</span>`)}
      ${K.table({
        head: ['', 'Date', 'Merchant', 'Category', 'Amount', 'Status'],
        align: ['c', 'l', 'l', 'l', 'r', 'l'],
        w: ['4%', '12%'],
        rows: clearedRows.map((r, i) => [
          i < 5
            ? `<span style="display:inline-grid;place-items:center;width:17px;height:17px;border-radius:5px;background:var(--accent);color:var(--primary-fg)">${icon('check', 12, { stroke: 3 })}</span>`
            : `<span style="display:inline-block;width:17px;height:17px;border-radius:5px;border:1px solid var(--line-strong)"></span>`,
          D.dm(D.daysAgo(r.d)),
          `<b style="color:var(--ink);font-weight:600">${r.merchant}</b>`,
          r.category,
          `<span style="color:var(--${r.type === 'income' ? 'success' : 'ink'})">${r.type === 'income' ? '+' : '−'}${D.money0(r.amount)}</span>`,
          i < 5 ? K.chip('Cleared', 'success') : K.chip('Outstanding', 'neutral'),
        ]),
      })}`, { style: 'flex:2;min-width:0', cal: cal(2, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Statement')}
        ${K.field('Closing balance on the statement', K.input('₹1,32,891.00', { focus: true }))}
        <div style="margin-top:14px">${K.field('Statement date', K.input('09 Aug 2026'))}</div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
          ${K.kv([['Cleared', D.money0(118420)], ['Statement', D.money0(132891)], ['<b style="color:var(--ink)">Difference</b>', `<b style="color:var(--warning)">${D.money0(14471)}</b>`]])}
        </div>`, { cal: cal(3, 'tl') })}

      ${K.card(`${K.sectionHeader('This would explain the difference')}
        ${K.list([
          ['Amazon India', 'Shopping · 6 Aug', 8460],
          ['Myntra', 'Shopping · 22 Jul', 6300],
        ].map(([m, s, a]) => `
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${m}</span>
            <span style="display:block;font-size:11px;color:var(--muted)">${s}</span></span>
          <span style="font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">${D.money0(a)}</span>
          ${K.chip('Tick', 'accent')}`))}
        <p style="margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
          Each entry listed here would close the gap on its own. The app names candidates; it never
          ticks anything for you.</p>`, { cal: cal(4, 'tl') })}
    </div>
  </div>`;

// ------------------------------------------------------------------- /budget
const budgetBody = `
  ${K.pageIntro('Budget', `${D.DAYS_LEFT} days left in August`,
    K.button('50 / 30 / 20 quick start', 'secondary') + K.button('New budget', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Budgeted', value: D.money0(D.SAFE_TO_SPEND.limit), sub: `${D.BUDGETS.length} categories` },
    { label: 'Spent', value: D.money0(D.SAFE_TO_SPEND.spent), sub: `${((D.SAFE_TO_SPEND.spent / D.SAFE_TO_SPEND.limit) * 100).toFixed(0)}% of envelope` },
    { label: 'Remaining', value: D.money0(D.SAFE_TO_SPEND.remaining), accent: 'var(--success)' },
    { label: 'Safe to spend', value: D.money0(D.SAFE_TO_SPEND.perDay), sub: 'per day' },
    { label: 'Over budget', value: String(D.BUDGETS.filter((b) => b.status === 'over').length), sub: 'category', accent: 'var(--danger)' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    <div style="flex:1.6;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${D.BUDGETS.map((b, i) => K.card(`
        <div style="display:flex;align-items:center;gap:13px;margin-bottom:12px">
          ${K.avatar(icon(CAT_ICON[b.category], 16), { size: 36 })}
          <div style="min-width:0">
            <div style="font-size:13.5px;font-weight:600;color:var(--ink)">${b.category}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px">Monthly · alerts at 90%</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">${D.money0(b.spent)}
              <span style="font-size:12px;font-weight:400;color:var(--muted)">of ${D.money0(b.limit)}</span></div>
            <div style="font-size:11px;margin-top:2px;color:var(--${b.status === 'over' ? 'danger' : b.status === 'warning' ? 'warning' : 'muted'})">
              ${b.limit - b.spent >= 0 ? `${D.money0(b.limit - b.spent)} left` : `${D.money0(b.spent - b.limit)} over`}</div>
          </div>
        </div>
        ${K.progress(b.fraction)}`, { cal: i === 0 ? cal(2, 'tl') : '' })).join('')}
    </div>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Envelope')}
        <div style="display:flex;align-items:center;gap:16px">
          ${C.donut({ segments: D.BUDGETS.map((b, i) => ({ label: b.category, value: b.spent, color: `var(--c${i + 1})`, right: D.money0(b.spent) })), size: 138, thickness: 19, center: `${((D.SAFE_TO_SPEND.spent / D.SAFE_TO_SPEND.limit) * 100).toFixed(0)}%`, sub: 'of envelope' })}
          ${C.legend(D.BUDGETS.map((b, i) => ({ label: b.category, color: `var(--c${i + 1})`, right: `${(b.fraction * 100).toFixed(0)}%` })))}
        </div>`, { cal: cal(3, 'tl') })}

      ${K.card(`${K.sectionHeader('Zones')}
        ${[['Under 70%', 'On track', 'var(--success)'], ['70 – 90%', 'Watch', 'var(--warning)'], ['Over 90%', 'At the limit', 'var(--danger)']].map(([r, l, c]) => `
          <div style="display:flex;align-items:center;gap:11px;padding:7px 0">
            <span style="width:26px;height:9px;border-radius:999px;background:${c};flex:none"></span>
            <span style="font-size:12.5px;font-weight:600;color:var(--ink)">${r}</span>
            <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">${l}</span>
          </div>`).join('')}
        <p style="margin:11px 0 0;font-size:11px;color:var(--muted);line-height:1.5">
          Zone colour is derived from the fraction, not stored on the budget — one rule, applied
          everywhere a progress bar appears.</p>`, { cal: cal(4, 'tl') })}

      ${K.card(`${K.sectionHeader('50 / 30 / 20')}
        <p style="margin:0 0 12px;font-size:12px;color:var(--ink-soft);line-height:1.6">
          Seed five envelopes from ${D.money0(D.MONTH_INCOME)} monthly income: needs, wants and savings.</p>
        ${K.button('Set up envelopes', 'secondary', { full: true })}`)}
    </div>
  </div>`;

// ---------------------------------------------------------------- /recurring
const recurringBody = `
  ${K.pageIntro('Recurring', 'Bills, subscriptions and income that repeat',
    K.button('New rule', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Monthly out', value: D.money0(D.RECURRING.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0)), sub: '4 rules', accent: 'var(--danger)' },
    { label: 'Monthly in', value: D.money0(285000), sub: '1 rule', accent: 'var(--success)' },
    { label: 'Net monthly', value: D.money0(285000 - D.RECURRING.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0)) },
    { label: 'Next due', value: 'in 3 days', sub: 'HDFC Home Loan' },
    { label: 'Annualised', value: D.compact(D.RECURRING.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0) * 12), sub: 'committed spend' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:flex;gap:16px;margin-top:16px">
    ${K.card(`${K.sectionHeader('Rules', K.segmented(['All', 'Expense', 'Income'], 0))}
      ${K.table({
        head: ['Rule', 'Category', 'Frequency', 'Amount', 'Next run', 'Status', ''],
        align: ['l', 'l', 'l', 'r', 'r', 'l', 'r'],
        w: ['26%'],
        rows: D.RECURRING.map((r) => [
          `<span style="display:flex;align-items:center;gap:10px">
            ${K.avatar(icon(CAT_ICON[r.category] ?? 'repeat', 15), { size: 30, tone: r.type === 'income' ? 'var(--success-soft)' : 'var(--fill)', color: r.type === 'income' ? 'var(--success)' : 'var(--ink-soft)' })}
            <b style="color:var(--ink);font-weight:600">${r.merchant}</b></span>`,
          r.category, 'Monthly',
          `<span style="color:var(--${r.type === 'income' ? 'success' : 'ink'})">${r.type === 'income' ? '+' : '−'}${D.money0(r.amount)}</span>`,
          `${D.dm(D.daysAhead(r.inDays))} · in ${r.inDays}d`,
          K.chip('Active', 'success'),
          `<span style="display:flex;gap:8px;justify-content:flex-end;color:var(--muted)">${icon('pencil', 14)}${icon('trash-2', 14)}</span>`,
        ]),
      })}`, { style: 'flex:2;min-width:0', cal: cal(2, 'tl') })}

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
      ${K.card(`${K.sectionHeader('Next 30 days')}
        ${K.list(D.RECURRING.slice().sort((a, b) => a.inDays - b.inDays).map((r) => `
          <span style="flex:none;width:44px;text-align:center">
            <span style="display:block;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1">${D.daysAhead(r.inDays).getDate()}</span>
            <span style="display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">${D.daysAhead(r.inDays).toLocaleString('en-GB', { month: 'short' })}</span>
          </span>
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:12.5px;font-weight:600">${r.merchant}</span>
            <span style="display:block;font-size:11px;color:var(--muted)">${r.category}</span></span>
          <span style="font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--${r.type === 'income' ? 'success' : 'ink'})">
            ${r.type === 'income' ? '+' : '−'}${D.money0(r.amount)}</span>`))}`, { cal: cal(3, 'tl') })}

      ${K.card(`${K.sectionHeader('Committed vs discretionary')}
        <div style="display:flex;align-items:center;gap:16px">
          ${C.donut({
            segments: [
              { label: 'Committed', value: 127779, color: 'var(--c6)', right: '80%' },
              { label: 'Discretionary', value: D.SAFE_TO_SPEND.spent, color: 'var(--c1)', right: '20%' },
            ], size: 122, thickness: 17, center: '80%', sub: 'committed',
          })}
          ${C.legend([
            { label: 'Committed', color: 'var(--c6)', right: D.money0(127779) },
            { label: 'Discretionary', color: 'var(--c1)', right: D.money0(D.SAFE_TO_SPEND.spent) },
          ])}
        </div>`)}
    </div>
  </div>`;

// -------------------------------------------------------------------- /goals
const GOAL_ICON = { custom: 'piggy-bank', house: 'home', emergency_fund: 'life-buoy', education: 'graduation-cap', vacation: 'plane' };
const goalsBody = `
  ${K.pageIntro('Goals', 'What you are saving towards, and whether the pace gets you there',
    K.button('New goal', 'primary', { icon: icon('plus', 15) }))}

  ${K.statStrip([
    { label: 'Goals', value: String(D.GOALS.length) },
    { label: 'Target total', value: D.compact(D.GOALS.reduce((a, g) => a + g.target, 0)) },
    { label: 'Saved', value: D.compact(D.GOALS.reduce((a, g) => a + g.current, 0)), accent: 'var(--success)' },
    { label: 'Overall progress', value: `${((D.GOALS.reduce((a, g) => a + g.current, 0) / D.GOALS.reduce((a, g) => a + g.target, 0)) * 100).toFixed(1)}%` },
    { label: 'Nearest deadline', value: 'Kyoto, spring', sub: 'in 240 days' },
  ], { cal: cal(1, 'tl') })}

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px">
    ${D.GOALS.map((g, i) => {
      const f = g.current / g.target;
      const monthsLeft = g.inDays ? Math.round(g.inDays / 30.44) : null;
      return K.card(`
        <div style="display:flex;align-items:center;gap:16px">
          ${C.ring({ fraction: f, size: 92, stroke: 10, center: `${(f * 100).toFixed(0)}%` })}
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--accent)">${icon(GOAL_ICON[g.type], 15)}</span>
              <span style="font-size:14px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.name}</span>
            </div>
            <div style="margin-top:8px;font-size:18px;font-weight:700;letter-spacing:-0.03em;font-variant-numeric:tabular-nums">${D.compact(g.current)}</div>
            <div style="font-size:11.5px;color:var(--muted)">of ${D.compact(g.target)}</div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--line)">
          ${K.kv([
            g.linked ? ['Linked account', g.linked] : ['Target date', D.dmy(D.daysAhead(g.inDays))],
            g.linked ? ['Progress source', 'account balance'] : ['Required each month', D.money0((g.target - g.current) / Math.max(1, monthsLeft))],
          ])}
        </div>`, { cal: i === 0 ? cal(2, 'tl') : i === 2 ? cal(3, 'tl') : '' });
    }).join('')}
  </div>

  ${K.card(`${K.sectionHeader('Contribution pace')}
    ${C.hbars({ rows: D.GOALS.map((g, i) => ({
      label: g.name, value: g.current / g.target,
      right: `${((g.current / g.target) * 100).toFixed(1)}%`, color: `var(--c${i + 1})`,
    })) })}`, { style: 'margin-top:16px' })}`;

export default [
  {
    art: shell({ path: '/accounts', title: 'Accounts', body: accountsBody, h: 1200 }),
    meta: {
      name: 'Accounts', route: '/accounts', height: 1200,
      purpose: `Where money is held. Balances come from double-entry postings, not from summing
        transactions — which is what lets a transfer move value without inventing income.`,
      notes: [
        `<b>Balance is derived.</b> Opening balance plus postings. If the postings were ever missing,
         every account here would read as its opening balance — the Diagnostics screen checks for
         exactly that.`,
        `<b>Account cards, not rows.</b> Three accounts fit as cards and each carries its own
         actions; the pattern degrades to a table past about eight.`,
        `<b>Transfers are violet.</b> Neither income green nor expense red, because a transfer is
         neither — and Budgets and Reports ignore them entirely.`,
      ],
      specs: [['Account avatar', '42px, 11px radius'], ['Balance type', '21px / 700'], ['Card actions', 'ghost buttons, 36px'], ['Transfer tone', 'var(--violet)']],
    },
  },
  {
    art: shell({ path: '/transactions', title: 'Transactions', body: transactionsBody, h: 1200 }),
    meta: {
      name: 'Transactions', route: '/transactions', height: 1200,
      purpose: `The ledger. One timeline over expenses, income and transfers, grouped by day with a
        running net per day, plus the budget strip and the capture queue alongside.`,
      notes: [
        `<b>Day headers carry the day's net.</b> Scanning a month is a sequence of daily nets; making
         the reader add rows to get there is the most common failure of a transaction list.`,
        `<b>Category avatars are tinted by type</b> — success wash for income, violet for transfers,
         neutral fill for spending — so the type is legible before the amount is read.`,
        `<b>Signs, not just colour.</b> A plus or a minus precedes every amount, because colour alone
         fails for a colourblind reader and in print.`,
      ],
      specs: [['Row height', '~50px'], ['Avatar', '34px, 11px radius'], ['Day header', '11px / 700 / 0.06em'], ['Amount type', '13.5px / 600, tabular']],
    },
  },
  {
    art: shell({ path: '/calendar', title: 'Calendar', body: calendarBody, h: 1200 }),
    meta: {
      name: 'Calendar', route: '/calendar', height: 1200,
      purpose: `The same ledger on a month grid. Useful for the question a list answers badly — when
        in the month does money actually leave.`,
      notes: [
        `<b>Cells carry both figures.</b> Income above expense, compact form, tabular. A single net
         number per day would hide a heavy day that happened to balance.`,
        `<b>Future days are dimmed to 42%</b>, not hidden — the shape of the month stays intact while
         nothing suggests data exists where it does not.`,
        `<b>Below 600px</b> the grid collapses to a single column and the day detail becomes a bottom
         sheet; the desktop layout keeps it as a persistent right-hand panel.`,
      ],
      specs: [['Cell', '96px h, 10px radius'], ['Grid gap', '6px'], ['Week start', 'Monday'], ['Today', 'accent border + wash'], ['Future opacity', '0.42']],
    },
  },
  {
    art: shell({ path: '/reconcile', title: 'Reconcile', body: reconcileBody, h: 1200 }),
    meta: {
      name: 'Reconcile', route: '/reconcile', height: 1200,
      purpose: `Tick entries against a bank statement until the cleared balance matches. The one
        workflow in the product that proves the book is true.`,
      notes: [
        `<b>Four figures, one relationship.</b> Opening, cleared, book, difference — laid out in the
         order the arithmetic runs, so the KPI strip reads as an equation.`,
        `<b>The difference is a warning, not an error.</b> An unreconciled account is normal;
         colouring it red would train the user to ignore red.`,
        `<b>Candidate explanations.</b> The app lists entries that would each close the gap alone.
         It names them and stops — ticking is always the user's action.`,
      ],
      specs: [['Checkbox', '17px, 5px radius'], ['Checked', 'accent fill, 3px stroke tick'], ['Status chips', 'success / neutral'], ['Difference tone', 'warning']],
    },
  },
  {
    art: shell({ path: '/budget', title: 'Budget', body: budgetBody, h: 1200 }),
    meta: {
      name: 'Budget', route: '/budget', height: 1200,
      purpose: `Monthly envelopes per category, with the zone colouring that drives every progress
        bar in the product and a 50/30/20 starting point for an empty vault.`,
      notes: [
        `<b>One zone rule.</b> Under 70% success, 70–90% warning, over 90% danger — computed from
         the fraction, never stored, so a bar in the transactions rail and a bar here can never
         disagree.`,
        `<b>Envelope donut.</b> Spend by category against the total budgeted, so the two readings —
         per-category and overall — sit on one screen.`,
        `<b>Over-budget is stated in rupees</b> as well as by colour: “₹X over”, not just a red bar.`,
      ],
      specs: [['Bar height', '7px'], ['Bar radius', '999px'], ['Zone breaks', '70% · 90%'], ['Alert default', '90%'], ['Period', 'monthly']],
    },
  },
  {
    art: shell({ path: '/recurring', title: 'Recurring', body: recurringBody, h: 1200 }),
    meta: {
      name: 'Recurring', route: '/recurring', height: 1200,
      purpose: `Rules that repeat — rent, EMI, subscriptions, salary — with what each costs annually
        and what falls due next.`,
      notes: [
        `<b>Annualised committed spend</b> is the figure this screen exists to surface. A ₹649
         subscription is invisible monthly and ₹7,788 a year.`,
        `<b>Date blocks, not date strings</b>, in the upcoming list: number over month, tabular, so
         the column scans as a calendar.`,
        `<b>Committed vs discretionary</b> reframes the same money as a ratio — the reading that
         actually changes behaviour.`,
      ],
      specs: [['Frequencies', 'daily · weekly · monthly · yearly'], ['Date block', '44px wide'], ['Next-run format', 'dd Mon · in Nd']],
    },
  },
  {
    art: shell({ path: '/goals', title: 'Goals', body: goalsBody, h: 1200 }),
    meta: {
      name: 'Goals', route: '/goals', height: 1200,
      purpose: `Savings targets with progress rings, deadlines and the monthly contribution each one
        implies. A goal can be linked to an account, in which case its progress is that balance.`,
      notes: [
        `<b>Ring, not bar.</b> A goal is one number against one target with no zones — the ring reads
         as a single completion, and it distinguishes goals from budgets at a glance.`,
        `<b>Linked goals show their source.</b> “Progress source: account balance” rather than a
         number that silently cannot be edited.`,
        `<b>Required each month</b> is computed from the gap and the months remaining. It is a
         calculation, not a recommendation — the phrasing avoids the advice register deliberately.`,
      ],
      specs: [['Ring size', '92px'], ['Ring stroke', '10px'], ['Track', 'var(--fill-strong)'], ['Cap', 'round'], ['Grid', '3-up, 16px gap']],
    },
  },
];
