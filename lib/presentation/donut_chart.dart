import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme/app_tokens.dart';

/// A single slice of a [DonutChart].
class DonutSegment {
  const DonutSegment(this.label, this.value, this.color);
  final String label;
  final double value; // any positive magnitude; normalized internally
  final Color color;
}

/// Lightweight custom-painted donut (no chart library → smooth on web).
/// Shows an optional centered label/sublabel and an optional side legend.
class DonutChart extends StatelessWidget {
  const DonutChart({
    required this.segments,
    this.size = 150,
    this.strokeWidth = 22,
    this.centerText,
    this.centerSub,
    this.showLegend = true,
    super.key,
  });

  final List<DonutSegment> segments;
  final double size;
  final double strokeWidth;
  final String? centerText;
  final String? centerSub;
  final bool showLegend;

  @override
  Widget build(BuildContext context) {
    final total = segments.fold<double>(0, (s, e) => s + (e.value < 0 ? 0 : e.value));
    final ring = SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _DonutPainter(segments, strokeWidth,
            Theme.of(context).colorScheme.surfaceContainerHighest),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (centerText != null)
                Text(centerText!,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
              if (centerSub != null)
                Text(centerSub!,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
      ),
    );

    if (!showLegend) return ring;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        ring,
        const SizedBox(width: AppSpacing.lg),
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
                              style: Theme.of(context).textTheme.bodyMedium)),
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
  _DonutPainter(this.segments, this.stroke, this.trackColor);
  final List<DonutSegment> segments;
  final double stroke;
  final Color trackColor;

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
    for (final s in segments) {
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
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round,
      );
      start += (s.value / total) * (2 * math.pi);
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) =>
      old.segments != segments || old.stroke != stroke;
}
