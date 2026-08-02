import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_tokens.dart';
import 'chart_tokens.dart';

/// One segment of a [SunburstChart].
class SunburstNode {
  const SunburstNode({
    required this.key,
    required this.label,
    required this.value,
    required this.color,
    this.children = const [],
  });

  final String key;
  final String label;

  /// Any positive magnitude; normalised internally.
  final double value;

  final Color color;
  final List<SunburstNode> children;

  bool get hasChildren => children.isNotEmpty;
}

/// A two-ring hierarchical allocation chart with drill-down.
///
/// Answers "what do I own" and "what is it made of" in one figure, because the
/// sector sits literally inside its asset class. A flat donut plus a separate
/// sector table answers each half but leaves the user to combine them mentally.
///
/// Three deliberate choices:
///
///  * **A caption line, not a floating tooltip.** A long-press tooltip over a
///    34px arc is a poor target on a phone, and the caption doubles as the text
///    a screen reader reads out.
///  * **Segments render in the order given, never re-sorted.** For the inner
///    ring that order is `kAssetGroupOrder`, and the palette's colourblind
///    guarantee is a property of that exact adjacency.
///  * **Every arc is a [Semantics] node.** A pie chart is otherwise completely
///    silent to assistive technology.
class SunburstChart extends StatefulWidget {
  const SunburstChart({
    required this.root,
    this.size = 220,
    this.ringWidth = 34,
    this.centerBuilder,
    this.onFocusChanged,
    this.formatValue,
    this.showBreadcrumb = true,
    this.showLegend = true,
    super.key,
  });

  /// The whole portfolio. Its own value is the centre total; its children are
  /// the inner ring and their children the outer.
  final SunburstNode root;

  final double size;
  final double ringWidth;

  /// Centre content. Receives the currently focused node.
  final Widget Function(BuildContext, SunburstNode focus)? centerBuilder;

  /// Fires with the full path from root to the new focus.
  final void Function(List<SunburstNode> path)? onFocusChanged;

  final String Function(double)? formatValue;
  final bool showBreadcrumb;

  /// Legend for the inner ring only. The outer ring's labels live in the
  /// caption, since seven groups times five children will not fit a legend.
  final bool showLegend;

  @override
  State<SunburstChart> createState() => _SunburstChartState();
}

class _SunburstChartState extends State<SunburstChart> {
  /// Indices from the root down to the focused node.
  List<int> _path = const [];

  /// The segment described in the caption. Null falls back to the focus itself.
  SunburstNode? _selected;

  List<SunburstNode> get _pathNodes {
    final nodes = <SunburstNode>[widget.root];
    var current = widget.root;
    for (final i in _path) {
      if (i >= current.children.length) break;
      current = current.children[i];
      nodes.add(current);
    }
    return nodes;
  }

  SunburstNode get _focus => _pathNodes.last;

  void _setPath(List<int> next) {
    setState(() {
      _path = next;
      _selected = null;
    });
    widget.onFocusChanged?.call(_pathNodes);
  }

  void _drillInto(int index) {
    final node = _focus.children[index];
    // A childless segment cannot be zoomed into; select it for the caption
    // instead, so a tap is never a no-op.
    if (!node.hasChildren) {
      setState(() => _selected = node);
      return;
    }
    _setPath([..._path, index]);
  }

  /// The segment under the pointer, on devices that have one.
  ///
  /// Hover only ever previews: it never changes [_selected], so moving the
  /// mouse away restores exactly what a tap had chosen. A pointer passing over
  /// a chart on its way somewhere else must not silently rewrite what the
  /// screen says.
  SunburstNode? _hovered;

  void _zoomOut() {
    if (_path.isEmpty) return;
    _setPath(_path.sublist(0, _path.length - 1));
  }

  String _fmt(double v) =>
      widget.formatValue?.call(v) ?? v.toStringAsFixed(0);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final focus = _focus;
    final path = _pathNodes;
    final described = _hovered ?? _selected ?? focus;
    final total = focus.value <= 0 ? 1.0 : focus.value;

    if (focus.children.isEmpty) {
      return SizedBox(
        height: widget.size,
        child: Center(
          child: Text('Nothing to show yet',
              style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.showBreadcrumb && path.length > 1) ...[
          _Breadcrumb(
            path: path,
            onTap: (depth) => _setPath(_path.sublist(0, depth)),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        Center(
          child: SizedBox(
            width: widget.size,
            height: widget.size,
            child: Stack(
              alignment: Alignment.center,
              children: [
                _HitTestArea(
                  size: widget.size,
                  ringWidth: widget.ringWidth,
                  node: focus,
                  hovered: _hovered,
                  onSegmentTap: _drillInto,
                  onCenterTap: _path.isEmpty ? null : _zoomOut,
                  onSegmentSelect: (n) => setState(() => _selected = n),
                  onHover: (n) {
                    if (identical(n, _hovered)) return;
                    setState(() => _hovered = n);
                  },
                ),
                IgnorePointer(
                  child: widget.centerBuilder?.call(context, focus) ??
                      _DefaultCenter(
                        title: _fmt(focus.value),
                        subtitle: _path.isEmpty ? focus.label : 'Tap to zoom out',
                      ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        // The caption is the tooltip. It always says something, so there is no
        // hover-only information.
        _Caption(node: described, share: described.value / total, fmt: _fmt),
        if (widget.showLegend) ...[
          const SizedBox(height: AppSpacing.sm),
          _Legend(nodes: focus.children, total: total),
        ],
      ],
    );
  }
}

/// Splits the ring geometry out of the painter so taps can be resolved against
/// exactly the same maths that drew the arcs.
class _HitTestArea extends StatelessWidget {
  const _HitTestArea({
    required this.size,
    required this.ringWidth,
    required this.node,
    required this.onSegmentTap,
    required this.onCenterTap,
    required this.onSegmentSelect,
    required this.onHover,
    this.hovered,
  });

  final double size;
  final double ringWidth;
  final SunburstNode node;
  final void Function(int index) onSegmentTap;
  final VoidCallback? onCenterTap;
  final void Function(SunburstNode) onSegmentSelect;
  final void Function(SunburstNode?) onHover;
  final SunburstNode? hovered;

  @override
  Widget build(BuildContext context) {
    final geometry = SunburstGeometry(
      node: node,
      size: size,
      ringWidth: ringWidth,
    );

    return Semantics(
      container: true,
      child: Stack(
        children: [
          MouseRegion(
            // Resolved against the same geometry the painter drew with, so the
            // arc that lights up is the arc under the cursor rather than one
            // computed by a second, drifting copy of the maths.
            onHover: (event) =>
                onHover(geometry.hitTest(event.localPosition)?.node),
            onExit: (_) => onHover(null),
            child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapUp: (details) {
              final hit = geometry.hitTest(details.localPosition);
              if (hit == null) {
                if (geometry.isInCentre(details.localPosition)) onCenterTap?.call();
                return;
              }
              if (hit.depth == 0) {
                onSegmentTap(hit.index);
              } else {
                onSegmentSelect(hit.node);
              }
            },
            child: TweenAnimationBuilder<double>(
              // Re-keyed on the focused node, so drilling in sweeps the new
              // ring rather than swapping it in instantly.
              key: ValueKey(node.key),
              tween: Tween(begin: 0, end: 1),
              duration: ChartTokens.entranceFor(context),
              curve: ChartTokens.entranceCurve,
              builder: (context, t, _) => CustomPaint(
                size: Size.square(size),
                painter: _SunburstPainter(geometry,
                    progress: t, hovered: hovered),
              ),
            ),
            ),
          ),
          // One invisible semantics node per visible arc, so the allocation is
          // readable without sight.
          ...geometry.segments.map(
            (s) => Positioned.fill(
              child: Semantics(
                label: '${s.node.label}, '
                    '${(s.node.value / (node.value <= 0 ? 1 : node.value) * 100).round()}%',
                button: s.depth == 0 && s.node.hasChildren,
                child: const SizedBox.shrink(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A laid-out arc.
class SunburstSegment {
  const SunburstSegment({
    required this.node,
    required this.depth,
    required this.index,
    required this.startAngle,
    required this.sweepAngle,
  });

  final SunburstNode node;

  /// 0 = inner ring, 1 = outer ring.
  final int depth;

  /// Index within the focused node's children (inner ring only; -1 outside).
  final int index;

  final double startAngle;
  final double sweepAngle;
}

/// Ring layout, shared by the painter and hit-testing.
///
/// These have to agree exactly. Computing the geometry once and handing it to
/// both is what stops a tap landing on a different slice than the one under the
/// finger.
class SunburstGeometry {
  SunburstGeometry({
    required this.node,
    required this.size,
    required this.ringWidth,
  }) {
    final total = node.children.fold<double>(
        0, (s, c) => s + (c.value < 0 ? 0 : c.value));
    if (total <= 0) {
      segments = const [];
      return;
    }
    final gap = ChartTokens.arcGapDegrees * math.pi / 180;
    final out = <SunburstSegment>[];
    var angle = -math.pi / 2;

    for (var i = 0; i < node.children.length; i++) {
      final child = node.children[i];
      if (child.value <= 0) continue;
      final sweep = (child.value / total) * 2 * math.pi;
      out.add(SunburstSegment(
        node: child,
        depth: 0,
        index: i,
        startAngle: angle + gap / 2,
        sweepAngle: math.max(0, sweep - gap),
      ));

      // Outer ring: this child's own children, laid out inside its arc.
      final childTotal = child.children
          .fold<double>(0, (s, c) => s + (c.value < 0 ? 0 : c.value));
      if (childTotal > 0) {
        var inner = angle;
        for (final grand in child.children) {
          if (grand.value <= 0) continue;
          final grandSweep = (grand.value / childTotal) * sweep;
          out.add(SunburstSegment(
            node: grand,
            depth: 1,
            index: -1,
            startAngle: inner + gap / 2,
            sweepAngle: math.max(0, grandSweep - gap),
          ));
          inner += grandSweep;
        }
      }
      angle += sweep;
    }
    segments = out;
  }

  final SunburstNode node;
  final double size;
  final double ringWidth;
  late final List<SunburstSegment> segments;

  Offset get centre => Offset(size / 2, size / 2);

  /// Outer radius of the inner ring's centreline.
  double get innerRadius => size / 2 - ringWidth * 1.5;
  double get outerRadius => size / 2 - ringWidth * 0.5;

  double get centreRadius => innerRadius - ringWidth / 2;

  bool isInCentre(Offset local) => (local - centre).distance <= centreRadius;

  /// The segment under [local], or null if the tap missed the rings.
  SunburstSegment? hitTest(Offset local) {
    final delta = local - centre;
    final r = delta.distance;
    final depth = _depthAt(r);
    if (depth == null) return null;

    // atan2 gives (-pi, pi] measured from the +x axis, matching drawArc's frame.
    var theta = math.atan2(delta.dy, delta.dx);
    for (final s in segments) {
      if (s.depth != depth) continue;
      // Normalise the angle into this segment's own sweep window.
      var offset = theta - s.startAngle;
      while (offset < 0) {
        offset += 2 * math.pi;
      }
      if (offset <= s.sweepAngle) return s;
    }
    return null;
  }

  int? _depthAt(double r) {
    final innerLo = innerRadius - ringWidth / 2;
    final innerHi = innerRadius + ringWidth / 2;
    final outerLo = outerRadius - ringWidth / 2;
    final outerHi = outerRadius + ringWidth / 2;
    if (r >= innerLo && r <= innerHi) return 0;
    if (r >= outerLo && r <= outerHi) return 1;
    return null;
  }
}

class _SunburstPainter extends CustomPainter {
  _SunburstPainter(this.geometry, {this.progress = 1, this.hovered});

  final SunburstGeometry geometry;

  /// The segment under the pointer, drawn thicker rather than recoloured.
  ///
  /// Lightening or saturating the hovered arc would break the one thing the
  /// colours are load-bearing for: `kAssetGroupOrder` is chosen so adjacent
  /// arcs stay distinguishable under protanopia, and shifting a hue at hover
  /// time puts a colour on screen that was never checked. Thickness carries no
  /// meaning here, so it is free to borrow.
  final SunburstNode? hovered;

  /// 0..1 entrance progress. Each arc grows from its own start angle, so the
  /// ring sweeps round clockwise the way it is read.
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    for (final s in geometry.segments) {
      if (s.sweepAngle <= 0) continue;
      final radius = s.depth == 0 ? geometry.innerRadius : geometry.outerRadius;
      // The outer ring trails the inner one slightly, so the hierarchy reads:
      // asset class first, then what is inside it.
      final lead = s.depth == 0 ? 0.0 : 0.15;
      final local = ((progress - lead) / (1 - lead)).clamp(0.0, 1.0);
      if (local <= 0) continue;
      final isHovered = hovered != null && identical(s.node, hovered);
      canvas.drawArc(
        Rect.fromCircle(center: geometry.centre, radius: radius),
        s.startAngle,
        s.sweepAngle * local,
        false,
        Paint()
          ..color = s.node.color
          ..style = PaintingStyle.stroke
          ..strokeWidth =
              isHovered ? geometry.ringWidth + 6 : geometry.ringWidth,
      );
    }
  }

  @override
  bool shouldRepaint(_SunburstPainter old) =>
      old.geometry != geometry ||
      old.progress != progress ||
      !identical(old.hovered, hovered);
}

class _Breadcrumb extends StatelessWidget {
  const _Breadcrumb({required this.path, required this.onTap});

  final List<SunburstNode> path;
  final void Function(int depth) onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < path.length; i++) ...[
            if (i > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Icon(Icons.chevron_right_rounded,
                    size: 14, color: scheme.outline),
              ),
            InkWell(
              onTap: i == path.length - 1 ? null : () => onTap(i),
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                child: Text(
                  path[i].label,
                  style: text.labelMedium?.copyWith(
                    color: i == path.length - 1
                        ? scheme.onSurface
                        : AppColors.accent,
                    fontWeight:
                        i == path.length - 1 ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DefaultCenter extends StatelessWidget {
  const _DefaultCenter({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(title,
            style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        Text(subtitle,
            textAlign: TextAlign.center,
            style: text.labelSmall
                ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

class _Caption extends StatelessWidget {
  const _Caption({required this.node, required this.share, required this.fmt});

  final SunburstNode node;
  final double share;
  final String Function(double) fmt;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: node.color, shape: BoxShape.circle),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            node.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        Text(
          '${fmt(node.value)} · ${(share * 100).clamp(0, 100).round()}%',
          style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.nodes, required this.total});
  final List<SunburstNode> nodes;
  final double total;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Wrap(
      spacing: AppSpacing.md,
      runSpacing: 4,
      children: [
        for (final n in nodes)
          if (n.value > 0)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration:
                      BoxDecoration(color: n.color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 5),
                Text('${n.label} ${(n.value / total * 100).round()}%',
                    style: text.labelSmall),
              ],
            ),
      ],
    );
  }
}
