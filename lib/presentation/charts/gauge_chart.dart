import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/semantic_colors.dart';

import 'chart_tokens.dart';

/// One band of a graded gauge, up to and including [upTo].
class GaugeBand {
  const GaugeBand(this.upTo, this.color, this.label);

  /// Upper bound of this band, on the gauge's own scale.
  final double upTo;
  final Color color;
  final String label;
}

/// The health-score bands, matching `FinancialHealth.gradeOf`.
/// Built from the active theme rather than declared `const`: the Vault steps
/// are unreadable on a Ledger card. See `core/theme/semantic_colors.dart`.
List<GaugeBand> healthBands(SemanticColors c) => [
      GaugeBand(40, c.expense, 'At risk'),
      GaugeBand(55, c.budgetWarn, 'Needs work'),
      GaugeBand(70, c.budgetWarn, 'Fair'),
      GaugeBand(85, c.income, 'Strong'),
      GaugeBand(100, c.income, 'Excellent'),
    ];

/// Budget consumption bands, matching the thresholds the Budget screen paints
/// its progress bars with.
///
/// Inverted relative to [kHealthBands] because the scales run opposite ways: a
/// high health score is good and a high budget fraction is not. Reusing the
/// health bands here would have painted a nearly-spent budget green.
List<GaugeBand> budgetBands(SemanticColors c) => [
      GaugeBand(70, c.budgetOk, 'On track'),
      GaugeBand(90, c.budgetWarn, 'Close to limit'),
      GaugeBand(100, c.budgetOver, 'At or over'),
    ];

/// A banded arc gauge for a single graded number.
///
/// Two things distinguish it from the progress rings used for goals and budgets,
/// and both are deliberate:
///
///  * It sweeps 240°, not 360°. A full ring reads as "proportion of a whole";
///    an open arc reads as "position on a scale", which is what a score is.
///  * [value] is nullable. Null renders an empty track and "Not yet tracked" —
///    not an arc at zero, which would show a failing grade for data the app
///    does not have. That one parameter is the entire honesty rule's UI
///    surface; if you find yourself passing `?? 0`, the rule has been lost.
///
/// The track is the active band's colour lightened toward the surface rather
/// than a neutral grey, so the state reads across the whole arc instead of only
/// its filled part. Band boundaries are drawn as thin surface-coloured ticks —
/// painting five coloured segments would put a rainbow on an ordered scale.
class GaugeChart extends StatelessWidget {
  const GaugeChart({
    required this.value,
    this.min = 0,
    this.max = 100,
    this.bands,
    this.size = 180,
    this.strokeWidth = 14,
    this.sweepDegrees = 240,
    this.label,
    this.sublabel,
    this.untrackedLabel = 'Not yet tracked',
    super.key,
  });

  /// The number to show. Null means there is nothing to show yet.
  final double? value;

  final double min;
  final double max;
  /// Defaults to [healthBands] for the active theme when null.
  final List<GaugeBand>? bands;
  final double size;
  final double strokeWidth;

  /// Total arc sweep. 240° leaves a clear gap at the bottom, so the shape reads
  /// as a gauge at a glance.
  final double sweepDegrees;

  /// Big centre text. Defaults to the rounded value, or an em dash when null.
  final String? label;

  /// Small centre text under [label] — usually the grade.
  final String? sublabel;

  final String untrackedLabel;

  Color _bandColor(List<GaugeBand> bands, double v, Color fallback) {
    for (final b in bands) {
      if (v <= b.upTo) return b.color;
    }
    return bands.isEmpty ? fallback : bands.last.color;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final resolvedBands = bands ?? healthBands(context.colors);
    final tracked = value != null;
    final clamped =
        tracked ? value!.clamp(min, max).toDouble() : min;
    final active = tracked
        ? _bandColor(resolvedBands, clamped, scheme.primary)
        : scheme.onSurfaceVariant;
    final track = tracked
        ? Color.lerp(active, scheme.surface, 0.85)!
        : scheme.onSurfaceVariant.withValues(alpha: 0.15);

    final fraction = max <= min ? 0.0 : (clamped - min) / (max - min);

    return Semantics(
      label: tracked
          ? '${label ?? clamped.round().toString()}'
              '${sublabel == null ? '' : ', $sublabel'}'
          : untrackedLabel,
      child: ExcludeSemantics(
        child: SizedBox(
          width: size,
          // An open-bottom arc leaves dead space below; trimming it keeps the
          // gauge from pushing everything under it down by a quarter of its
          // own height.
          height: size * 0.82,
          child: TweenAnimationBuilder<double>(
            // Sweeps up from empty. Keyed on the value so a score that changes
            // animates to its new position rather than restarting from zero.
            tween: Tween(begin: 0, end: tracked ? fraction : 0),
            duration: ChartTokens.entranceFor(context),
            curve: ChartTokens.entranceCurve,
            builder: (context, t, child) => CustomPaint(
              painter: _GaugePainter(
                fraction: t,
                sweepRadians: sweepDegrees * math.pi / 180,
                stroke: strokeWidth,
                active: active,
                track: track,
                tickColor: scheme.surface,
                bands: tracked ? resolvedBands : const [],
                min: min,
                max: max,
              ),
              child: child,
            ),
            child: Center(
              child: Padding(
                padding: EdgeInsets.only(top: size * 0.08),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label ?? (tracked ? '${clamped.round()}' : '—'),
                      style: text.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: active,
                        fontSize: size * 0.19,
                      ),
                    ),
                    Text(
                      tracked ? (sublabel ?? '') : untrackedLabel,
                      textAlign: TextAlign.center,
                      style: text.labelSmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({
    required this.fraction,
    required this.sweepRadians,
    required this.stroke,
    required this.active,
    required this.track,
    required this.tickColor,
    required this.bands,
    required this.min,
    required this.max,
  });

  final double fraction;
  final double sweepRadians;
  final double stroke;
  final Color active;
  final Color track;
  final Color tickColor;
  final List<GaugeBand> bands;
  final double min;
  final double max;

  @override
  void paint(Canvas canvas, Size size) {
    final radius = (math.min(size.width, size.height / 0.82) - stroke) / 2;
    final center = Offset(size.width / 2, radius + stroke / 2);
    final rect = Rect.fromCircle(center: center, radius: radius);
    // Centre the arc on straight-up: half the sweep either side of -90°.
    final start = -math.pi / 2 - sweepRadians / 2;

    canvas.drawArc(
      rect,
      start,
      sweepRadians,
      false,
      Paint()
        ..color = track
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round,
    );

    if (fraction > 0) {
      canvas.drawArc(
        rect,
        start,
        sweepRadians * fraction,
        false,
        Paint()
          ..color = active
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round,
      );
    }

    // Band boundaries, as gaps in the track rather than coloured segments.
    if (max > min) {
      final tick = Paint()
        ..color = tickColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = ChartTokens.markGap;
      for (final b in bands) {
        if (b.upTo <= min || b.upTo >= max) continue;
        final angle = start + sweepRadians * ((b.upTo - min) / (max - min));
        final inner = center +
            Offset(math.cos(angle), math.sin(angle)) * (radius - stroke / 2);
        final outer = center +
            Offset(math.cos(angle), math.sin(angle)) * (radius + stroke / 2);
        canvas.drawLine(inner, outer, tick);
      }
    }
  }

  @override
  bool shouldRepaint(_GaugePainter old) =>
      old.fraction != fraction ||
      old.active != active ||
      old.track != track ||
      old.stroke != stroke ||
      old.sweepRadians != sweepRadians;
}
