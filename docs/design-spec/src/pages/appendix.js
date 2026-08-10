/** Part F — the demo vault as reference data, and the contracts around it. */
import * as D from '../data.js';
import { page, divider } from '../doc.js';

const holdingsPage = page({
  part: 'Part F · Appendix', title: 'The demo vault — holdings', sub: `${D.PORTFOLIO.count} positions`, meta: 'lib/sampleData.ts',
  body: `
  <div style="display:flex;gap:34px;height:100%">
    <div style="flex:2.4;min-width:0">
      <table class="tbl">
        <thead><tr>
          <th>Symbol</th><th>Name</th><th>Type</th><th>Sector</th>
          <th class="num">Qty</th><th class="num">Avg cost</th><th class="num">Last</th>
          <th class="num">Invested</th><th class="num">Value</th><th class="num">P&amp;L</th><th class="num">Return</th>
        </tr></thead>
        <tbody>
          ${D.byValue.map((h) => `<tr>
            <td><b>${h.symbol}</b></td>
            <td>${h.name}</td>
            <td>${h.typeLabel}</td>
            <td style="color:${h.sector === 'Unclassified' ? '#A7B1AC' : '#53625B'}">${h.sector}</td>
            <td class="num">${D.qty(h.qty)}</td>
            <td class="num">${D.money0(h.avg)}</td>
            <td class="num">${D.money0(h.last)}</td>
            <td class="num">${D.money0(h.invested)}</td>
            <td class="num"><b>${D.money0(h.current)}</b></td>
            <td class="num" style="color:${h.pnl >= 0 ? '#087A56' : '#C73D46'}">${D.signed(h.pnl, D.money0)}</td>
            <td class="num" style="color:${h.pnl >= 0 ? '#087A56' : '#C73D46'}">${D.pct(h.pnlPct)}</td>
          </tr>`).join('')}
          <tr style="border-top:2px solid #DCE4DF">
            <td colspan="7"><b>Total</b></td>
            <td class="num"><b>${D.money0(D.PORTFOLIO.invested)}</b></td>
            <td class="num"><b>${D.money0(D.PORTFOLIO.current)}</b></td>
            <td class="num"><b style="color:#087A56">${D.signed(D.PORTFOLIO.pnl, D.money0)}</b></td>
            <td class="num"><b style="color:#087A56">${D.pct(D.PORTFOLIO.pnlPct)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:32px">
      <div class="note-h" style="margin-top:0">Roll-ups must reconcile</div>
      <p class="note-p">
        A roll-up along <b>any</b> dimension — asset group, sector, industry, market cap, currency —
        must sum exactly to the portfolio total. It is the invariant that makes every allocation
        chart in the product trustworthy.</p>
      <table class="kv">
        ${D.rollup('group').map((g) => `<tr><td>${g.label}</td><td>${D.money0(g.current)}</td></tr>`).join('')}
        <tr><td><b>Sum</b></td><td><b>${D.money0(D.rollup('group').reduce((a, g) => a + g.current, 0))}</b></td></tr>
        <tr><td><b>Portfolio</b></td><td><b>${D.money0(D.PORTFOLIO.current)}</b></td></tr>
      </table>

      <div class="note-h">Coverage by design</div>
      <p class="note-p">
        The demo vault is not a random sample. Every equity symbol exists in
        <code>public/instrument_master.json</code>, or every sector and market-cap roll-up would
        render “Unclassified” and the allocation screens would look broken. The four non-equity
        sleeves exist so the asset-group donut has more than one arc, and three positions are
        deliberately underwater so the loss states are exercised.</p>

      <table class="kv">
        <tr><td>Positions</td><td>${D.PORTFOLIO.count}</td></tr>
        <tr><td>In profit</td><td>${D.HOLDINGS.filter((h) => h.pnl > 0).length}</td></tr>
        <tr><td>At a loss</td><td>${D.HOLDINGS.filter((h) => h.pnl < 0).length}</td></tr>
        <tr><td>Sectors</td><td>${D.rollup('sector').length}</td></tr>
        <tr><td>Asset groups</td><td>${D.rollup('group').length} of 7</td></tr>
        <tr><td>Unclassified</td><td>4 (ETFs and NPS)</td></tr>
        <tr><td>Currencies</td><td>INR only</td></tr>
      </table>
    </div>
  </div>`,
});

const ledgerPage = page({
  part: 'Part F · Appendix', title: 'The demo vault — money', sub: 'Accounts, budgets, goals, cover, debt', meta: 'lib/sampleData.ts',
  body: `
  <div class="grid g3" style="gap:26px;height:100%;align-items:start">
    <div>
      <div class="note-h" style="margin-top:0">Accounts</div>
      <table class="tbl">
        <thead><tr><th>Account</th><th class="num">Opening</th><th class="num">Balance</th></tr></thead>
        <tbody>${D.ACCOUNTS.map((a) => `<tr><td><b>${a.name}</b><br><span style="font-size:10px;color:#A7B1AC">asset · bank</span></td>
          <td class="num">${D.money0(a.opening)}</td><td class="num"><b>${D.money0(a.balance)}</b></td></tr>`).join('')}
          <tr><td><b>Liquid total</b></td><td class="num"></td><td class="num"><b>${D.money0(D.CASH)}</b></td></tr>
        </tbody>
      </table>

      <div class="note-h">Liabilities</div>
      <table class="tbl">
        <thead><tr><th>Account</th><th class="num">APR</th><th class="num">Outstanding</th></tr></thead>
        <tbody>${D.LIABILITIES.map((l) => `<tr><td><b>${l.name}</b><br><span style="font-size:10px;color:#A7B1AC">${l.kind.replace('_', ' ')}${l.term ? ` · ${l.term} mo` : ` · limit ${D.money0(l.limit)}`}</span></td>
          <td class="num">${l.apr}%</td><td class="num"><b>${D.money0(l.principal)}</b></td></tr>`).join('')}
          <tr><td><b>Total</b></td><td class="num"></td><td class="num"><b>${D.money0(D.DEBT)}</b></td></tr>
        </tbody>
      </table>

      <div class="note-h">Net worth</div>
      <table class="kv">
        <tr><td>Cash</td><td>${D.money0(D.CASH)}</td></tr>
        <tr><td>Investments</td><td>${D.money0(D.PORTFOLIO.current)}</td></tr>
        <tr><td>Liabilities</td><td>−${D.money0(D.DEBT)}</td></tr>
        <tr><td><b>Net worth</b></td><td><b>${D.money0(D.NET_WORTH)}</b></td></tr>
      </table>
    </div>

    <div>
      <div class="note-h" style="margin-top:0">Budgets — this month</div>
      <table class="tbl">
        <thead><tr><th>Category</th><th class="num">Limit</th><th class="num">Spent</th><th class="num">Used</th></tr></thead>
        <tbody>${D.BUDGETS.map((b) => `<tr><td><b>${b.category}</b></td><td class="num">${D.money0(b.limit)}</td>
          <td class="num">${D.money0(b.spent)}</td>
          <td class="num"><span class="tag ${b.status === 'over' ? 'bad' : b.status === 'warning' ? 'warn' : 'ok'}">${(b.fraction * 100).toFixed(0)}%</span></td></tr>`).join('')}
          <tr><td><b>Envelope</b></td><td class="num"><b>${D.money0(D.SAFE_TO_SPEND.limit)}</b></td>
            <td class="num"><b>${D.money0(D.SAFE_TO_SPEND.spent)}</b></td><td class="num"></td></tr>
        </tbody>
      </table>

      <div class="note-h">Goals</div>
      <table class="tbl">
        <thead><tr><th>Goal</th><th class="num">Target</th><th class="num">Saved</th><th class="num">%</th></tr></thead>
        <tbody>${D.GOALS.map((g) => `<tr><td><b>${g.name}</b><br><span style="font-size:10px;color:#A7B1AC">${g.linked ? `linked · ${g.linked}` : `due ${D.dmy(D.daysAhead(g.inDays))}`}</span></td>
          <td class="num">${D.compact(g.target)}</td><td class="num">${D.compact(g.current)}</td>
          <td class="num">${((g.current / g.target) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
      </table>

      <div class="note-h">Insurance</div>
      <table class="tbl">
        <thead><tr><th>Policy</th><th class="num">Cover</th><th class="num">Premium</th><th class="num">Renews</th></tr></thead>
        <tbody>${D.INSURANCE.map((p) => `<tr><td><b>${p.name}</b><br><span style="font-size:10px;color:#A7B1AC">${p.provider}</span></td>
          <td class="num">${D.compact(p.cover)}</td><td class="num">${D.money0(p.premium)}</td>
          <td class="num">${p.renewIn}d</td></tr>`).join('')}</tbody>
      </table>
    </div>

    <div>
      <div class="note-h" style="margin-top:0">Monthly cash flow</div>
      <table class="tbl">
        <thead><tr><th>Item</th><th>Category</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr><td><b>Aurelius Systems</b></td><td>Salary</td><td class="num" style="color:#087A56">+${D.money0(D.SALARY)}</td></tr>
          ${D.FIXED.map(([a, c, m]) => `<tr><td><b>${m}</b></td><td>${c}</td><td class="num">−${D.money0(a)}</td></tr>`).join('')}
          <tr><td><b>Zerodha — SIP</b></td><td>Investment</td><td class="num">−${D.money0(D.SIP[0])}</td></tr>
          <tr><td colspan="2"><b>Fixed outgo</b></td><td class="num"><b>−${D.money0(D.FIXED.reduce((a, f) => a + f[0], 0) + D.SIP[0])}</b></td></tr>
        </tbody>
      </table>

      <div class="note-h">Derived figures</div>
      <table class="kv">
        <tr><td>Spent, last 30 days</td><td>${D.money0(D.MONTH_EXPENSE)}</td></tr>
        <tr><td>Savings rate</td><td>${D.SAVINGS_RATE.toFixed(0)}%</td></tr>
        <tr><td>Emergency fund</td><td>${D.EMERGENCY_MONTHS.toFixed(1)} months</td></tr>
        <tr><td>Invested share</td><td>${D.INVESTED_SHARE.toFixed(0)}%</td></tr>
        <tr><td>Concentration</td><td>${D.CONCENTRATION.toFixed(1)}%</td></tr>
        <tr><td>Growth allocation</td><td>${D.GROWTH_ALLOCATION.toFixed(0)}%</td></tr>
        <tr><td>Annual income</td><td>${D.compact(D.ANNUAL_INCOME)}</td></tr>
        <tr><td>Life cover target</td><td>${D.compact(D.LIFE_TARGET)}</td></tr>
        <tr><td>Health cover floor</td><td>${D.compact(D.HEALTH_FLOOR)}</td></tr>
        <tr><td>Health score</td><td>${D.HEALTH} — ${D.healthGrade(D.HEALTH)}</td></tr>
        <tr><td>Dividends received</td><td>${D.money0(D.DIV_RECEIVED)}</td></tr>
        <tr><td>Dividends announced</td><td>${D.money0(D.DIV_EXPECTED)}</td></tr>
        <tr><td>Snapshots</td><td>${D.SNAPSHOTS.length} days</td></tr>
      </table>

      <div class="note-h">Document date</div>
      <p class="note-p">
        Every relative date in this document resolves against a pinned <b>${D.dmy(D.TODAY)}</b>, so
        rebuilding it produces the same figures. The app itself dates the sample vault relative to
        the day it is loaded.</p>
    </div>
  </div>`,
});

const contractsPage = page({
  part: 'Part F · Appendix', title: 'Contracts, caveats and what is deliberately absent', meta: 'Read before changing anything',
  body: `
  <div class="grid g3" style="gap:30px;height:100%;align-items:start">
    <div>
      <div class="note-h" style="margin-top:0">Frozen contracts</div>
      <p class="note-p">Three strings cannot change without breaking existing installs or the
        cross-client backup format. None of them is brand, and none should be “tidied”.</p>
      <table class="tbl">
        <thead><tr><th>What</th><th>Value</th><th>Why</th></tr></thead>
        <tbody>
          <tr><td>Vault verifier</td><td class="mono">FTOS-OK</td><td>Proves a PIN decrypted correctly</td></tr>
          <tr><td>Database name</td><td class="mono">fintech_os</td><td>Renaming orphans every existing vault</td></tr>
          <tr><td>Backup extension</td><td class="mono">.ftos</td><td>Paired with the Flutter backup magic</td></tr>
        </tbody>
      </table>

      <div class="note-h">Deliberately empty data files</div>
      <table class="tbl">
        <thead><tr><th>File</th><th>Why</th></tr></thead>
        <tbody>
          <tr><td class="mono">benchmarks.json → series</td><td>Index close series need licensed data; an invented one would make benchmark comparison confidently wrong</td></tr>
          <tr><td class="mono">fund_portfolios.json → schemes</td><td>MF look-through needs real AMC disclosures, so overlap analysis is disabled rather than faked</td></tr>
        </tbody>
      </table>

      <div class="note-h">The one data discrepancy</div>
      <div class="panel">
        <p class="note-p" style="margin:0">
          <code>sampleData.ts</code> backfills ninety days of history ending at a hardcoded
          <b>₹5.24 Cr</b>, but the holdings and accounts it seeds compute to
          <b>${D.compact(D.NET_WORTH)}</b>. The ledger is right and the backfill is decorative. This
          document uses the computed figure everywhere and scales the snapshot curve onto it,
          preserving its shape. It is exactly the class of inconsistency the Diagnostics screen
          exists to surface — and worth fixing in the seed.</p>
      </div>
    </div>

    <div>
      <div class="note-h" style="margin-top:0">Screen → domain module</div>
      <table class="tbl">
        <thead><tr><th>Screen</th><th>Computed by</th></tr></thead>
        <tbody>
          ${[
            ['Dashboard', 'portfolio · finance · health · insights · narrative'],
            ['Analytics', 'portfolio · investmentTotals'],
            ['Reports', 'statements · finance'],
            ['Portfolio · Holdings', 'portfolio · lots · fixedIncome'],
            ['Watchlist · Markets', 'dayChange · demo/marketFeed'],
            ['Dividends', 'stored records only'],
            ['Tax Center', 'tax · lots'],
            ['Accounts · Transactions', 'accountLedger'],
            ['Calendar', 'calendarLedger'],
            ['Reconcile', 'reconcile'],
            ['Budget', 'finance · insights'],
            ['Recurring', 'recurrence'],
            ['Goals', 'insights.requiredMonthlySip'],
            ['Liabilities', 'finance.emi · simulatePayoff'],
            ['Insurance · Safety Net', 'insurance · safetyNet'],
            ['Score', 'health'],
            ['Import', 'importTemplates · syncMerge'],
            ['Add', 'nlp · accountLedger'],
            ['Alerts', 'evaluated in store'],
            ['Diagnostics', 'diagnostics'],
          ].map(([s, m]) => `<tr><td><b>${s}</b></td><td class="mono" style="font-size:10.5px">${m}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div>
      <div class="note-h" style="margin-top:0">Deliberately absent</div>
      <p class="note-p">
        Each of these is a decision, not a gap. Reading them as a backlog is the most likely way to
        misuse this document.</p>
      <table class="tbl">
        <tbody>
          ${[
            ['Account or sign-in', 'There is no server to hold one'],
            ['Cloud sync service', 'Backup files move between devices instead'],
            ['Live market feed', 'A price request discloses a holding'],
            ['Push notifications', 'Would require a server and a device token'],
            ['Advice or recommendations', 'Enforced by the banned-phrase list'],
            ['Analytics or crash reporting', 'No network calls at all'],
            ['Password recovery', 'The PIN is the key; recovery would mean escrow'],
            ['Realised P&amp;L on web', 'Needs the Flutter trade ledger — unrealised only here'],
            ['MF overlap analysis', 'Disabled until real AMC disclosures exist'],
            ['Benchmark comparison', 'Disabled until licensed index data exists'],
          ].map(([a, b]) => `<tr><td><b>${a}</b><br><span style="font-size:10.5px;color:#A7B1AC">${b}</span></td></tr>`).join('')}
        </tbody>
      </table>

      <div class="note-h">Caveats on this document</div>
      <p class="note-p">
        The artboards are <b>redrawn from tokens</b>, not screenshots of the running build. They are
        accurate to the design system and to the demo data; where a shipped screen has drifted from
        its tokens, this document shows the intent rather than the drift.</p>
      <p class="note-p">
        It specifies the <b>web client</b>. The Flutter app shares the tokens, the algorithms and the
        five-tab bar, but its desktop sidebar carries 19 items in four sections and it has two screens
        the web build does not.</p>
      <p class="note-p">
        Contrast figures in Part E are computed from token pairs. <b>No assistive-technology pass has
        been run</b> against the live build, and this document does not claim one.</p>

      <div class="note-h">Regenerating</div>
      <table class="kv">
        <tr><td>Build</td><td class="mono">node docs/design-spec/build.mjs</td></tr>
        <tr><td>HTML only</td><td class="mono">--html</td></tr>
        <tr><td>Token parity</td><td class="mono">check-tokens.mjs</td></tr>
        <tr><td>Icon codegen</td><td class="mono">gen-icons.mjs</td></tr>
        <tr><td>Renderer</td><td>cached Chromium, --print-to-pdf</td></tr>
        <tr><td>Sheet</td><td>1680 × 1188 px (17.5 × 12.375 in)</td></tr>
      </table>
    </div>
  </div>`,
});

export default [
  divider({
    part: 'Part F',
    title: 'Appendix',
    lede: `The demo vault printed as reference data, the map from screen to domain module, the three
      frozen contracts, and an explicit list of what this product does not do.`,
    contents: ['Holdings', 'Money', 'Contracts &amp; caveats'],
  }),
  holdingsPage,
  ledgerPage,
  contractsPage,
];
