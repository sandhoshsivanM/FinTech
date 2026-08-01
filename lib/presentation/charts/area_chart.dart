import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../core/theme/app_tokens.dart';
import 'chart_tokens.dart';

/// A trend line with a gradient fill beneath it.
///
/// Replaces two near-identical private painters — one on the Dashboard, one on
/// Reports — which had already drifted in stroke width and end-dot treatment.
/// The empty state is part of the widget rather than each caller's problem,
/// because "not enough data yet" is the common case on a new vault and every
/// caller was getting it slightly differently.
class AreaChart extends StatelessWidget {
  const AreaChart({
    required this.values,
    this.height = 140,
    this.color,
    this.fillOpacity = ChartTokens.areaFillOpacity,
    this.showEndDot = true,
    this.emptyLabel = 'Not enough data yet',
    this.semanticLabel,
    super.key,
  });

  /// The series, oldest first. Fewer than two points renders the empty state.
  final List<double> values;

  final double height;

  /// Series colour. Defaults to the app accent.
  final Color? color;

  final double fillOpacity;
  final bool showEndDot;
  final String emptyLabel;

  /// What a screen reader should say. A line chart is otherwise silent.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = color ?? AppColors.accent;

    if (values.length < ChartTokens.minSeriesPoints) {
      return _Empty(label: emptyLabel, height: height);
    }
    final min = values.reduce((a, b) => a < b ? a : b);
    final max = values.reduce((a, b) => a > b ? a : b);
    // A flat series has no trend to draw, and normalising by its zero range
    // would put every point at NaN.
    if ((max - min).abs() < 1e-9) {
      return _Empty(label: emptyLabel, height: height);
    }

    return Semantics(
      label: semanticLabel,
      child: ExcludeSemantics(
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: CustomPaint(
            painter: _AreaPainter(
              values: values,
              min: min,
              max: max,
              color: c,
              fillOpacity: fillOpacity,
              showEndDot: showEndDot,
              surface: scheme.surface,
            ),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.label, required this.height});
  final String label;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: height,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: ChartTokens.gridLineWidth,
              color: scheme.outlineVariant,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

class _AreaPainter extends CustomPainter {
  _AreaPainter({
    required this.values,
    required this.min,
    required this.max,
    required this.color,
    required this.fillOpacity,
    required this.showEndDot,
    required this.surface,
  });

  final List<double> values;
  final double min;
  final double max;
  final Color color;
  final double fillOpacity;
  final bool showEndDot;
  final Color surface;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 10.0;
    final dx = size.width / (values.length - 1);
    double y(double v) =>
        size.height - pad - ((v - min) / (max - min)) * (size.height - pad * 2);

    final line = Path()..moveTo(0, y(values.first));
    for (var i = 1; i < values.length; i++) {
      line.lineTo(i * dx, y(values[i]));
    }

    final fill = Path.from(line)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(
      fill,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, 0),
          Offset(0, size.height),
          [
            color.withValues(alpha: fillOpacity + 0.06),
            color.withValues(alpha: 0),
          ],
        ),
    );

    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = ChartTokens.lineWidth
        ..strokeCap = ChartTokens.lineCap
        ..strokeJoin = ChartTokens.lineJoin,
    );

    if (showEndDot) {
      final end = Offset(size.width, y(values.last));
      // Ring first, in the surface colour, so the dot stays visible where the
      // line crosses its own fill.
      canvas.drawCircle(
        end,
        ChartTokens.endMarkerRadius + ChartTokens.endMarkerRingWidth / 2,
        Paint()..color = surface,
      );
      canvas.drawCircle(
          end, ChartTokens.endMarkerRadius, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(_AreaPainter old) =>
      old.values != values || old.color != color || old.min != min || old.max != max;
}
