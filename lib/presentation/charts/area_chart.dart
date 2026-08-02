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
class AreaChart extends StatefulWidget {
  const AreaChart({
    required this.values,
    this.height = 140,
    this.color,
    this.fillOpacity = ChartTokens.areaFillOpacity,
    this.showEndDot = true,
    this.emptyLabel = 'Not enough data yet',
    this.semanticLabel,
    this.labelAt,
    this.formatValue,
    super.key,
  });

  /// What to call the point at [index] — a date, usually. Null falls back to
  /// the position in the series, which is honest but rarely useful.
  final String Function(int index)? labelAt;

  /// How to render a value in the hover readout. Defaults to a plain number;
  /// money callers pass `Money.format` so the readout matches the rest of the
  /// screen rather than inventing its own notation.
  final String Function(double value)? formatValue;

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
  State<AreaChart> createState() => _AreaChartState();
}

class _AreaChartState extends State<AreaChart> {
  /// Index of the point under the pointer, or null when it is elsewhere.
  int? _hover;

  /// Maps an x position to the nearest point.
  ///
  /// Nearest, not "the one to the left": with a handful of monthly points each
  /// is tens of pixels wide, and floor() makes the readout lag the cursor by up
  /// to a full step near the right of each band.
  int _indexFor(double dx, double width) {
    final n = widget.values.length;
    if (n < 2) return 0;
    final step = width / (n - 1);
    return (dx / step).round().clamp(0, n - 1);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = widget.color ?? AppColors.accent;
    final values = widget.values;

    if (values.length < ChartTokens.minSeriesPoints) {
      return _Empty(label: widget.emptyLabel, height: widget.height);
    }
    final min = values.reduce((a, b) => a < b ? a : b);
    final max = values.reduce((a, b) => a > b ? a : b);
    // A flat series has no trend to draw, and normalising by its zero range
    // would put every point at NaN.
    if ((max - min).abs() < 1e-9) {
      return _Empty(label: widget.emptyLabel, height: widget.height);
    }

    final hover = _hover;
    final readout = hover == null
        ? null
        : [
            if (widget.labelAt != null) widget.labelAt!(hover),
            widget.formatValue?.call(values[hover]) ??
                values[hover].toStringAsFixed(0),
          ].join(' · ');

    return Semantics(
      label: widget.semanticLabel,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: widget.height,
              width: double.infinity,
              child: LayoutBuilder(
                builder: (context, c2) => MouseRegion(
                  onHover: (e) {
                    final i = _indexFor(e.localPosition.dx, c2.maxWidth);
                    if (i != _hover) setState(() => _hover = i);
                  },
                  onExit: (_) => setState(() => _hover = null),
                  child: TweenAnimationBuilder<double>(
                    // Draws left to right, the direction the data is read in.
                    tween: Tween(begin: 0, end: 1),
                    duration: ChartTokens.entranceFor(context),
                    curve: ChartTokens.entranceCurve,
                    builder: (context, t, _) => CustomPaint(
                      painter: _AreaPainter(
                        values: values,
                        min: min,
                        max: max,
                        color: c,
                        fillOpacity: widget.fillOpacity,
                        showEndDot: widget.showEndDot,
                        surface: scheme.surface,
                        progress: t,
                        hover: hover,
                        outline: scheme.outlineVariant,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Reserved whether or not the pointer is over the chart: letting
            // the readout appear and disappear would jump every widget below it
            // each time the mouse crossed the line.
            SizedBox(
              height: 18,
              child: readout == null
                  ? null
                  : Text(readout,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                          fontWeight: FontWeight.w600)),
            ),
          ],
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
    this.progress = 1,
    this.hover,
    this.outline,
  });

  final List<double> values;
  final double min;
  final double max;
  final Color color;
  final double fillOpacity;
  final bool showEndDot;
  final Color surface;

  /// 0..1 entrance progress. Clips the drawing horizontally rather than
  /// interpolating the values, so no frame ever shows a number the data does
  /// not contain.
  final double progress;

  /// Index of the hovered point, drawn as a crosshair and a marker.
  final int? hover;
  final Color? outline;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    if (progress < 1) {
      canvas.save();
      canvas.clipRect(Rect.fromLTWH(0, 0, size.width * progress, size.height));
    }
    _paintSeries(canvas, size);
    if (progress < 1) canvas.restore();
  }

  void _paintSeries(Canvas canvas, Size size) {
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

    // Only once the line has actually reached it — a marker sitting ahead of
    // the line would claim a value that has not been drawn yet.
    if (showEndDot && progress >= 1) {
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

    // Crosshair last, so it sits above the fill and the line rather than being
    // washed out by them.
    final h = hover;
    if (h != null && h >= 0 && h < values.length && progress >= 1) {
      final dx = values.length < 2
          ? size.width
          : size.width * (h / (values.length - 1));
      final dy = y(values[h]);
      canvas.drawLine(
        Offset(dx, 0),
        Offset(dx, size.height),
        Paint()
          ..color = (outline ?? color).withValues(alpha: 0.7)
          ..strokeWidth = ChartTokens.gridLineWidth,
      );
      canvas.drawCircle(
        Offset(dx, dy),
        ChartTokens.endMarkerRadius + ChartTokens.endMarkerRingWidth / 2,
        Paint()..color = surface,
      );
      canvas.drawCircle(
          Offset(dx, dy), ChartTokens.endMarkerRadius, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(_AreaPainter old) =>
      old.values != values ||
      old.color != color ||
      old.min != min ||
      old.max != max ||
      old.progress != progress ||
      old.hover != hover;
}
