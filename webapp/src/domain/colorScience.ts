/**
 * The colour maths behind the chart palette.
 *
 * This exists because the palette's guarantee used to be prose. Six separate
 * comment blocks quoted ΔE figures — and quoted them *differently*: the two
 * stacked headers in `asset_group_colors.dart` claim 9.1 under protanopia and
 * 12.7 under deuteranopia for the same seven colours. Nothing in the repo could
 * fail if a value drifted, so none of those numbers meant anything.
 *
 * Now they are computed. `palette.test.ts` asserts them.
 *
 * Method, and why each piece was chosen:
 *  - **Machado (2009)** matrices for colour-vision deficiency, applied to
 *    LINEAR RGB. Applying them to gamma-encoded values — the common mistake —
 *    inflates separation and would let a failing palette pass.
 *  - **CIE76 ΔE** in Lab. Cruder than CIEDE2000, but this is a threshold test on
 *    well-separated categorical hues, not a just-noticeable-difference study,
 *    and CIE76 is conservative here: it never reports MORE separation than
 *    CIEDE2000 for these ranges.
 *  - **WCAG relative luminance** for contrast against the card surface. A series
 *    colour is a graphic object, so 3:1 is the bar, not 4.5:1.
 */

/* -------------------------------------------------------------------------- */
/* sRGB                                                                        */
/* -------------------------------------------------------------------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** sRGB transfer function, gamma-encoded → linear. */
const toLinear = (u: number) =>
  u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);

/** Linear → gamma-encoded. */
const toGamma = (u: number) =>
  u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(clamp01(u), 1 / 2.4) - 0.055;

export type Rgb = [number, number, number];

/** `#RRGGBB` → linear-light RGB. Throws on anything else, so a typo cannot pass silently. */
export function hexToLinear(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [
    toLinear(((n >> 16) & 255) / 255),
    toLinear(((n >> 8) & 255) / 255),
    toLinear((n & 255) / 255),
  ];
}

/**
 * Linear-light RGB → `#rrggbb`.
 *
 * Lowercase to match the rest of the codebase — `mix()` in `domain/portfolio.ts`
 * emits lowercase, and a ramp that starts uppercase and continues lowercase is
 * the kind of thing that shows up in a DOM snapshot as noise.
 */
export function linearToHex(rgb: Rgb): string {
  return (
    '#'
    + rgb
      .map((u) => Math.round(clamp01(toGamma(u)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

/* -------------------------------------------------------------------------- */
/* OKLCH — how the palette is authored                                         */
/* -------------------------------------------------------------------------- */

/**
 * OKLCH → linear RGB.
 *
 * The palette is authored in OKLCH rather than hex because lightness is the
 * axis that actually carries the design: hue alone spaced evenly around the
 * wheel is what a default palette looks like. Authoring in a perceptual space
 * makes "step the lightness deliberately" an editable decision rather than a
 * happy accident of hand-picked hexes.
 */
export function oklchToLinear(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** True when the colour survives the round trip into sRGB without clipping. */
export const inGamut = (rgb: Rgb): boolean =>
  rgb.every((u) => u >= -0.002 && u <= 1.002);

/* -------------------------------------------------------------------------- */
/* Colour-vision deficiency                                                    */
/* -------------------------------------------------------------------------- */

export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

/** Machado, Oliveira & Fernandes (2009), severity 1.0. Operates on LINEAR RGB. */
const CVD: Record<Vision, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.303900],
  ],
};

export function simulate(rgb: Rgb, vision: Vision): Rgb {
  const m = CVD[vision];
  return [
    m[0][0] * rgb[0] + m[0][1] * rgb[1] + m[0][2] * rgb[2],
    m[1][0] * rgb[0] + m[1][1] * rgb[1] + m[1][2] * rgb[2],
    m[2][0] * rgb[0] + m[2][1] * rgb[1] + m[2][2] * rgb[2],
  ];
}

/* -------------------------------------------------------------------------- */
/* Difference and contrast                                                     */
/* -------------------------------------------------------------------------- */

/** Linear RGB → CIE Lab (D65). */
function toLab(rgb: Rgb): Rgb {
  const X = 0.4124 * rgb[0] + 0.3576 * rgb[1] + 0.1805 * rgb[2];
  const Y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const Z = 0.0193 * rgb[0] + 0.1192 * rgb[1] + 0.9505 * rgb[2];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE between two hex colours, as seen under `vision`. */
export function deltaE(a: string, b: string, vision: Vision = 'normal'): number {
  const A = toLab(simulate(hexToLinear(a), vision));
  const B = toLab(simulate(hexToLinear(b), vision));
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

const luminance = (rgb: Rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hexToLinear(a)), luminance(hexToLinear(b))]
    .sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The worst ΔE between any two colours that can end up ADJACENT.
 *
 * Takes the sequence in render order and only compares neighbours, because
 * adjacency is what a reader actually has to separate — two slices on opposite
 * sides of a donut being similar costs nothing.
 *
 * This is exactly why render order must be a stable key and never a value sort:
 * re-order the sequence and a different, possibly much worse, pair becomes
 * adjacent. See `worstAnyPair`.
 */
export function worstAdjacent(
  hexes: readonly string[],
  vision: Vision,
): { deltaE: number; between: [number, number] } {
  let worst = Infinity;
  let between: [number, number] = [0, 0];
  for (let i = 0; i < hexes.length - 1; i++) {
    const d = deltaE(hexes[i], hexes[i + 1], vision);
    if (d < worst) { worst = d; between = [i, i + 1]; }
  }
  return { deltaE: worst, between };
}

/**
 * The worst ΔE between ANY two colours in the set.
 *
 * The bound that applies once order is not guaranteed — which is the situation
 * a value-sorted chart creates. If this is below the threshold, sorting slices
 * by size can put two indistinguishable colours side by side.
 */
export function worstAnyPair(
  hexes: readonly string[],
  vision: Vision,
): { deltaE: number; between: [number, number] } {
  let worst = Infinity;
  let between: [number, number] = [0, 0];
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      const d = deltaE(hexes[i], hexes[j], vision);
      if (d < worst) { worst = d; between = [i, j]; }
    }
  }
  return { deltaE: worst, between };
}

/** The thresholds the palette is held to. */
export const DATAVIZ = {
  /** Adjacent categorical marks, under any simulated CVD. */
  minAdjacentCvdDeltaE: 8,
  /** Adjacent categorical marks, normal vision. */
  minAdjacentNormalDeltaE: 15,
  /** A graphic object against its ground — WCAG 1.4.11 non-text contrast. */
  minContrastVsSurface: 3,
} as const;
