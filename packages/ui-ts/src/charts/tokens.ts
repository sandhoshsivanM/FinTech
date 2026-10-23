/**
 * Mark specifications shared by every chart in the app.
 *
 * The twin of `lib/presentation/charts/chart_tokens.dart`. The two clients draw
 * the same data, so a mark that differs between them is a bug, not a platform
 * choice — keep the two files in step.
 *
 * Geometry only. Colour lives in CSS custom properties (semantic) and
 * `domain/portfolio.ts`'s ASSET_GROUP_META (categorical).
 */
export const CHART = {
  /** Series lines. Round cap/join so a sharp reversal draws no spike artifact. */
  lineWidth: 2,
  lineCap: 'round',
  lineJoin: 'round',

  /** Area fill under a line: the series hue at this opacity. */
  areaFillOpacity: 0.1,

  /** The "latest value" dot, and the surface-coloured ring that lifts it off a busy fill. */
  endMarkerRadius: 4,
  endMarkerRingWidth: 2,

  /** Past this, a bar stops reading as a bar and starts reading as a block. */
  maxBarThickness: 24,

  /** Bars round at the data end only; the baseline end stays square. */
  barDataEndRadius: 4,

  /**
   * Gap between touching marks. Painted as a gap, not a surface-coloured
   * stroke — the app's backdrop varies with position, so a "matching" stroke
   * would show as a seam.
   */
  markGap: 2,

  /** Sunburst arc gap in degrees; a fixed pixel gap swallows small inner slices. */
  arcGapDegrees: 1.2,

  /** Gridlines: hairline, solid, never dashed. Dashes compete with the data. */
  gridLineWidth: 1,

  /** Below this, render the empty state. A one-point "trend" is a dot pretending to be a line. */
  minSeriesPoints: 2,

  /**
   * How long a chart takes to draw itself in. Long enough to read as motion,
   * short enough that nobody waits for it. The entrance is the only animation
   * these charts have — data changing under a user is not a moment to be
   * decorative about.
   *
   * Matches ChartTokens.entrance in chart_tokens.dart.
   */
  entranceMs: 650,

  /** Decelerating, so a chart arrives rather than snapping into place. */
  entranceEasing: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
} as const;

/**
 * True when the viewer has asked for less motion.
 *
 * Honouring this is not optional: vestibular disorders make large sweeping
 * motion genuinely unpleasant, and a chart entrance is decoration.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
