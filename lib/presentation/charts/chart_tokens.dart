import 'package:flutter/material.dart';

/// Mark specifications shared by every chart in the app.
///
/// These exist so the charts read as one system rather than as six independent
/// custom painters. They are duplicated deliberately in
/// `webapp/src/components/charts/tokens.ts` — the two clients draw the same
/// data, so a mark that differs between them is a bug, not a platform choice.
///
/// Keep this file free of anything data-specific. Colour lives in
/// `app_tokens.dart` (semantic) and `asset_group_colors.dart` (categorical);
/// this is geometry only.
abstract final class ChartTokens {
  /// Series lines. Round cap and join so a sharp reversal in a sparkline does
  /// not render a spike artifact at the vertex.
  static const double lineWidth = 2;
  static const StrokeCap lineCap = StrokeCap.round;
  static const StrokeJoin lineJoin = StrokeJoin.round;

  /// Area fill under a line: the series hue at this opacity. Low enough that
  /// two overlapping series stay separable, high enough to read as a fill.
  static const double areaFillOpacity = 0.10;

  /// The "latest value" dot on a trend line, and the ring that lifts it off a
  /// busy fill. The ring is painted in the surface colour, not white.
  static const double endMarkerRadius = 4;
  static const double endMarkerRingWidth = 2;

  /// Bars never get thicker than this — past it they stop reading as a bar
  /// chart and start reading as a stacked block.
  static const double maxBarThickness = 24;

  /// Bars round at the data end only; the baseline end stays square so the
  /// zero line reads as a hard edge.
  static const Radius barDataEndRadius = Radius.circular(4);

  /// Gap between touching marks (donut slices, sunburst arcs, adjacent bars).
  /// Painted as a *gap* — a surface-coloured stroke would show as a seam over
  /// the app's gradient backdrop, whose colour varies with position.
  static const double markGap = 2;

  /// Sunburst arc gap, in degrees. The angular equivalent of [markGap]; a fixed
  /// pixel gap would swallow small slices at the inner radius.
  static const double arcGapDegrees = 1.2;

  /// Gridlines: hairline, solid, never dashed. Dashes compete with the data.
  static const double gridLineWidth = 1;

  /// Charts below this many points render their empty state instead. A
  /// one-point "trend" is a dot pretending to be a line.
  static const int minSeriesPoints = 2;

  /// How long a chart takes to draw itself in.
  ///
  /// Long enough to read as motion, short enough that nobody waits for it. The
  /// entrance is the only animation these charts have: data changing under a
  /// user is not a moment to be decorative about.
  static const Duration entrance = Duration(milliseconds: 650);

  /// Easing for the entrance. Decelerating, so the chart arrives rather than
  /// snapping into place.
  static const Curve entranceCurve = Curves.easeOutCubic;

  /// Animation duration honouring the platform's reduce-motion setting.
  ///
  /// Widget tests set `disableAnimations` too, which is what keeps goldens
  /// deterministic without every test having to pump for the full duration.
  static Duration entranceFor(BuildContext context) =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false
          ? Duration.zero
          : entrance;
}
