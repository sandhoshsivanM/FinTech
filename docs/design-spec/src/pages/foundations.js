/** Part A — the token system, specimen by specimen. */
import { page, divider } from '../doc.js';
import { icon } from '../icons.js';
import * as K from '../kit.js';
import * as C from '../charts.js';
import * as D from '../data.js';

const MARK = '../../assets/brand/khazana-mark.png';

const sw = (name, hex, use, cls = '') => `
  <div class="sw ${cls}">
    <div class="chip" style="background:${hex}"></div>
    <div class="meta"><div class="nm">${name}</div><div class="hx">${hex}</div>${use ? `<div class="use">${use}</div>` : ''}</div>
  </div>`;

// ---------------------------------------------------------------- Colour
const VAULT = [
  ['--canvas', '#080D0B', 'Page ground'],
  ['--surface', '#101714', 'Sidebar, sheets'],
  ['--card', '#151E1A', 'The card'],
  ['--surface-2', '#1A2520', 'Raised within a card'],
  ['--line', '#26342E', 'Hairline'],
  ['--line-strong', '#34443C', 'Input border'],
  ['--ink', '#F4F7F5', 'Body text'],
  ['--ink-soft', '#A0ADA7', 'Secondary text'],
  ['--muted', '#718079', 'Labels, axes'],
  ['--disabled', '#4E5A55', 'Disabled ink'],
  ['--accent', '#20C98A', 'Interaction'],
  ['--accent-deep', '#2BDB99', 'Hover'],
  ['--accent-soft', '#12352A', 'Active wash'],
  ['--accent-on', '#06110C', 'Ink on emerald'],
  ['--gold', '#D9AD52', 'Identity'],
  ['--gold-soft', '#302718', 'Gold wash'],
  ['--brand-plate', '#0D3D2B', 'Lockup ground'],
  ['--income', '#20C98A', 'Gain'],
  ['--expense', '#F06464', 'Loss'],
  ['--warn', '#E5B84D', 'Warning'],
  ['--info', '#63A8FF', 'Information'],
  ['--violet', '#A4AAF6', 'Transfers'],
];

const LEDGER = [
  ['--canvas', '#F5F7F5', 'Page ground'],
  ['--surface', '#FFFFFF', 'Sidebar, sheets'],
  ['--card', '#FFFFFF', 'The card'],
  ['--surface-2', '#EDF2EF', 'Raised within a card'],
  ['--line', '#DCE4DF', 'Hairline'],
  ['--line-strong', '#C7D2CC', 'Input border'],
  ['--ink', '#101613', 'Body text'],
  ['--ink-soft', '#53625B', 'Secondary text'],
  ['--muted', '#718079', 'Labels, axes'],
  ['--disabled', '#A7B1AC', 'Disabled ink'],
  ['--accent', '#087A56', 'Interaction'],
  ['--accent-deep', '#066A4A', 'Hover'],
  ['--accent-soft', '#E1F3EB', 'Active wash'],
  ['--accent-on', '#FFFFFF', 'Ink on emerald'],
  ['--gold', '#A97922', 'Identity'],
  ['--gold-ink', '#8E641B', 'Gold as words'],
  ['--brand-plate', '#0D3D2B', 'Lockup ground'],
  ['--income', '#087A56', 'Gain'],
  ['--expense', '#C73D46', 'Loss'],
  ['--warn', '#A97922', 'Warning'],
  ['--info', '#2672C8', 'Information'],
  ['--violet', '#6E5BB8', 'Transfers'],
];

const colourPage = page({
  part: 'Part A · Foundations', title: 'Colour', sub: 'Vault and Ledger', meta: 'globals.css',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:2.4;min-width:0">
      <div class="note-h" style="margin-top:0">Vault — the dark theme</div>
      <div class="grid g6" style="gap:10px;margin-bottom:22px">${VAULT.map(([n, h, u]) => sw(n, h, u, 'tight')).join('')}</div>
      <div class="note-h">Ledger — the light theme</div>
      <div class="grid g6" style="gap:10px">${LEDGER.map(([n, h, u]) => sw(n, h, u, 'tight')).join('')}</div>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div style="border-radius:12px;background:#0D3D2B;padding:22px;margin-bottom:22px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#F4F7F5;line-height:1.35">
          Emerald&nbsp;=&nbsp;interaction.<br>Gold&nbsp;=&nbsp;identity.</div>
        <div style="font-size:11.5px;color:rgba(255,255,255,.68);margin-top:12px;line-height:1.6">
          Gold carries the mark and wealth-flavoured moments. It is deliberately never a button
          colour — making gold the interaction colour is what turns a premium product into a
          gold-painted generic one.</div>
      </div>

      <div class="note-h" style="margin-top:0">Four surface levels</div>
      <p class="note-p">
        Jumping from near-black straight to a bright card is what makes dark UI look flat. Vault
        steps evenly instead:</p>
      <div style="display:flex;gap:0;border-radius:9px;overflow:hidden;margin-bottom:8px">
        ${['#080D0B', '#101714', '#151E1A', '#1A2520'].map((h) => `<div style="flex:1;height:46px;background:${h}"></div>`).join('')}
      </div>
      <div style="display:flex;gap:0;font-size:9.5px;color:#A7B1AC;margin-bottom:22px;font-family:ui-monospace,monospace">
        ${['#080D0B', '#101714', '#151E1A', '#1A2520'].map((h) => `<div style="flex:1;text-align:center">${h}</div>`).join('')}
      </div>

      <div class="note-h">The gold text exception</div>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="flex:1;border-radius:9px;background:#FFFFFF;border:1px solid #DCE4DF;padding:13px">
          <div style="font-size:13px;font-weight:700;color:#A97922">--gold on card</div>
          <div style="font-size:10.5px;color:#718079;margin-top:4px">3.9:1 — graphics only</div>
        </div>
        <div style="flex:1;border-radius:9px;background:#FFFFFF;border:1px solid #DCE4DF;padding:13px">
          <div style="font-size:13px;font-weight:700;color:#8E641B">--gold-ink on card</div>
          <div style="font-size:10.5px;color:#718079;margin-top:4px">5.2:1 — body text</div>
        </div>
      </div>
      <p class="note-p">
        On Vault, gold already reads 9.4:1, so <code style="font-family:ui-monospace,monospace">--gold-ink</code>
        resolves to the same value. The token exists so no call site has to know which theme it is in.</p>

      <div class="note-h">Success is the interaction colour</div>
      <p class="note-p">
        A gain and a primary action share one emerald, by decision. The cost is that a profit figure
        and a button read alike; the benefit is one unambiguous brand green instead of two competing
        ones.</p>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Charts
const SERIES = [
  ['--c1', '#4EB982'], ['--c2', '#A4AAF6'], ['--c3', '#C19C3A'], ['--c4', '#63A1D5'],
  ['--c5', '#EA8760'], ['--c6', '#73C7CC'], ['--c7', '#CA7CB4'], ['--c8', '#9CAA65'],
];

const GROUPS = [
  ['equity', 'Equity', '#4eb982'], ['debt', 'Debt', '#a4aaf6'], ['gold', 'Gold', '#c19c3a'],
  ['real_estate', 'Real Estate', '#63a1d5'], ['retirement', 'Retirement', '#ea8760'],
  ['crypto', 'Crypto', '#73c7cc'], ['cash', 'Cash', '#ca7cb4'],
];

const chartsPage = page({
  part: 'Part A · Foundations', title: 'Chart palette', sub: 'Order is the accessibility mechanism', meta: 'charts/tokens.ts',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:1.6;min-width:0">
      <div class="note-h" style="margin-top:0">Categorical series — fixed order</div>
      <div style="display:flex;gap:0;border-radius:10px;overflow:hidden;margin-bottom:10px">
        ${SERIES.map(([, h]) => `<div style="flex:1;height:76px;background:${h}"></div>`).join('')}
      </div>
      <div style="display:flex;margin-bottom:26px">
        ${SERIES.map(([n, h], i) => `<div style="flex:1;text-align:center">
          <div style="font-size:11px;font-weight:700;color:#101613">${i + 1}</div>
          <div style="font-size:9.5px;color:#718079;font-family:ui-monospace,monospace;margin-top:2px">${h}</div>
          <div style="font-size:9.5px;color:#A7B1AC;font-family:ui-monospace,monospace">${n}</div>
        </div>`).join('')}
      </div>

      <div class="note-h">Asset groups — 14 types collapse to 7</div>
      <p class="note-p" style="margin-bottom:14px">
        Fourteen categorical hues cannot be kept colourblind-safe, so the asset types roll up to
        seven groups with a fixed render order. Charts must never sort these slices by value.</p>
      <div class="grid" style="grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:26px">
        ${GROUPS.map(([k, l, h], i) => `
          <div class="sw">
            <div class="chip" style="background:${h};height:46px;position:relative">
              <span style="position:absolute;top:6px;left:8px;font-size:10px;font-weight:700;color:rgba(255,255,255,.85)">${i + 1}</span>
            </div>
            <div class="meta"><div class="nm">${l}</div><div class="hx">${h}</div></div>
          </div>`).join('')}
      </div>

      <div class="note-h">Reserved neutral</div>
      <div style="display:flex;gap:12px;align-items:stretch">
        <div style="flex:none;width:150px" class="sw">
          <div class="chip" style="background:#718079;height:42px"></div>
          <div class="meta"><div class="nm">Unclassified · Vault</div><div class="hx">#718079</div></div>
        </div>
        <div style="flex:none;width:150px" class="sw">
          <div class="chip" style="background:#A7B1AC;height:42px"></div>
          <div class="meta"><div class="nm">Unclassified · Ledger</div><div class="hx">#A7B1AC</div></div>
        </div>
        <p class="note-p" style="flex:1;margin:0;align-self:center">
          An instrument the bundled master does not cover takes the neutral, never a series colour.
          A grey slice reads as “not known”; a coloured one reads as a real category.</p>
      </div>

      <div class="note-h">The same allocation, both themes</div>
      <div class="grid g2" style="gap:14px">
        ${['dark', 'light'].map((t) => `
          <div class="stage thm-${t}">
            <div class="stage-h">${t === 'dark' ? 'Vault' : 'Ledger'}</div>
            <div style="display:flex;align-items:center;gap:16px">
              ${C.donut({ segments: D.rollup('group').map((g) => ({ label: g.label, value: g.current, color: g.color })), size: 112, thickness: 16, center: D.compact(D.PORTFOLIO.current) })}
              ${C.legend(D.rollup('group').map((g) => ({ label: g.label, color: g.color, right: `${g.share.toFixed(1)}%` })))}
            </div>
          </div>`).join('')}
      </div>
      <p class="note-p" style="margin-top:12px">
        Series colours are fixed hexes, not tokens — a slice must not change identity when the theme
        does. What changes around them is the track, the legend ink and the 1px separator between
        arcs, all of which resolve from the theme.</p>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">Why the order is frozen</div>
      <p class="note-p">
        The sequence was validated with a six-check dataviz pass in <b>both</b> themes. Reordering it
        breaks the guarantee, because the checks are on <b>adjacent</b> pairs — which slices touch is
        what a reader actually has to separate.</p>
      <table class="kv" style="margin-bottom:20px">
        <tr><td>Worst adjacent pair, protanopia</td><td>ΔE 8.1 <span class="tag ok">≥ 8</span></td></tr>
        <tr><td>Normal-vision floor</td><td>ΔE 18.2 <span class="tag ok">≥ 15</span></td></tr>
        <tr><td>Contrast on both grounds</td><td>all ≥ 3:1 <span class="tag ok">pass</span></td></tr>
        <tr><td>Series count</td><td>8</td></tr>
        <tr><td>Asset groups</td><td>7</td></tr>
      </table>

      <div class="note-h">The amber that was dropped</div>
      <p class="note-p">
        The original brief listed an amber slice beside gold. Under normal vision they are ΔE 14.8
        apart — below the 15 floor — so no reader could separate those two slices. The amber was
        removed rather than shipped as a near-duplicate.</p>
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <div style="flex:1;height:44px;border-radius:8px;background:#C19C3A"></div>
        <div style="flex:1;height:44px;border-radius:8px;background:#D9A83E;position:relative">
          <span style="position:absolute;inset:0;display:grid;place-items:center;font-size:10px;font-weight:700;color:rgba(0,0,0,.55)">DROPPED</span>
        </div>
      </div>

      <div class="note-h">Chart colour is never the only cue</div>
      <p class="note-p">
        Every coloured mark in the product is paired with a label, a glyph or a sign: donuts carry a
        legend, deltas carry an arrow, diverging bars carry a centre rule. Colour is the fast read,
        never the only one.</p>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Type
const RAMP = [
  ['display', 48, 56, 700, '-0.04em', 'Reserved for the cover and hero moments'],
  ['h1', 32, 40, 700, '-0.03em', 'Page title — PageIntro'],
  ['h2', 24, 32, 700, '-0.025em', 'Major section'],
  ['h3', 20, 28, 700, '-0.022em', 'Card group heading'],
  ['h4 / bodyLarge', 16, 24, 600, '-0.01em', 'Emphasised body'],
  ['body', 14, 22, 400, '-0.006em', 'The default — 14px, not 16px'],
  ['small', 13, 20, 400, '-0.006em', 'Dense rows, buttons'],
  ['caption', 12, 18, 400, '0', 'Sub-labels, hints'],
  ['eyebrow', 10.5, 14, 700, '0.1em', 'Uppercase overline above a figure'],
];

const typePage = page({
  part: 'Part A · Foundations', title: 'Typography', sub: 'Inter, everywhere, both clients', meta: 'design-system/tokens/typography.ts',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:2;min-width:0">
      ${RAMP.map(([name, size, lh, w, ls, use]) => `
        <div style="display:flex;align-items:baseline;gap:22px;padding:13px 0;border-bottom:1px solid #EEF2F0">
          <div style="flex:none;width:118px">
            <div style="font-size:11.5px;font-weight:700;color:#101613">${name}</div>
            <div style="font-size:10px;color:#A7B1AC;font-family:ui-monospace,monospace;margin-top:2px">${size}/${lh} · ${w} · ${ls}</div>
          </div>
          <div style="flex:1;min-width:0;font-size:${size}px;line-height:${lh}px;font-weight:${w};letter-spacing:${ls};color:#101613;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            Portfolio value ₹2,41,38,144</div>
          <div style="flex:none;width:210px;font-size:11px;color:#718079;line-height:1.45">${use}</div>
        </div>`).join('')}

      <div class="note-h">Numerals</div>
      <div class="grid g2">
        <div class="panel">
          <div class="panel-h">Tabular — the default</div>
          <div style="font-variant-numeric:tabular-nums;font-size:19px;font-weight:600;line-height:1.7;color:#101613">
            ₹2,41,38,144<br>₹1,11,11,111<br>₹9,99,99,999</div>
          <p class="panel-note">Digits share one advance width, so a column of figures aligns without
            a monospace face. Set globally on <code style="font-family:ui-monospace,monospace">body</code>.</p>
        </div>
        <div class="panel">
          <div class="panel-h">Proportional — what it would look like</div>
          <div style="font-variant-numeric:proportional-nums;font-size:19px;font-weight:600;line-height:1.7;color:#101613">
            ₹2,41,38,144<br>₹1,11,11,111<br>₹9,99,99,999</div>
          <p class="panel-note">The 1s narrow and the column ragged-edges. In a finance product that
            is not a nicety — it is a misread waiting to happen.</p>
        </div>
      </div>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">One family</div>
      <p class="note-p">
        <b>Inter</b> across both clients — bundled as four static weights in Flutter, loaded with the
        optical-size axis on web. There is no second display face: a display serif is reserved for
        marketing, and shipping one for six letters of wordmark would cost a font request for
        nothing.</p>

      <div class="note-h">Weights in use</div>
      <div style="margin-bottom:18px">
        ${[[400, 'Regular — body'], [500, 'Medium — labels'], [600, 'Semibold — emphasis, buttons'], [700, 'Bold — headings, figures']].map(([w, l]) => `
          <div style="display:flex;align-items:baseline;gap:14px;padding:6px 0">
            <span style="font-weight:${w};font-size:17px;color:#101613;width:44px">${w}</span>
            <span style="font-size:12px;color:#718079">${l}</span>
          </div>`).join('')}
      </div>

      <div class="note-h">Negative tracking</div>
      <p class="note-p">
        Display, h1 and h2 tighten (−0.04 to −0.025em). Inter at large sizes reads loose by default,
        and a headline that has not been tracked in is the clearest tell of an untuned interface.
        Body text takes a much smaller −0.006em; anything more hurts at 14px.</p>

      <div class="note-h">Font features</div>
      <table class="kv">
        <tr><td>font-variant-numeric</td><td>tabular-nums</td></tr>
        <tr><td>Features</td><td>tnum · cv01 · ss01</td></tr>
        <tr><td>Rendering</td><td>optimizeLegibility</td></tr>
        <tr><td>Smoothing</td><td>antialiased</td></tr>
        <tr><td>Base size</td><td>14px</td></tr>
        <tr><td>Base line height</td><td>1.5</td></tr>
      </table>
    </div>
  </div>`,
});

// ---------------------------------------------- Space, radius, elevation, motion
const spacePage = page({
  part: 'Part A · Foundations', title: 'Space, radius, elevation, motion', meta: 'Theme-invariant tokens',
  body: `
  <div class="grid g2" style="gap:30px;height:100%">
    <div>
      <div class="note-h" style="margin-top:0">The 8pt grid</div>
      <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:8px">
        ${[4, 8, 12, 16, 24, 32, 40, 48, 64].map((n, i) => `
          <div style="text-align:center">
            <div style="width:${n}px;height:${n}px;background:#087A56;border-radius:3px;opacity:${0.35 + i * 0.07}"></div>
            <div style="font-size:9.5px;color:#718079;margin-top:6px;font-family:ui-monospace,monospace">${n}</div>
            <div style="font-size:9px;color:#A7B1AC;font-family:ui-monospace,monospace">--s${i + 1}</div>
          </div>`).join('')}
      </div>
      <p class="note-p" style="margin-bottom:22px">
        Nine steps, all multiples of four. Layout constants are drawn from them rather than typed
        per screen: card padding 20, card gap 16, section gap 32, page padding 40 desktop / 16 mobile.</p>

      <div class="note-h">Radius is prescribed per component</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        ${[['button', 9], ['input', 10], ['card', 14], ['panel', 16], ['modal', 18]].map(([n, r]) => `
          <div style="text-align:center">
            <div style="width:96px;height:62px;border:1.5px solid #087A56;border-radius:${r}px;background:#E1F3EB"></div>
            <div style="font-size:11px;font-weight:600;color:#101613;margin-top:7px">${n}</div>
            <div style="font-size:10px;color:#718079;font-family:ui-monospace,monospace">${r}px</div>
          </div>`).join('')}
        <div style="text-align:center">
          <div style="width:96px;height:62px;border:1.5px solid #087A56;border-radius:999px;background:#E1F3EB"></div>
          <div style="font-size:11px;font-weight:600;color:#101613;margin-top:7px">pill</div>
          <div style="font-size:10px;color:#718079;font-family:ui-monospace,monospace">999px</div>
        </div>
      </div>
      <p class="note-p">
        “Everything is a giant rounded rectangle” is the generic look this system avoids: a button is
        tighter than a card, a card is tighter than a modal.</p>
    </div>

    <div>
      <div class="note-h" style="margin-top:0">Elevation is theme-specific</div>
      <div class="grid g2" style="gap:14px;margin-bottom:22px">
        <div class="stage thm-dark">
          <div class="stage-h">Vault — borders, no shadows</div>
          <div style="background:#151E1A;border:1px solid #26342E;border-radius:14px;padding:16px;font-size:12px;color:#A0ADA7">
            A drop shadow on a near-black canvas is invisible, and faking depth with a glow is what
            makes finance UI look like a crypto exchange.</div>
          <div style="margin-top:12px;background:#151E1A;border:1px solid #26342E;border-radius:14px;padding:14px;
            box-shadow:0 24px 48px -24px rgba(0,0,0,.75);font-size:11.5px;color:#718079">
            Only true overlays get one — <code style="font-family:ui-monospace,monospace">--shadow-3</code>.</div>
        </div>
        <div class="stage thm-light">
          <div class="stage-h">Ledger — one subtle shadow</div>
          <div style="background:#fff;border:1px solid #DCE4DF;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(16,22,19,.05);font-size:12px;color:#53625B">
            The page is #F5F7F5 and the card is #FFFFFF, so a card is the brightest surface. That one
            step gives depth before a shadow is involved.</div>
          <div style="margin-top:12px;background:#fff;border:1px solid #DCE4DF;border-radius:14px;padding:14px;
            box-shadow:0 2px 8px rgba(16,22,19,.08);font-size:11.5px;color:#718079">
            Hover lifts to <code style="font-family:ui-monospace,monospace">--shadow-2</code> and −2px.</div>
        </div>
      </div>

      <div class="note-h">Motion — one curve, three durations</div>
      <div style="border:1px solid #DCE4DF;border-radius:12px;padding:18px;background:#fff;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:18px">
          <svg width="120" height="88" viewBox="0 0 120 88" style="flex:none">
            <rect x="0.5" y="0.5" width="119" height="87" fill="none" stroke="#EEF2F0"/>
            <path d="M 0 88 C 48 88 72 0 120 0" fill="none" stroke="#087A56" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          <div>
            <div style="font-family:ui-monospace,monospace;font-size:12px;font-weight:600;color:#101613">cubic-bezier(0.4, 0, 0.2, 1)</div>
            <p class="note-p" style="margin:7px 0 0">
              One easing curve for the entire product. Standard material easing: quick to leave, slow
              to settle. A second curve buys nothing and costs consistency.</p>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px">
          ${[['--dur-fast', '150ms', 'Colour, border, opacity'], ['--dur', '250ms', 'Transform, layout'], ['--dur-slow', '400ms', 'Entrance, chart draw']].map(([t, d, u]) => `
            <div style="flex:1;border-radius:9px;background:#EDF2EF;padding:11px 13px">
              <div style="font-size:14px;font-weight:700;color:#101613">${d}</div>
              <div style="font-size:10px;color:#718079;font-family:ui-monospace,monospace;margin-top:2px">${t}</div>
              <div style="font-size:10.5px;color:#53625B;margin-top:5px;line-height:1.4">${u}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="note-h">Reduced motion</div>
      <p class="note-p">
        Under <code style="font-family:ui-monospace,monospace">prefers-reduced-motion</code> every
        duration collapses to 0.001ms and the hover lift is removed outright. Nothing is merely
        shortened — the transform itself is dropped.</p>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Layout
const layoutPage = page({
  part: 'Part A · Foundations', title: 'Layout &amp; grid', sub: 'Shell metrics and breakpoints', meta: 'Shell.tsx',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:1.7;min-width:0">
      <div class="note-h" style="margin-top:0">Desktop shell</div>
      <div style="border:1px solid #DCE4DF;border-radius:12px;overflow:hidden;background:#fff;margin-bottom:24px">
        <div style="display:flex;height:290px">
          <div style="width:248px;flex:none;background:#EDF2EF;border-right:1px solid #DCE4DF;position:relative">
            <span style="position:absolute;inset:0;display:grid;place-items:center;font-size:11.5px;font-weight:600;color:#53625B">Sidebar<br>248px</span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column">
            <div style="height:64px;flex:none;border-bottom:1px solid #DCE4DF;display:grid;place-items:center;font-size:11.5px;font-weight:600;color:#53625B">Topbar — 64px</div>
            <div style="flex:1;padding:24px 32px;position:relative">
              <div style="height:100%;border:1px dashed #C7D2CC;border-radius:8px;display:grid;place-items:center;
                font-size:11.5px;font-weight:600;color:#718079;text-align:center;line-height:1.6">
                Content well<br><span style="font-weight:400">max-width 1560px · centred · 32px page padding</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="note-h">Collapsed rail</div>
      <div style="border:1px solid #DCE4DF;border-radius:12px;overflow:hidden;background:#fff;margin-bottom:24px">
        <div style="display:flex;height:110px">
          <div style="width:76px;flex:none;background:#EDF2EF;border-right:1px solid #DCE4DF;display:grid;place-items:center;font-size:10.5px;font-weight:600;color:#53625B;text-align:center">Rail<br>76px</div>
          <div style="flex:1;display:grid;place-items:center;font-size:11.5px;color:#718079">
            Icons only, labels dropped. The collapse is a user preference, persisted — not a breakpoint.</div>
        </div>
      </div>

      <div class="note-h">Breakpoints</div>
      <table class="tbl">
        <thead><tr><th>Width</th><th>Navigation</th><th>Page padding</th><th>Notable</th></tr></thead>
        <tbody>
          <tr><td><b>&lt; 720px</b></td><td>Bottom bar, 5 tabs</td><td>16px</td><td>Topbar drops search and market pill; calendar becomes one column with a bottom sheet</td></tr>
          <tr><td><b>720 – 899px</b></td><td>Bottom bar + drawer</td><td>16px</td><td>Market pill and portfolio selector return</td></tr>
          <tr><td><b>900 – 1023px</b></td><td>Sidebar, 248px</td><td>32px</td><td>Bottom bar retires; sidebar toggle appears</td></tr>
          <tr><td><b>≥ 1024px</b></td><td>Sidebar or 76px rail</td><td>32px</td><td>Inline search field with ⌘K</td></tr>
          <tr><td><b>≥ 1560px</b></td><td>Sidebar or rail</td><td>32px</td><td>Content well stops growing and centres</td></tr>
        </tbody>
      </table>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">Metrics</div>
      <table class="kv">
        <tr><td>Sidebar</td><td>248px</td></tr>
        <tr><td>Collapsed rail</td><td>76px</td></tr>
        <tr><td>Mobile drawer</td><td>280px</td></tr>
        <tr><td>Topbar</td><td>64px</td></tr>
        <tr><td>Mobile topbar</td><td>56px</td></tr>
        <tr><td>Bottom bar</td><td>62px</td></tr>
        <tr><td>Content max</td><td>1560px</td></tr>
        <tr><td>Page padding</td><td>24px 32px</td></tr>
        <tr><td>Mobile padding</td><td>14px 16px</td></tr>
        <tr><td>Card padding</td><td>20px (14px mobile)</td></tr>
        <tr><td>Card gap</td><td>16px (10–12px mobile)</td></tr>
        <tr><td>Section gap</td><td>32px</td></tr>
        <tr><td>Min touch target</td><td>48px</td></tr>
        <tr><td>Button height</td><td>36px</td></tr>
        <tr><td>Input height</td><td>38px</td></tr>
        <tr><td>Icon button</td><td>36px</td></tr>
      </table>

      <div class="note-h">The sidebar carries every route</div>
      <p class="note-p">
        All twenty-six destinations are in the sidebar — a test asserts it. At twenty-plus a flat
        list stops being scannable, so five groups answer “what am I trying to do”: look at it, grow
        it, spend it, protect it, everything else.</p>

      <div class="note-h">Iconography</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:12px;color:#53625B">
        ${['layout-dashboard', 'trending-up', 'wallet', 'receipt', 'shield', 'gauge', 'calendar-days', 'coins', 'landmark', 'life-buoy', 'bell', 'settings'].map((n) => icon(n, 21)).join('')}
      </div>
      <table class="kv">
        <tr><td>Set</td><td>Lucide</td></tr>
        <tr><td>Box</td><td>24 units</td></tr>
        <tr><td>Stroke</td><td>2px, round cap and join</td></tr>
        <tr><td>Nav size</td><td>16.5px</td></tr>
        <tr><td>Action size</td><td>15–17px</td></tr>
        <tr><td>Colour</td><td>currentColor</td></tr>
      </table>
    </div>
  </div>`,
});

// ---------------------------------------------------------------- Brand
const ACCENTS = [
  ['Emerald', '#1B7F52', '#34C98A'], ['Sapphire', '#3B5FBF', '#6E93FF'], ['Amethyst', '#6E5BB8', '#A492DC'],
  ['Copper', '#B4642A', '#D98A4E'], ['Garnet', '#A83A45', '#E0707C'],
];

const brandPage = page({
  part: 'Part A · Foundations', title: 'Brand', sub: 'Mark, wordmark, lockup', meta: 'lib/brand.ts',
  body: `
  <div style="display:flex;gap:36px;height:100%">
    <div style="flex:1.5;min-width:0">
      <div class="note-h" style="margin-top:0">The lockup</div>
      <div style="border-radius:14px;background:#0D3D2B;padding:44px;display:flex;align-items:center;gap:26px;margin-bottom:18px">
        <img src="${MARK}" width="92" height="92" style="object-fit:contain" alt="">
        <div>
          <div style="font-size:34px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#F4F7F5">Khazana</div>
          <div style="margin-top:12px;display:flex;align-items:center;gap:12px;font-size:11.5px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#D9AD52">
            <span style="height:1px;width:24px;background:#D9AD52;opacity:.45;display:block"></span>
            Your wealth. Your vault.
            <span style="height:1px;width:24px;background:#D9AD52;opacity:.45;display:block"></span>
          </div>
        </div>
      </div>

      <div class="grid g3" style="margin-bottom:22px">
        <div class="panel" style="text-align:center">
          <div class="panel-h">On plate</div>
          <div style="background:#0D3D2B;border-radius:10px;padding:22px"><img src="${MARK}" width="56" height="56" style="object-fit:contain" alt=""></div>
        </div>
        <div class="panel" style="text-align:center">
          <div class="panel-h">On Vault</div>
          <div style="background:#080D0B;border-radius:10px;padding:22px"><img src="${MARK}" width="56" height="56" style="object-fit:contain" alt=""></div>
        </div>
        <div class="panel" style="text-align:center">
          <div class="panel-h">On Ledger</div>
          <div style="background:#F5F7F5;border-radius:10px;padding:22px"><img src="${MARK}" width="56" height="56" style="object-fit:contain" alt=""></div>
        </div>
      </div>

      <div class="note-h">Sizes in use</div>
      <div style="display:flex;align-items:flex-end;gap:26px;padding:16px 0">
        ${[96, 84, 58, 34, 26].map((s) => `
          <div style="text-align:center">
            <img src="${MARK}" width="${s}" height="${s}" style="object-fit:contain" alt="">
            <div style="font-size:10px;color:#718079;margin-top:7px;font-family:ui-monospace,monospace">${s}px</div>
            <div style="font-size:9.5px;color:#A7B1AC;margin-top:1px">${{ 96: 'gate', 84: 'gate · mobile', 58: 'cover', 34: 'sidebar', 26: 'mobile bar' }[s]}</div>
          </div>`).join('')}
      </div>
      <p class="note-p">
        The mark is the supplied artwork — a rendered gold hexagon with a keyhole and a K — not a
        redrawn approximation. Because it is raster it is used at 24px and above; below that the
        bevel and keyhole stop resolving, so the favicon set is pre-composited on the Vault plate at
        each exact size rather than scaled in the browser.</p>
    </div>

    <div style="flex:1;min-width:0;border-left:1px solid #DCE4DF;padding-left:34px">
      <div class="note-h" style="margin-top:0">Wordmark</div>
      <p class="note-p">
        Set in Inter at <b>0.22em</b> tracking, uppercase, 700. The tracking is what carries the
        identity — which is why a separate display face was not worth shipping for six letters.</p>
      <div style="border:1px solid #DCE4DF;border-radius:10px;padding:18px;background:#fff;margin-bottom:22px">
        <div style="font-size:22px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#101613">Khazana</div>
        <div style="font-size:10.5px;color:#A7B1AC;margin-top:8px;font-family:ui-monospace,monospace">Inter 700 · 0.22em · uppercase</div>
      </div>

      <div class="note-h">Strings</div>
      <table class="kv">
        <tr><td>Name</td><td>Khazana</td></tr>
        <tr><td>Title</td><td>Khazana — Private Wealth</td></tr>
        <tr><td>Tagline</td><td>Your wealth. Your vault.</td></tr>
        <tr><td>Bundle</td><td>com.khazana.app</td></tr>
      </table>

      <div class="note-h">User-selectable accents</div>
      <p class="note-p">
        Five accents replace the emerald interaction colour on request. Each ships a light and a dark
        step so contrast holds in both themes; gold is never among them, because gold is identity and
        identity is not a preference.</p>
      ${ACCENTS.map(([n, l, d]) => `
        <div style="display:flex;align-items:center;gap:12px;padding:7px 0">
          <span style="width:26px;height:26px;border-radius:8px;background:${l};flex:none"></span>
          <span style="width:26px;height:26px;border-radius:8px;background:${d};flex:none"></span>
          <span style="font-size:12.5px;font-weight:600;color:#101613">${n}</span>
          <span style="margin-left:auto;font-size:10px;color:#A7B1AC;font-family:ui-monospace,monospace">${l} · ${d}</span>
        </div>`).join('')}
    </div>
  </div>`,
});

export default [
  divider({
    part: 'Part A',
    title: 'Foundations',
    lede: `Colour, charts, type, space, radius, elevation, motion, layout and brand — the tokens
      every artboard in this document is assembled from, with the reasoning that fixed each value.`,
    contents: ['Colour', 'Chart palette', 'Typography', 'Space · radius · elevation · motion', 'Layout &amp; grid', 'Brand'],
  }),
  colourPage,
  chartsPage,
  typePage,
  spacePage,
  layoutPage,
  brandPage,
];
