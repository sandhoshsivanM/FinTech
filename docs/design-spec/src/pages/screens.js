/**
 * Part C — every route as an artboard, Vault then Ledger.
 *
 * Each screen module exports `art` (the 1440px mockup) and `meta`. The same
 * `art` string produces both frames: the theme is a class on the wrapper, and
 * the app's own rule that only colour changes between themes is what makes
 * that sound.
 */
import { divider, screenPage } from '../doc.js';

import dashboard from '../screens/dashboard.js';
import overview from '../screens/overview.js';
import invest from '../screens/invest.js';
import money from '../screens/money.js';
import protect from '../screens/protect.js';
import more from '../screens/more.js';
import gate from '../screens/gate.js';

/** In sidebar order — Overview, Invest, Money, Protect, More, then the gate. */
const SCREENS = [
  ...dashboard,
  ...overview,
  ...invest,
  ...money,
  ...protect,
  ...more,
  ...gate,
];

function spread(s) {
  const common = { name: s.meta.name, route: s.meta.route, art: s.art, height: s.meta.height ?? 940, purpose: s.meta.purpose, notes: s.meta.notes ?? [], specs: s.meta.specs ?? [] };
  return [
    screenPage({ ...common, theme: 'dark' }),
    screenPage({ ...common, theme: 'light', notes: [], purpose: '', specs: [], extra: lightRail(s) }),
  ];
}

/**
 * The light frame does not repeat the annotations — they describe a layout that
 * has not changed. It carries the theme delta instead, which is the only thing
 * this second frame exists to show.
 */
function lightRail(s) {
  return `
    <div class="note-h" style="margin-top:0">Same artboard, other theme</div>
    <p class="note-p">
      This is the identical mockup source as the preceding sheet with one class changed.
      Spacing, type, sizing and layout are byte-identical; only the palette resolves
      differently. ${s.meta.themeNote ?? ''}
    </p>
    <div class="note-h">What changes</div>
    <table class="kv">
      <tr><td>Canvas</td><td>#080D0B → #F5F7F5</td></tr>
      <tr><td>Card</td><td>#151E1A → #FFFFFF</td></tr>
      <tr><td>Hairline</td><td>#26342E → #DCE4DF</td></tr>
      <tr><td>Body text</td><td>#F4F7F5 → #101613</td></tr>
      <tr><td>Interaction</td><td>#20C98A → #087A56</td></tr>
      <tr><td>Elevation</td><td>borders only → 1px shadow</td></tr>
    </table>
    <div class="note-h">Why the emerald darkens</div>
    <p class="note-p">
      #20C98A on a white card reads 2.1:1 — unusable for text or a small mark. Ledger
      steps the same hue down to <b>#087A56</b> (5.6:1) and pairs it with white, while
      Vault keeps the bright step against near-black ink at 9.4:1. The two are the same
      brand colour at the lightness each background can carry.
    </p>`;
}

export default [
  divider({
    part: 'Part C',
    title: 'Screens',
    lede: `All twenty-eight routes the web client serves, each drawn twice — Vault then Ledger —
      and populated with the demo vault. The order is the sidebar's, because that is the order a
      user meets them in.`,
    contents: ['Overview · 3', 'Invest · 6', 'Money · 7', 'Protect · 4', 'More · 6', 'Gate · 1'],
  }),
  ...SCREENS.flatMap(spread),
];
