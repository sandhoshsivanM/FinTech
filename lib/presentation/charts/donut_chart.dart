import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_tokens.dart';

/// A single slice of a [DonutChart].
class DonutSegment {
  const DonutSegment(this.label, this.value, this.color);
  final String label;
  final double value; // any positive magnitude; normalized internally
  final Color color;
}

/// Lightweight custom-painted donut (no chart library → smooth on web).
/// Shows an optional centered label/sublabel and an optional side legend.
class DonutChart extends StatefulWidget {
  const DonutChart({
    required this.segments,
    this.size = 150,
    this.strokeWidth = 22,
    this.centerText,
    this.centerSub,
    this.showLegend = true,
    this.formatValue,
    super.key,
  });

  final List<DonutSegment> segments;
  final double size;
  final double strokeWidth;
  final String? centerText;
  final String? centerSub;
  final bool showLegend;

  /// How to render a slice's value on hover. Without it the centre shows the
  /// share only, which is still true — a percentage never needs a formatter.
  final String Function(double value)? formatValue;

  @override
  State<DonutChart> createState() => _DonutChartState();
}

class _DonutChartState extends State<DonutChart> {
  int? _hover;

  /// Which slice a point falls in, or null for the hole and the outside.
  ///
  /// Computed from the same start angle and sweep the painter uses, so the
  /// slice that responds is the slice under the cursor.
  int? _sliceAt(Offset local, double total) {
    final r = widget.size / 2;
    final centre = Offset(r, r);
    final d = (local - centre).distance;
    final outer = r;
    final inner = r - widget.strokeWidth;
    if (d > outer || d < inner) return null;
    if (total <= 0) return null;

    // atan2 measures from the positive x-axis; the ring starts at 12 o'clock,
    // so shift by a quarter turn and wrap into [0, 2pi).
    var a = math.atan2(local.dy - centre.dy, local.dx - centre.dx) + math.pi / 2;
    if (a < 0) a += 2 * math.pi;

    var sweptTo = 0.0;
    for (var i = 0; i < widget.segments.length; i++) {
      final v = widget.segments[i].value;
      if (v <= 0) continue;
      sweptTo += (v / total) * 2 * math.pi;
      if (a <= sweptTo) return i;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final segments = widget.segments;
    final size = widget.size;
    final total = segments.fold<double>(0, (s, e) => s + (e.value < 0 ? 0 : e.value));

    final hover = _hover;
    final hovered = hover != null && hover < segments.length ? segments[hover] : null;
    final share = hovered == null || total <= 0
        ? null
        : (hovered.value / total * 100).toStringAsFixed(hovered.value / total < 0.1 ? 1 : 0);

    final ring = SizedBox(
      width: size,
      height: size,
      child: MouseRegion(
        onHover: (e) {
          final i = _sliceAt(e.localPosition, total);
          if (i != _hover) setState(() => _hover = i);
        },
        onExit: (_) => setState(() => _hover = null),
        child: CustomPaint(
          painter: _DonutPainter(segments, widget.strokeWidth,
              Theme.of(context).colorScheme.surfaceContainerHighest,
              hover: hover),
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: widget.strokeWidth),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // The hovered slice replaces the centre text rather than
                  // appearing beside it: a floating tooltip over a 22px ring is
                  // a poor target, and the centre is already where the eye is.
                  Text(
                    hovered != null
                        ? (widget.formatValue?.call(hovered.value) ?? '$share%')
                        : (widget.centerText ?? ''),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    hovered != null
                        ? '${hovered.label}${share == null ? '' : ' · $share%'}'
                        : (widget.centerSub ?? ''),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    if (!widget.showLegend) return ring;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        ring,
        // md, not lg. The legend is where long category names live — "Oil Gas &
        // Consumable Fuels" — and every point given to the gap is taken from
        // the only column that has to hold prose.
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final s in segments)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                            color: s.color, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                          child: Text(s.label,
                              // Two lines before ellipsis. A truncated category
                              // name is unidentifiable — "Financial Ser…" and
                              // "Financial Services" are the same prefix as
                              // half a dozen other labels — and a chart whose
                              // legend cannot be read is decoration.
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall)),
                      const SizedBox(width: AppSpacing.sm),
                      Text(
                        total <= 0
                            ? '0%'
                            : '${(s.value / total * 100).round()}%',
                        style: Theme.of(context)
                            .textTheme
                            .bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.segments, this.stroke, this.trackColor, {this.hover});
  final List<DonutSegment> segments;
  final double stroke;
  final Color trackColor;

  /// Index of the hovered slice, drawn thicker. Not recoloured — the palette is
  /// checked for colourblind separation as a set, and a hue invented at hover
  /// time was never part of that check.
  final int? hover;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = (math.min(size.width, size.height) - stroke) / 2;
    final total = segments.fold<double>(0, (s, e) => s + (e.value < 0 ? 0 : e.value));

    // Track.
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = trackColor.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke,
    );
    if (total <= 0) return;

    var start = -math.pi / 2; // start at top
    const gap = 0.04; // small gap between slices (radians)
    for (var i = 0; i < segments.length; i++) {
      final s = segments[i];
      if (s.value <= 0) continue;
      final sweep = (s.value / total) * (2 * math.pi) - gap;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start + gap / 2,
        sweep < 0 ? 0 : sweep,
        false,
        Paint()
          ..color = s.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = i == hover ? stroke + 5 : stroke
          ..strokeCap = StrokeCap.round,
      );
      start += (s.value / total) * (2 * math.pi);
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) =>
      old.hover != hover ||
      old.segments != segments || old.stroke != stroke;
}
