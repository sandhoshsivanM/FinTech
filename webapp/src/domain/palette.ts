/**
 * The categorical chart palette.
 *
 * ## Why this replaced the previous one
 *
 * The old palette was eight hues spaced roughly evenly around the wheel at
 * near-identical lightness. That is technically defensible — measured, it
 * separated well — but it is also precisely the shape of a *default* palette,
 * and it read as one. A review called it generic, and the review was right.
 *
 * Two structural changes carry the difference:
 *
 * 1. **A value per theme.** The old set used ONE hex for both grounds, on the
 *    reasoning that a single lightness band could serve both. It can, but only
 *    by staying in the middle of the range — which is what made the colours look
 *    washed out on dark and weak on light at the same time. Each theme now gets
 *    its own step of the same hue: lifted on Vault, dropped on Ledger.
 *    (`ASSET_GROUP_META` already had `light`/`dark` fields; they were identical.)
 *
 * 2. **Lightness and chroma vary on purpose.** Hue spacing is deliberately
 *    uneven and the lightness ramp alternates, so neighbours differ on more than
 *    one axis. That is what makes a palette look composed rather than generated,
 *    and it is also what keeps CVD separation up without resorting to neon.
 *
 * Brand anchors are pinned for MEANING and must not move: equity is the brand
 * emerald, gold is gold. An earlier palette rendered the Gold group green, which
 * reads as a bug the moment anyone looks at the legend.
 *
 * ## The order is load-bearing
 *
 * Separation is guaranteed for ADJACENT pairs in [SERIES_ORDER]. Charts must
 * take a colour from a stable key — the group's identity — and never from a
 * value sort. Sorting slices largest-first re-orders adjacency and can put two
 * far-apart-in-the-list colours side by side. `palette.test.ts` asserts both the
 * adjacent bound and the any-pair bound so the cost of getting this wrong is
 * visible rather than theoretical.
 *
 * ## The numbers are checked, not claimed
 *
 * Every figure quoted here is asserted in `palette.test.ts` using
 * `domain/colorScience.ts`. The previous palette's ΔE figures lived only in
 * comments and disagreed with each other across files.
 */
import { oklchToLinear, linearToHex } from './colorScience';

/** A series entry, authored in OKLCH. Hue and chroma carry identity across themes. */
interface Step {
  key: string;
  label: string;
  /** Hue angle, degrees. Constant across themes — the colour keeps its name. */
  hue: number;
  /** Chroma. Constant across themes. */
  chroma: number;
  /** OKLCH lightness on the dark ground. */
  dark: number;
  /** OKLCH lightness on the light ground. */
  light: number;
}

/**
 * The eight series, in render order.
 *
 * The first seven map 1:1 onto the asset groups (`ASSET_GROUP_ORDER`); the
 * eighth is the spare used by dimensions with no fixed taxonomy — sector,
 * market cap — where slices are keyed by name rather than by group.
 */
const STEPS: Step[] = [
  // Brand emerald. Pinned: equity is the product's own colour.
  { key: 'equity', label: 'Equity', hue: 158, chroma: 0.128, dark: 0.708, light: 0.540 },
  // Periwinkle. Far from emerald on every axis, which is what keeps the two
  // largest groups in a typical book separable at a glance.
  { key: 'debt', label: 'Debt', hue: 280, chroma: 0.110, dark: 0.761, light: 0.606 },
  // Brass. Pinned: gold is gold.
  { key: 'gold', label: 'Gold', hue: 88, chroma: 0.122, dark: 0.708, light: 0.604 },
  // Steel blue, pushed cold and away from emerald: those two converge under
  // tritanopia, and this pair was the binding constraint on the whole set.
  { key: 'real_estate', label: 'Real Estate', hue: 245, chroma: 0.100, dark: 0.688, light: 0.518 },
  // Coral.
  { key: 'retirement', label: 'Retirement', hue: 42, chroma: 0.132, dark: 0.722, light: 0.480 },
  // Aqua, held to low chroma so it reads as a tint of the family rather than a
  // second brand colour competing with emerald.
  { key: 'crypto', label: 'Crypto', hue: 200, chroma: 0.082, dark: 0.779, light: 0.616 },
  // Orchid.
  { key: 'cash', label: 'Cash', hue: 338, chroma: 0.120, dark: 0.688, light: 0.498 },
  // Olive. Off the equity hue on purpose — as the spare it can land beside any
  // group, so it must not read as a second green.
  { key: 'spare', label: 'Other', hue: 118, chroma: 0.094, dark: 0.711, light: 0.518 },
];

const hexOf = (s: Step, theme: 'dark' | 'light') =>
  linearToHex(oklchToLinear(s[theme], s.chroma, s.hue));

/** Render order. Adjacency in this list is what the ΔE guarantee covers. */
export const SERIES_ORDER = STEPS.map((s) => s.key);

/** `#RRGGBB` for every series, in render order, per theme. */
export const SERIES_DARK: string[] = STEPS.map((s) => hexOf(s, 'dark'));
export const SERIES_LIGHT: string[] = STEPS.map((s) => hexOf(s, 'light'));

/** Both steps of one series, by key. */
export const SERIES_BY_KEY: Record<string, { label: string; dark: string; light: string }> =
  Object.fromEntries(
    STEPS.map((s) => [s.key, { label: s.label, dark: hexOf(s, 'dark'), light: hexOf(s, 'light') }]),
  );

/**
 * The grounds a series mark is drawn on — the card surface, not the page canvas.
 * Contrast is measured against these.
 */
export const SURFACE = { dark: '#151E1A', light: '#FFFFFF' } as const;

/**
 * Reserved neutral for "Unclassified" / "Other".
 *
 * Deliberately outside the series: a grey slice reads as "not known", a coloured
 * one reads as a real category. It is exempt from the separation guarantee
 * because it is a coverage fact, not a member of the taxonomy.
 */
export const SERIES_NEUTRAL = { dark: '#718079', light: '#A7B1AC' } as const;
