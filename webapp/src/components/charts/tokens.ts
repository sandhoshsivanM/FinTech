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
} as const;
