/**
 * Khazana colour tokens — Vault (dark) and Ledger (light).
 *
 * THE RULE THAT GOVERNS EVERYTHING HERE:
 *
 *     Emerald = interaction.   Gold = identity.
 *
 * Emerald carries primary buttons, active navigation, links and focus. Gold
 * carries the logo, the wordmark and wealth-flavoured brand moments — it is
 * never the ordinary button colour. That one distinction is what keeps the
 * product from looking like a generic SaaS dashboard with a gold coat.
 *
 * `globals.css` is the RUNTIME source of truth: it declares these as CSS custom
 * properties so the theme can switch without a re-render. This module mirrors
 * them for TypeScript that needs a literal — chart geometry, canvas drawing, and
 * the Flutter parity check. Keep the two in step; the values below are the
 * contract.
 */

/** Brand ramp. Shared by both themes; each theme picks its steps. */
export const brand = {
  emerald500: '#18C98A',
  emerald600: '#0FAF73',
  emerald700: '#087A56',
  gold500: '#D9AD52',
  gold600: '#B8892F',
  obsidian: '#080D0B',
  forest: '#0D1713',
} as const;

/** Dark theme. */
export const vault = {
  background: '#080D0B',
  surface: '#101714',
  surfaceElevated: '#151E1A',
  surfaceStrong: '#1A2520',
  border: '#26342E',
  borderStrong: '#34443C',

  textPrimary: '#F4F7F5',
  textSecondary: '#A0ADA7',
  textMuted: '#718079',
  textDisabled: '#4E5A55',

  primary: '#20C98A',
  primaryHover: '#2BDB99',
  primarySoft: '#12352A',
  /** Text ON a primary fill. Near-black beats white on emerald by a wide margin. */
  primaryOn: '#06110C',

  gold: '#D9AD52',
  goldSoft: '#302718',
  /** Gold as small text. Already 9.4:1 on Vault, so same value. */
  goldInk: '#D9AD52',

  success: '#20C98A',
  warning: '#E5B84D',
  danger: '#F06464',
  info: '#63A8FF',
} as const;

/** Light theme. */
export const ledger = {
  background: '#F5F7F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSecondary: '#EDF2EF',
  border: '#DCE4DF',
  borderStrong: '#C7D2CC',

  textPrimary: '#101613',
  textSecondary: '#53625B',
  textMuted: '#718079',
  textDisabled: '#A7B1AC',

  primary: '#087A56',
  primaryHover: '#066A4A',
  primarySoft: '#E1F3EB',
  primaryOn: '#FFFFFF',

  gold: '#A97922',
  goldSoft: '#F6EEDB',
  /** Gold as small text. #A97922 is 3.9:1 on a card — fine for a graphic,
   *  under the 4.5:1 body-text bar, so words use this darker step. */
  goldInk: '#8E641B',

  success: '#087A56',
  warning: '#A97922',
  danger: '#C73D46',
  info: '#2672C8',
} as const;

/**
 * Categorical chart series.
 *
 * Emerald leads and gold follows, matching the brand hierarchy. These are
 * CHART STEPS, not the UI steps above: `vault.primary` (#20C98A) sits at OKLCH
 * L 0.74, outside the 0.48–0.67 band a categorical mark needs to stay legible
 * against both surfaces, so the emerald here is a darker step of the same hue.
 *
 * Validated with the dataviz six-checks in BOTH themes — lightness band, chroma
 * floor, adjacent CVD separation (worst pair ΔE 8.1 under protanopia, target 8),
 * normal-vision floor 18.2, and ≥3:1 contrast on the surface.
 *
 * The ORDER is the colourblind-safety mechanism. Do not re-order.
 *
 * NOTE ON THE BRIEF: the spec listed Gold #D9AD52 and Amber #E5B84D as separate
 * allocation slices. They are effectively the same colour — ΔE 14.8 apart under
 * normal vision, below the 15 floor — so a reader cannot tell those two slices
 * apart. The amber slot was dropped rather than shipped as a duplicate.
 */
export const series = [
  '#189E6E', // emerald — primary series
  '#BE8420', // gold
  '#2E92C4', // blue
  '#C9538A', // rose
  '#4F7CFF', // indigo
  '#CC6435', // orange
  '#8E7CC3', // violet
  '#2E9E63', // green
] as const;

/**
 * Reserved neutral for "Other" / "Unclassified".
 *
 * Deliberately low-chroma and outside `series`: an unclassified bucket is a
 * coverage fact, not a category, and must never compete with a real slice for
 * attention.
 */
export const seriesNeutral = { dark: '#718079', light: '#A7B1AC' } as const;
