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
///
/// FOLDING AND EXPANSION — the web twin of `Donut.tsx`, same contract.
///
/// Pass the FULL list and a [maxSlices]; the chart folds the tail itself.
/// A folded "Others (19)" row is otherwise a dead end: the reader can see that
/// two thirds of the portfolio is in there but not what it is. Here that row is
/// a disclosure — it expands in place and lists every folded item with its own
/// share and figure.
///
/// The expanded items are listed but NOT given their own arcs. Only eight hues
/// are validated for colourblind separation, so a twenty-colour ring would be
/// unreadable. The ring keeps one Other arc; the legend carries the detail.
class DonutChart extends StatefulWidget {
  const DonutChart({
    required this.segments,
    this.size = 150,
    this.strokeWidth = 22,
    this.centerText,
    this.centerSub,
    this.showLegend = true,
    this.formatValue,
    this.maxSlices,
    this.otherLabel = 'Others',
    this.otherColor,
    super.key,
  });

  final List<DonutSegment> segments;
  final double size;
  final double strokeWidth;
  final String? centerText;
  final String? centerSub;
  final bool showLegend;

  /// Fold everything past this many slices into a single "Others" arc.
  /// Null keeps every segment as its own arc.
  final int? maxSlices;
  final String otherLabel;

  /// Defaults to the theme's muted ink — a colour that reads as "not a
  /// category", so the folded arc is never mistaken for a real one.
  final Color? otherColor;

  /// How to render a slice's value on hover. Without it the centre shows the
  /// share only, which is still true — a percentage never needs a formatter.
  final String Function(double value)? formatValue;

  @override
  State<DonutChart> createState() => _DonutChartState();
}

class _DonutChartState extends State<DonutChart> {
  int? _hover;
  bool _expanded = false;

  bool get _shouldFold =>
      widget.maxSlices != null && widget.segments.length > widget.maxSlices!;
  List<DonutSegment> get _head =>
      _shouldFold ? widget.segments.sublist(0, widget.maxSlices!) : widget.segments;
  List<DonutSegment> get _tail =>
      _shouldFold ? widget.segments.sublist(widget.maxSlices!) : const [];

  /// Which slice a point falls in, or null for the hole and the outside.
  ///
  /// Computed from the same start angle and sweep the painter uses, so the
  /// slice that responds is the slice under the cursor.
  int? _sliceAt(Offset local, double total, List<DonutSegment> arcs) {
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
    for (var i = 0; i < arcs.length; i++) {
      final v = arcs[i].value;
      if (v <= 0) continue;
      sweptTo += (v / total) * 2 * math.pi;
      if (a <= sweptTo) return i;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final size = widget.size;
    final total =
        widget.segments.fold<double>(0, (s, e) => s + (e.value < 0 ? 0 : e.value));

    final head = _head;
    final tail = _tail;
    final tailTotal = tail.fold<double>(0, (s, e) => s + (e.value < 0 ? 0 : e.value));
    final otherColor = widget.otherColor ?? cs.onSurfaceVariant;
    final segments = <DonutSegment>[
      ...head,
      if (_shouldFold)
        DonutSegment('${widget.otherLabel} (${tail.length})', tailTotal, otherColor),
    ];

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
          final i = _sliceAt(e.localPosition, total, segments);
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
              for (final s in head) _legendRow(context, s, total),
              if (_shouldFold) ...[
                InkWell(
                  onTap: () => setState(() => _expanded = !_expanded),
                  borderRadius: BorderRadius.circular(AppRadii.button),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                              color: otherColor, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text('${widget.otherLabel} (${tail.length})',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Text(
                          total <= 0
                              ? '0%'
                              : '${(tailTotal / total * 100).round()}%',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(width: 2),
                        AnimatedRotation(
                          turns: _expanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 150),
                          child: Icon(Icons.keyboard_arrow_down_rounded,
                              size: 16, color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_expanded)
                  // Capped and scrollable: a 20-item tail would otherwise
                  // treble the card's height. Everything stays reachable —
                  // nothing is truncated away.
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 216),
                    child: Container(
                      margin: const EdgeInsets.only(left: 4, top: 4, bottom: 2),
                      padding: const EdgeInsets.only(left: AppSpacing.sm),
                      decoration: BoxDecoration(
                        border: Border(
                            left: BorderSide(
                                color: cs.outlineVariant, width: 1)),
                      ),
                      child: ListView(
                        shrinkWrap: true,
                        padding: EdgeInsets.zero,
                        children: [
                          for (final s in tail)
                            _tailRow(context, s, total),
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// One legend row: swatch, label, share.
Widget _legendRow(BuildContext context, DonutSegment s, double total) {
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: s.color, shape: BoxShape.circle),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
            child: Text(s.label,
                // Two lines before ellipsis. A truncated category name is
                // unidentifiable — "Financial Ser…" and "Financial Services"
                // share a prefix with half a dozen other labels — and a chart
                // whose legend cannot be read is decoration.
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall)),
        const SizedBox(width: AppSpacing.sm),
        Text(
          total <= 0 ? '0%' : '${(s.value / total * 100).round()}%',
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

/// A folded item, revealed under "Others". No swatch — it has no arc of its
/// own, and a dot would imply one.
Widget _tailRow(BuildContext context, DonutSegment s, double total) {
  final cs = Theme.of(context).colorScheme;
  return Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      children: [
        Expanded(
          child: Text(s.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: cs.onSurfaceVariant)),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          total <= 0 ? '0%' : '${(s.value / total * 100).round()}%',
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(fontWeight: FontWeight.w700, color: cs.onSurface),
        ),
      ],
    ),
  );
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

    // A 2px gap of bare surface between neighbouring slices, matching the web
    // client and the dataviz mark spec. Expressed in radians from a pixel
    // target so the gap stays 2px whatever size the donut is drawn at.
    final gap = 2.0 / radius;
    final drawn = segments.where((e) => e.value > 0).length;

    var start = -math.pi / 2; // start at top
    for (var i = 0; i < segments.length; i++) {
      final s = segments[i];
      if (s.value <= 0) continue;
      final full = (s.value / total) * (2 * math.pi);
      // A lone slice has no neighbour to be separated from, so it keeps the
      // full sweep — cutting a gap there would leave an unexplained notch.
      final sweep = drawn == 1 ? full : math.max(full - gap, 0.0);
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start + (drawn == 1 ? 0 : gap / 2),
        sweep,
        false,
        Paint()
          ..color = s.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = i == hover ? stroke + 5 : stroke
          // BUTT, not round. A round cap extends the arc by half the stroke at
          // each end, which swallows the gap and makes neighbouring slices
          // visibly overlap — the web donut uses flat ends for the same reason.
          ..strokeCap = StrokeCap.butt,
      );
      start += full;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) =>
      old.hover != hover ||
      old.segments != segments || old.stroke != stroke;
}
