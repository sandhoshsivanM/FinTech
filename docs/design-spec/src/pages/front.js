/** Front matter: cover, contents, and how to read an artboard. */
import { page } from '../doc.js';

const MARK = '../../assets/brand/khazana-mark.png';

export const cover = page({
  cls: 'sheet-dark',
  head: false,
  body: `
  <div style="position:absolute;inset:0;background:
      radial-gradient(120% 150% at 88% -10%, rgba(217,173,82,.16), transparent 58%),
      radial-gradient(90% 120% at 8% 110%, rgba(32,201,138,.10), transparent 60%),
      linear-gradient(168deg,#12241C 0%, #0D1713 62%);"></div>
  <div style="position:absolute;inset:0;background-image:
      linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px);
      background-size:48px 48px;
      -webkit-mask-image:radial-gradient(120% 100% at 70% 0%, #000, transparent 70%);"></div>

  <div style="position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:8px 4px">
    <div style="display:flex;align-items:center;gap:18px">
      <img src="${MARK}" width="58" height="58" style="object-fit:contain" alt="">
      <span style="font-size:23px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#F4F7F5">Khazana</span>
      <span style="margin-left:auto;font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#D9AD52">Design Specification</span>
    </div>

    <div style="max-width:1180px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:26px">
        <span style="height:1px;width:52px;background:#D9AD52;opacity:.5;display:block"></span>
        <span style="font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#D9AD52">Your wealth. Your vault.</span>
      </div>
      <h1 style="font-size:104px;line-height:0.98;font-weight:700;letter-spacing:-0.045em;margin:0;color:#F4F7F5">
        The complete<br>interface.
      </h1>
      <p style="font-size:19px;line-height:1.6;color:rgba(255,255,255,.70);margin:30px 0 0;max-width:820px">
        Every screen of the Khazana web client, drawn from the shipped token system and
        populated with the demo vault — alongside the foundations, the component library,
        and the interaction behaviour that hold them together.
      </p>
      <div style="display:flex;gap:52px;margin-top:46px">
        ${[
          ['28', 'screens, both themes'],
          ['2', 'themes — Vault &amp; Ledger'],
          ['7', 'mobile frames at 390px'],
          ['1', 'demo vault, ₹2.19 Cr'],
        ].map(([n, l]) => `
          <div>
            <div style="font-size:44px;font-weight:700;letter-spacing:-0.04em;color:#20C98A;line-height:1">${n}</div>
            <div style="font-size:12.5px;color:rgba(255,255,255,.55);margin-top:8px">${l}</div>
          </div>`).join('')}
      </div>
    </div>

    <div style="display:flex;align-items:flex-end;gap:44px;padding-top:26px;border-top:1px solid rgba(255,255,255,.12)">
      ${[
        ['100% private', 'No server. No tracking.'],
        ['Encrypted', 'AES-256 at rest. PIN never leaves the device.'],
        ['Offline first', 'Works everywhere. No internet required.'],
      ].map(([t, d]) => `
        <div style="max-width:280px">
          <div style="font-size:12.5px;font-weight:700;color:#F4F7F5">${t}</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,.48);margin-top:3px">${d}</div>
        </div>`).join('')}
      <div style="margin-left:auto;text-align:right;font-size:11px;color:rgba(255,255,255,.40);line-height:1.7">
        Web client · Next.js<br>Generated from <span class="mono">webapp/src</span>
      </div>
    </div>
  </div>`,
});

/** Page numbers are substituted by build.mjs from the manifest. */
const TOC = [
  ['0', 'Front matter', 'Cover · contents · how to read an artboard', '<!--PAGE:0-->'],
  ['A', 'Foundations', 'Colour · charts · type · space · radius · elevation · motion · grid · brand', '<!--PAGE:A-->'],
  ['B', 'Components', 'The primitive kit, every variant and state, in both themes', '<!--PAGE:B-->'],
  ['C', 'Screens', 'All 28 artboards, Vault and Ledger', '<!--PAGE:C-->'],
  ['D', 'Mobile', 'The bottom-nav destinations, the gate, and quick add at 390px', '<!--PAGE:D-->'],
  ['E', 'UX &amp; motion', 'Information architecture · five core flows · motion spec · states · accessibility', '<!--PAGE:E-->'],
  ['F', 'Appendix', 'The demo vault as reference data · screen→module map · frozen contracts', '<!--PAGE:F-->'],
];

export const contents = page({
  part: 'Part 0 · Front matter',
  title: 'Contents',
  meta: 'Khazana Design Specification',
  body: `
  <div style="display:flex;gap:56px;height:100%">
    <div style="flex:1.35">
      ${TOC.map(([k, t, d, p]) => `
        <div style="display:flex;align-items:baseline;gap:20px;padding:19px 0;border-bottom:1px solid #E7EDE9">
          <span style="flex:none;width:36px;font-size:22px;font-weight:700;color:#087A56;letter-spacing:-0.02em">${k}</span>
          <span style="flex:none;width:230px;font-size:19px;font-weight:700;letter-spacing:-0.025em;color:#101613">${t}</span>
          <span style="flex:1;font-size:12.5px;color:#718079;line-height:1.5">${d}</span>
          <span style="flex:none;font-size:13px;font-weight:600;color:#A7B1AC">${p}</span>
        </div>`).join('')}
      <p class="note-p" style="margin-top:26px;max-width:760px">
        Page numbers are the sheet they open on. Part C runs in sidebar order —
        Overview, Invest, Money, Protect, More — and every screen appears twice,
        Vault (dark) then Ledger (light), on facing sheets.
      </p>
    </div>

    <div style="flex:1;border-left:1px solid #DCE4DF;padding-left:44px">
      <div class="note-h" style="margin-top:0">The premise</div>
      <p class="note-p">
        Khazana ships two clients — a Flutter app and this Next.js web app — over one
        token system. <b>This document specifies the web client</b>, whose 28 routes are a
        superset of the Flutter app's 24.
      </p>
      <p class="note-p">
        Nothing here is a screenshot. Every artboard is redrawn from the same design
        tokens the app compiles, so a value in this document and a value in
        <span class="mono">globals.css</span> cannot disagree — a build-time check
        asserts it.
      </p>

      <div class="note-h">Two named themes</div>
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <div style="flex:1;border-radius:10px;padding:14px;background:#080D0B;border:1px solid #26342E">
          <div style="font-size:13px;font-weight:700;color:#F4F7F5">Vault</div>
          <div style="font-size:11px;color:#A0ADA7;margin-top:3px">The dark theme. Four surface levels, borders instead of shadows.</div>
        </div>
        <div style="flex:1;border-radius:10px;padding:14px;background:#F5F7F5;border:1px solid #DCE4DF">
          <div style="font-size:13px;font-weight:700;color:#101613">Ledger</div>
          <div style="font-size:11px;color:#53625B;margin-top:3px">The light theme. One subtle shadow; cards are the brightest surface.</div>
        </div>
      </div>
      <p class="note-p">
        Only colour changes between them. Spacing, type, sizing and layout are identical
        — which is why one artboard source renders both frames in this document.
      </p>

      <div class="note-h">The governing rule</div>
      <div style="border-radius:10px;border:1px solid rgba(8,122,86,.28);background:#E1F3EB;padding:16px 18px">
        <div style="font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#087A56">Emerald&nbsp;=&nbsp;interaction.<br>Gold&nbsp;=&nbsp;identity.</div>
        <div style="font-size:11.5px;color:#53625B;margin-top:9px;line-height:1.55">
          Gold carries the mark and wealth-flavoured moments and is never a button colour.
          Making gold the interaction colour is what turns a premium product into a
          gold-painted generic one.
        </div>
      </div>
    </div>
  </div>`,
});

export const howToRead = page({
  part: 'Part 0 · Front matter',
  title: 'How to read an artboard',
  meta: 'Frame anatomy',
  body: `
  <div style="display:flex;gap:44px;height:100%">
    <div style="flex:1.5">
      <p class="lede" style="margin-bottom:24px">
        Every screen sheet in Part C has the same three parts: a <b>frame label</b>, the
        <b>artboard</b>, and an <b>annotation rail</b>. Callout badges are anchored inside
        the mockup itself, so a number always sits on the thing it describes.
      </p>

      <div style="position:relative;border:1px dashed #C7D2CC;border-radius:12px;padding:26px">
        <div style="position:absolute;top:-11px;left:22px;background:#FBFCFB;padding:0 9px;font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#A7B1AC">Sheet</div>

        <div class="cal-host" style="margin-bottom:12px">
          <span class="cal tl">1</span>
          <div class="fname" style="border:1px solid #DCE4DF;border-radius:8px;padding:8px 12px;background:#fff">
            <b>Dashboard</b><span class="dim">/ Desktop / Vault</span>
            <span class="tchip vault"><i></i>Vault · dark</span>
            <span class="rh-spacer"></span><span class="dim">/dashboard</span>
          </div>
        </div>

        <div style="display:flex;gap:22px">
          <div class="cal-host" style="flex:1.8">
            <span class="cal tl">2</span>
            <div style="border:1px solid #C7D2CC;border-radius:10px;height:250px;background:#080D0B;position:relative;overflow:hidden">
              <div style="position:absolute;inset:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
                ${Array.from({ length: 4 }, () => '<div style="border-radius:8px;background:#151E1A;border:1px solid #26342E"></div>').join('')}
                <div style="grid-column:span 3;border-radius:8px;background:#151E1A;border:1px solid #26342E;position:relative">
                  <span class="cal" style="top:-9px;right:-9px;box-shadow:0 0 0 2.5px #080D0B">3</span>
                </div>
                <div style="border-radius:8px;background:#151E1A;border:1px solid #26342E"></div>
              </div>
            </div>
          </div>

          <div class="cal-host" style="flex:1">
            <span class="cal tl">4</span>
            <div style="border:1px solid #DCE4DF;border-radius:10px;background:#fff;padding:14px;height:250px">
              <div class="note-h" style="margin-top:0">Annotations</div>
              <ol class="notes">
                <li><span class="n">3</span><span>Every badge in the frame has a matching row here.</span></li>
                <li><span class="n">·</span><span>Numbers run left-to-right, top-to-bottom.</span></li>
              </ol>
              <div class="note-h">Spec</div>
              <table class="kv"><tr><td>Card padding</td><td>20px</td></tr><tr><td>Radius</td><td>14px</td></tr></table>
            </div>
          </div>
        </div>
      </div>

      <div class="grid g2" style="margin-top:26px">
        <div class="panel">
          <div class="panel-h">Scale</div>
          <p class="note-p" style="margin:0">
            Desktop artboards are drawn at their true <b>1440 px</b> width and printed at
            <b>82%</b> to leave room for the annotation rail. Every measurement quoted in
            this document is the <b>true</b> value, never the printed one.
            Mobile artboards are printed 1:1 at <b>390 px</b>.
          </p>
        </div>
        <div class="panel">
          <div class="panel-h">Truncation</div>
          <p class="note-p" style="margin:0">
            A frame shows the screen's composition down to a fixed artboard height, the way
            a Figma frame does. Lists that continue below the cut are shown with their real
            leading rows — the count in the rail states the full number.
          </p>
        </div>
      </div>
    </div>

    <div style="flex:1;border-left:1px solid #DCE4DF;padding-left:40px">
      <div class="note-h" style="margin-top:0">Legend</div>
      <ol class="notes">
        <li><span class="n">1</span><span><b>Frame label.</b> Screen name, platform, theme, and the route it serves.</span></li>
        <li><span class="n">2</span><span><b>Artboard.</b> The redrawn screen on its true theme canvas, clipped to the frame.</span></li>
        <li><span class="n">3</span><span><b>Callout badge.</b> Anchored to an element, not floated over a coordinate.</span></li>
        <li><span class="n">4</span><span><b>Annotation rail.</b> Purpose, numbered notes, and a spec table of the values that matter.</span></li>
      </ol>

      <div class="note-h">Conventions</div>
      <table class="kv">
        <tr><td>Currency</td><td>INR, <span class="mono">en-IN</span> grouping</td></tr>
        <tr><td>Figures</td><td>tabular numerals throughout</td></tr>
        <tr><td>Compact form</td><td>₹1.2Cr · ₹1.2L · ₹90k</td></tr>
        <tr><td>Untracked value</td><td>renders “—”, never 0</td></tr>
        <tr><td>Frame size</td><td>1440 × 940 desktop</td></tr>
        <tr><td>Mobile size</td><td>390 × 844</td></tr>
      </table>

      <div class="note-h">Data</div>
      <p class="note-p">
        Every figure in every frame comes from the demo vault in
        <span class="mono">lib/sampleData.ts</span> — the same one the Settings screen
        loads. Net worth ₹5.24 Cr, 24 holdings, 3 accounts, 3 liabilities, 3 policies,
        5 goals, 91 days of snapshots. Part F prints it in full.
      </p>

      <div style="border-radius:10px;border:1px solid #DCE4DF;background:#EDF2EF;padding:14px 16px;margin-top:18px">
        <div style="font-size:11.5px;font-weight:700;color:#101613;margin-bottom:5px">Not investment advice</div>
        <div style="font-size:11px;color:#53625B;line-height:1.55">
          Figures shown are demonstration data for interface design. The product's own
          narrative engine carries the same disclaimer and a banned-phrase list that keeps
          generated copy out of advice territory — see Part E.
        </div>
      </div>
    </div>
  </div>`,
});

export default [cover, contents, howToRead];
