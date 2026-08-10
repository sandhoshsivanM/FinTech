/** Part E — information architecture, flows, motion, states, accessibility. */
import { page, divider } from '../doc.js';
import { NAV_GROUPS, BOTTOM_NAV } from '../chrome.js';
import { icon } from '../icons.js';

const arrow = (label = '') => `<div class="farrow"><div style="text-align:center">${icon('arrow-right', 15)}${label ? `<div class="fbranch" style="margin-top:3px">${label}</div>` : ''}</div></div>`;
const node = (t, d, cls = '') => `<div class="fnode ${cls}"><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;

function flow({ title, lede, steps, note = '' }) {
  return `
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:4px">
        <span style="font-size:14px;font-weight:700;letter-spacing:-0.02em;color:#101613">${title}</span>
        <span style="font-size:11.5px;color:#718079">${lede}</span>
      </div>
      <div class="flow" style="margin-top:10px">
        ${steps.map((s, i) => (i ? arrow(s[3] ?? '') : '') + node(s[0], s[1], s[2] ?? '')).join('')}
      </div>
      ${note ? `<p class="note-p" style="margin:9px 0 0;font-size:11.5px">${note}</p>` : ''}
    </div>`;
}

// ------------------------------------------------------------------ IA map
const iaPage = page({
  part: 'Part E · UX', title: 'Information architecture', sub: '26 destinations, five groups', meta: 'navConfig.ts',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:2;min-width:0">
      <div class="grid g5" style="gap:16px;align-items:start">
        ${NAV_GROUPS.map(([label, items], gi) => `
          <div>
            <div style="display:flex;align-items:center;gap:8px;padding-bottom:9px;margin-bottom:9px;border-bottom:2px solid ${['#189E6E', '#BE8420', '#2E92C4', '#C9538A', '#8E7CC3'][gi]}">
              <span style="font-size:11.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#101613">${label}</span>
              <span style="margin-left:auto;font-size:10.5px;color:#A7B1AC">${items.length}</span>
            </div>
            ${items.map(([href, name, ic]) => `
              <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid #F1F5F3">
                <span style="flex:none;color:#53625B">${icon(ic, 15)}</span>
                <span style="min-width:0">
                  <span style="display:block;font-size:12px;font-weight:600;color:#101613">${name}</span>
                  <span style="display:block;font-size:9.5px;color:#A7B1AC;font-family:ui-monospace,monospace">${href}</span>
                </span>
                ${BOTTOM_NAV.some(([h]) => h === href) ? '<span class="tag ok" style="margin-left:auto">tab</span>' : ''}
              </div>`).join('')}
          </div>`).join('')}
      </div>

      <div class="rule"></div>

      <div class="grid g2" style="gap:26px">
        <div>
          <div class="note-h" style="margin-top:0">The five phone tabs</div>
          <div style="display:flex;gap:10px">
            ${BOTTOM_NAV.map(([href, label, ic]) => `
              <div style="flex:1;text-align:center;border:1px solid #DCE4DF;border-radius:11px;padding:13px 6px">
                <span style="color:#087A56;display:inline-block">${icon(ic, 19)}</span>
                <div style="font-size:11px;font-weight:600;color:#101613;margin-top:6px">${label}</div>
                <div style="font-size:9px;color:#A7B1AC;font-family:ui-monospace,monospace;margin-top:2px">${href}</div>
              </div>`).join('')}
          </div>
          <p class="note-p" style="margin-top:11px">
            These five match the Flutter app's bottom bar exactly, and a test asserts the two lists
            stay in step. A user moving between clients should not have to relearn where things are.
            <code>/investments</code> keeps its path for that reason — only its label became
            “Portfolio”.</p>
        </div>

        <div>
          <div class="note-h" style="margin-top:0">Grouping is not decoration</div>
          <p class="note-p">
            At twenty-plus destinations a flat list stops being scannable. The five groups answer
            <b>“what am I trying to do”</b> — look at it, grow it, spend it, protect it, everything
            else — rather than mirroring the data model, which would have put Holdings under a
            different heading from Portfolio.</p>
          <table class="kv">
            <tr><td>Sidebar destinations</td><td>26</td></tr>
            <tr><td>Groups</td><td>5</td></tr>
            <tr><td>Phone tabs</td><td>5</td></tr>
            <tr><td>Off-nav routes</td><td>/add · / (redirect)</td></tr>
            <tr><td>Web-only screens</td><td>10</td></tr>
            <tr><td>Flutter-only screens</td><td>2 — Capture Inbox, Market data</td></tr>
          </table>
        </div>
      </div>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">Every route is in the sidebar</div>
      <p class="note-p">
        No destination is reachable only by a link from another screen. A guarded test walks
        <code>NAV_ITEMS</code> against the route table, so a new page that forgets to register
        itself fails the build rather than becoming orphaned.</p>

      <div class="note-h">Depth is two, everywhere</div>
      <p class="note-p">
        Sidebar → screen. Nothing nests a third level; where a screen needs detail it uses a
        segmented control, a drawer or a row expansion rather than a sub-route. The one exception is
        <code>/add</code>, which is modal and returns to where it was opened from.</p>

      <div class="note-h">Cross-client parity</div>
      <table class="kv">
        <tr><td>Flutter screens</td><td>24</td></tr>
        <tr><td>Web routes</td><td>28</td></tr>
        <tr><td>Shared</td><td>18</td></tr>
        <tr><td>Flutter nav</td><td>5 tabs · 19-item desktop sidebar</td></tr>
        <tr><td>Shared tokens</td><td>colour · type · space · motion</td></tr>
        <tr><td>Shared algorithms</td><td>health · safety net · tax · FIFO</td></tr>
        <tr><td>Shared fixture</td><td>health_cases.json, byte-identical</td></tr>
      </table>
      <p class="note-p" style="margin-top:12px">
        Web-only: Holdings, Watchlist, Markets, Dividends, Tax Center, Reconcile, News, Alerts,
        Diagnostics, Help. Flutter-only: Capture Inbox (SMS review) and Market Data settings.</p>
    </div>
  </div>`,
});

// ------------------------------------------------------------------ Flows
const flowsPage = page({
  part: 'Part E · UX', title: 'Core flows', sub: 'Five paths that define the product', meta: 'End to end',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:2.2;min-width:0">
      ${flow({
        title: 'First run', lede: 'install → a vault with data in it',
        steps: [
          ['Open the app', 'No account, no sign-in', 'term'],
          ['Create a PIN', '≥ 4 digits, entered twice', 'accent'],
          ['Key derived', 'PIN → AES-256 key, PIN discarded'],
          ['Empty vault', 'Categories seeded, nothing else'],
          ['Load sample data', 'Settings → Data, optional', 'term'],
        ],
        note: `The gate is the only blocking step. Everything after it is skippable — a user who
          wants an empty vault gets one, and the demo badge appears only if they choose the sample.`,
      })}

      ${flow({
        title: 'Add a transaction', lede: 'the highest-frequency path in the product',
        steps: [
          ['Trigger', 'FAB · sidebar button · N key', 'term'],
          ['Amount', '52px field, focused on open', 'accent'],
          ['Category', 'One tap from an 11-tile grid'],
          ['Details', 'Merchant remembered from history'],
          ['Save', 'Writes txn + balanced postings', 'accent'],
        ],
        note: `Quick add short-circuits the middle three: “1240 swiggy food today” is parsed on
          device and shown as chips before anything is written. Budget impact is displayed while the
          entry can still be reconsidered.`,
      })}

      ${flow({
        title: 'Import a broker file', lede: 'the only bulk write path',
        steps: [
          ['Choose source', '10 institution presets', 'term'],
          ['Parse', 'Read locally — never uploaded'],
          ['Preview', 'Every row labelled new / update / reject', 'accent'],
          ['Confirm', 'One batch id recorded'],
          ['Undo', 'Removes exactly that batch', 'term'],
        ],
        note: `Rejected rows are shown with a reason rather than dropped silently — a symbol missing
          from the instrument master would otherwise surface later as an “Unclassified” slice.`,
      })}

      ${flow({
        title: 'Reconcile an account', lede: 'proving the book is true',
        steps: [
          ['Pick account', 'and enter the statement balance', 'term'],
          ['Tick entries', 'Cleared balance updates live'],
          ['Difference', 'Warning tone — not an error', 'accent'],
          ['Explain', 'App names entries that would close the gap'],
          ['Finish', 'Cleared flags persist', 'term'],
        ],
        note: `The app never ticks anything on the user's behalf. It narrows the search and stops —
          an auto-reconciled book is a book nobody has actually checked.`,
      })}

      ${flow({
        title: 'Lock and ghost', lede: 'the shoulder-surfing path',
        steps: [
          ['Working', 'Vault unlocked', 'term'],
          ['Ghost mode', 'Every figure masked as ••••••', 'accent'],
          ['Idle', 'Auto-lock timer, default 5 min'],
          ['Locked', 'Key discarded from memory', 'accent'],
          ['Unlock', 'PIN or platform biometrics', 'term'],
        ],
        note: `Ghost mode and lock are different tools: ghost keeps the session alive for a screen
          share, lock destroys the in-memory key. ⌘L is bound to the second.`,
      })}
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">One rule across all five</div>
      <p class="note-p">
        <b>Nothing is written until the user confirms it.</b> Import previews, capture drafts sit in
        a queue, reconcile ticks are manual, quick-add shows its parse as chips. The product never
        acts on an inference and reports it afterwards.</p>

      <div class="note-h">Reversibility</div>
      <table class="kv">
        <tr><td>Import</td><td>undo, per batch</td></tr>
        <tr><td>Transaction</td><td>edit or delete</td></tr>
        <tr><td>Capture draft</td><td>confirm or dismiss</td></tr>
        <tr><td>Reconcile</td><td>untick freely</td></tr>
        <tr><td>Sample data</td><td>idempotent reload</td></tr>
        <tr><td>Erase vault</td><td><span class="tag bad">irreversible</span></td></tr>
        <tr><td>Lost PIN</td><td><span class="tag bad">irreversible</span></td></tr>
      </table>
      <p class="note-p" style="margin-top:12px">
        Exactly two actions cannot be undone, and both say so in the flow that reaches them rather
        than in a support article found afterwards.</p>

      <div class="note-h">Entry points to Add</div>
      <p class="note-p">
        FAB on Overview and Cash Flow, the sidebar's primary button, the <code>N</code> shortcut, the
        command palette, and “Add for this day” on the calendar. Five doors to one destination is
        correct for the action a user takes fifty times a week.</p>

      <div class="note-h">What has no flow</div>
      <p class="note-p">
        There is no onboarding wizard, no account recovery, no sync setup and no notification
        permission prompt. Each of those is absent because the corresponding feature is absent —
        Part F lists them.</p>
    </div>
  </div>`,
});

// ------------------------------------------------------------------ Motion & states
const MOTION = [
  ['Page entrance', 'Content rises 10px and fades in', 'kz-rise', '400ms', 'standard', 'Staggered 40ms per card, capped at 6'],
  ['Card hover', 'translateY(−2px) + shadow-2', '—', '250ms', 'standard', 'Opt-in via .lift; removed under reduced motion'],
  ['Button press', 'translateY(1px)', '—', 'instant', '—', 'No duration — a press must feel immediate'],
  ['Button colour', 'Background, border, ink', '—', '150ms', 'standard', 'Fast enough to feel attached to the cursor'],
  ['Focus ring', '2px canvas + 2px accent-line', '—', '150ms', 'standard', 'Never suppressed, in any theme'],
  ['Line chart', 'stroke-dashoffset 1 → 0', 'kz-draw', '400ms', 'standard', 'Draws left to right on mount only'],
  ['Bars / columns', 'scaleY 0 → 1 from the baseline', 'kz-grow', '400ms', 'standard', 'Opacity 0.4 → 1 alongside'],
  ['Progress bar', 'width transition', '—', '500ms', 'standard', 'Longer, because the value is the message'],
  ['Ring / gauge', 'stroke-dashoffset', '—', '600ms', 'standard', 'The slowest thing in the product'],
  ['Segmented', 'Background and ink swap', '—', '150ms', 'standard', 'The thumb does not slide — it swaps'],
  ['Drawer / sheet', 'Slide from edge + scrim fade', '—', '250ms', 'standard', 'Scrim is the only place blur is used'],
  ['Command palette', 'Scale 0.98 → 1 + fade', '—', '150ms', 'standard', 'Fast: it is a keyboard tool'],
];

const motionPage = page({
  part: 'Part E · UX', title: 'Motion &amp; interaction', sub: 'One curve, three durations', meta: 'globals.css keyframes',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:2.2;min-width:0">
      <table class="tbl">
        <thead><tr><th>What</th><th>Behaviour</th><th>Keyframe</th><th>Duration</th><th>Easing</th><th>Notes</th></tr></thead>
        <tbody>
          ${MOTION.map(([a, b, c, d, e, f]) => `<tr>
            <td><b>${a}</b></td><td>${b}</td>
            <td><span class="mono" style="color:#087A56">${c}</span></td>
            <td><b>${d}</b></td><td>${e}</td><td style="color:#718079">${f}</td></tr>`).join('')}
        </tbody>
      </table>

      <div class="rule"></div>

      <div class="grid g3">
        <div class="panel">
          <div class="panel-h">Hover</div>
          <p class="note-p" style="margin:0">
            Cards lift 2px and gain a shadow. Rows tint with <code>--fill</code>. Buttons move to
            their hover token. Nothing scales, and nothing changes size — a layout that reflows on
            hover is a layout that cannot be pointed at.</p>
        </div>
        <div class="panel">
          <div class="panel-h">Focus</div>
          <p class="note-p" style="margin:0">
            A two-part ring: 2px of the canvas colour, then 2px of <code>--accent-line</code>. The
            inner ring is what keeps it legible against a card <i>and</i> against a filled button.
            <code>:focus-visible</code>, so a mouse click does not draw it.</p>
        </div>
        <div class="panel">
          <div class="panel-h">Pressed</div>
          <p class="note-p" style="margin:0">
            One pixel down, no transition. Every other state animates; this one must not, because a
            delayed press response is the single clearest way to make an interface feel broken.</p>
        </div>
      </div>

      <div class="note-h">Reduced motion</div>
      <div class="panel">
        <p class="note-p" style="margin:0">
          Under <code>prefers-reduced-motion: reduce</code> every animation and transition drops to
          0.001ms, iteration count is forced to 1, smooth scrolling is disabled, and the hover lift
          is removed rather than shortened. Charts render at their final state immediately — the
          information was never in the animation.</p>
      </div>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">Keyboard</div>
      <table class="kv">
        <tr><td>Command palette</td><td>⌘K / Ctrl K</td></tr>
        <tr><td>New transaction</td><td>N</td></tr>
        <tr><td>Lock vault</td><td>⌘L / Ctrl L</td></tr>
        <tr><td>Focus search</td><td>/</td></tr>
        <tr><td>Dismiss</td><td>Esc</td></tr>
        <tr><td>Move focus</td><td>Tab / Shift Tab</td></tr>
        <tr><td>Activate</td><td>Enter / Space</td></tr>
      </table>

      <div class="note-h">Feedback surfaces</div>
      <p class="note-p">
        Banners persist in the layout. Confirms are modal and name the consequence in the button
        (“Erase vault”, not “OK”). There are no toasts — nothing that matters in this product is
        announced by something that disappears on a timer.</p>

      <div class="note-h">Loading</div>
      <p class="note-p">
        Local reads finish in single-digit milliseconds, so there are no skeletons on ordinary
        navigation. The three places that can genuinely wait — unlock, import parse, sample-data
        load — show a determinate state with a label, never an indefinite spinner.</p>

      <div class="note-h">Why one curve</div>
      <p class="note-p">
        A second easing curve buys nothing a reader can name and costs consistency across two
        clients. <code>cubic-bezier(0.4, 0, 0.2, 1)</code> is quick to leave and slow to settle, which
        suits every transition in the product.</p>
    </div>
  </div>`,
});

// ------------------------------------------------------------------ States & a11y
const statesPage = page({
  part: 'Part E · UX', title: 'States &amp; accessibility', meta: 'Applies to every screen',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:2;min-width:0">
      <div class="note-h" style="margin-top:0">Every screen has six states</div>
      <table class="tbl">
        <thead><tr><th>State</th><th>Treatment</th><th>Where it comes from</th></tr></thead>
        <tbody>
          <tr><td><b>Populated</b></td><td>The artboards in Part C</td><td>Vault has records</td></tr>
          <tr><td><b>Empty</b></td><td>EmptyState — icon plate, one line, one action</td><td>New vault, or a filter with no matches</td></tr>
          <tr><td><b>Partial</b></td><td>Missing values render “—”, never 0; counts state coverage</td><td>Unpriced holdings, untracked cover</td></tr>
          <tr><td><b>Loading</b></td><td>Determinate label; no indefinite spinner</td><td>Unlock, import parse, sample load</td></tr>
          <tr><td><b>Error</b></td><td>Danger banner in the layout, with the recovery action</td><td>Insecure context, restore failure, parse failure</td></tr>
          <tr><td><b>Ghost</b></td><td>Every figure masked as ••••••; layout unchanged</td><td>User toggle, for a shared screen</td></tr>
        </tbody>
      </table>

      <div class="note-h">Untracked is not zero</div>
      <div class="grid g2" style="gap:14px">
        <div class="stage thm-dark">
          <div class="stage-h">Correct</div>
          <div style="display:flex;gap:26px">
            <div><div class="eyebrow">Home cover</div>
              <div style="font-size:24px;font-weight:700;letter-spacing:-0.035em;color:var(--muted);margin-top:6px">—</div>
              <div style="font-size:11px;color:var(--muted);margin-top:3px">Not tracked</div></div>
            <div><div class="eyebrow">Protection score</div>
              <div style="font-size:24px;font-weight:700;letter-spacing:-0.035em;margin-top:6px">71</div>
              <div style="font-size:11px;color:var(--muted);margin-top:3px">Renormalised over 2 of 3</div></div>
          </div>
        </div>
        <div class="stage thm-dark">
          <div class="stage-h">Wrong</div>
          <div style="display:flex;gap:26px;opacity:.75">
            <div><div class="eyebrow">Home cover</div>
              <div style="font-size:24px;font-weight:700;letter-spacing:-0.035em;color:var(--danger);margin-top:6px">₹0</div>
              <div style="font-size:11px;color:var(--danger);margin-top:3px">Asserts a fact</div></div>
            <div><div class="eyebrow">Protection score</div>
              <div style="font-size:24px;font-weight:700;letter-spacing:-0.035em;color:var(--danger);margin-top:6px">47</div>
              <div style="font-size:11px;color:var(--danger);margin-top:3px">Punishes a gap in knowledge</div></div>
          </div>
        </div>
      </div>
      <p class="note-p" style="margin-top:11px">
        This is the single most load-bearing display rule in the product. A vault that has not been
        told about a policy is not a vault with no policy, and a score that treats the two the same
        is lying with a number.</p>

      <div class="note-h">Generated copy is constrained</div>
      <div class="panel">
        <p class="note-p" style="margin:0 0 9px">
          Narrative sentences are filtered through a banned-phrase list before they can render, and
          every insight surface closes with the disclaimer:</p>
        <div class="row" style="gap:7px">
          ${['buy', 'sell', 'invest in', 'recommend', 'you should', 'guaranteed', 'consider', 'prioritise'].map((p) => `<span class="tag bad mono">${p}</span>`).join('')}
        </div>
        <p class="note-p" style="margin:10px 0 0">
          <b>“Informational only — not investment advice.”</b> The rule is enforced at the render
          layer, not in review, because copy written months apart drifts and a compliance boundary
          that depends on memory is not a boundary.</p>
      </div>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">Accessibility</div>
      <table class="kv">
        <tr><td>Body contrast, Vault</td><td>#F4F7F5 on #151E1A — 14.8:1</td></tr>
        <tr><td>Body contrast, Ledger</td><td>#101613 on #FFFFFF — 17.6:1</td></tr>
        <tr><td>Secondary ink</td><td>≥ 5:1 both themes</td></tr>
        <tr><td>Muted ink</td><td>≥ 4.5:1 both themes</td></tr>
        <tr><td>Emerald on card</td><td>9.4:1 Vault · 5.6:1 Ledger</td></tr>
        <tr><td>Gold as text</td><td>uses --gold-ink, ≥ 5:1</td></tr>
        <tr><td>Chart marks</td><td>all ≥ 3:1 on both grounds</td></tr>
        <tr><td>Min touch target</td><td>48px</td></tr>
        <tr><td>Focus indicator</td><td>always visible, never removed</td></tr>
      </table>

      <div class="note-h">Colour is never alone</div>
      <p class="note-p">
        Deltas carry an arrow. Amounts carry a sign. Diverging bars carry a centre rule. Chart slices
        carry a legend. Status carries a labelled chip. Every one of these would survive being
        printed in greyscale — which this document, on a monochrome printer, actually tests.</p>

      <div class="note-h">Screen readers</div>
      <p class="note-p">
        Figures expose a spelled-out form via <code>moneyToWords</code> in Indian numbering — “two
        crore forty-one lakh…” — because a screen reader given <code>₹2,41,38,144</code> reads a
        digit sequence, not a quantity. Charts carry a text summary; decorative SVG is
        <code>aria-hidden</code>.</p>

      <div class="note-h">Not yet verified</div>
      <p class="note-p">
        The contrast figures above are computed from the token pairs. A full assistive-technology
        pass — VoiceOver and NVDA against the live build, keyboard-only traversal of all 28 routes —
        has not been run, and this document does not claim it has.</p>
    </div>
  </div>`,
});

export default [
  divider({
    part: 'Part E',
    title: 'UX &amp; motion',
    lede: `How the twenty-eight screens fit together, the five paths that define the product, and
      the interaction rules — motion, states, generated copy and accessibility — that apply
      everywhere at once.`,
    contents: ['Information architecture', 'Core flows', 'Motion &amp; interaction', 'States &amp; accessibility'],
  }),
  iaPage,
  flowsPage,
  motionPage,
  statesPage,
];
