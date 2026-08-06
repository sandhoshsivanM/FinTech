import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_tokens.dart';
import 'chart_tokens.dart';

/// One bar within a group.
class Bar {
  const Bar({required this.label, required this.value, required this.color});

  final String label;
  final double value;
  final Color color;
}

/// A labelled cluster of bars — typically one month.
class BarGroup {
  const BarGroup({required this.label, required this.bars});

  final String label;
  final List<Bar> bars;

  double get max =>
      bars.fold(0.0, (m, b) => b.value > m ? b.value : m);
}

/// Grouped bars over a categorical axis.
///
/// The dashboard and Reports both reduced a whole window to two numbers —
/// income and expense — which cannot answer the question people actually bring
/// to them. "Did I spend a lot last month" is only answerable against the
/// months either side of it, and that comparison is what a bar chart is for.
///
/// Deliberately not a stacked bar. Income and expense are not parts of a whole:
/// stacking them would make the bar's total height mean "money that moved",
/// which is a number nobody wants and which grows when either half grows.
class BarChart extends StatefulWidget {
  const BarChart({
    required this.groups,
    this.height = 160,
    this.formatValue,
    this.formatAxis,
    this.emptyLabel = 'Not enough data yet',
    this.semanticLabel,
    super.key,
  });

  final List<BarGroup> groups;
  final double height;

  /// How to render a value in the hover readout — the number of record.
  final String Function(double value)? formatValue;

  /// How to render an axis label. Short form: an axis is read at a glance and
  /// exists to give the bars a scale, not to be the number of record.
  final String Function(double value)? formatAxis;

  final String emptyLabel;
  final String? semanticLabel;

  @override
  State<BarChart> createState() => _BarChartState();
}

class _BarChartState extends State<BarChart> {
  int? _hover;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final groups = widget.groups;

    if (groups.isEmpty) {
      return SizedBox(
        height: widget.height,
        child: Center(
          child: Text(widget.emptyLabel,
              style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
        ),
      );
    }

    final max = groups.fold(0.0, (m, g) => g.max > m ? g.max : m);
    final hovered = _hover != null && _hover! < groups.length
        ? groups[_hover!]
        : null;

    String fmt(double v) =>
        widget.formatValue?.call(v) ?? v.toStringAsFixed(0);
    String axis(double v) =>
        widget.formatAxis?.call(v) ?? v.toStringAsFixed(0);

    // A "nice" ceiling, so the top gridline is a number a person would say —
    // ₹90k rather than ₹89,720. Bars are then measured against a round figure
    // instead of against whichever month happened to be largest.
    final top = _niceCeiling(max);

    return Semantics(
      label: widget.semanticLabel,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Reserved whether or not anything is hovered, so moving the
            // pointer across the chart does not shift everything below it.
            SizedBox(
              height: 20,
              child: hovered == null
                  ? null
                  : Row(
                      children: [
                        Text('${hovered.label}  ',
                            style: text.bodySmall
                                ?.copyWith(fontWeight: FontWeight.w700)),
                        for (final b in hovered.bars) ...[
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(right: 4),
                            decoration: BoxDecoration(
                                color: b.color, shape: BoxShape.circle),
                          ),
                          Text('${fmt(b.value)}   ',
                              style: text.bodySmall
                                  ?.copyWith(color: scheme.onSurfaceVariant)),
                        ],
                      ],
                    ),
            ),
            SizedBox(
              height: widget.height,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // The axis is the whole point of this change: a chart that has
                  // to be hovered to be read is decorative. The scale has to be
                  // legible standing still.
                  _Axis(
                    top: top,
                    format: axis,
                    color: scheme.onSurfaceVariant,
                    // Leave room for the month labels under the bars so the
                    // gridlines line up with the bar area, not the whole box.
                    bottomInset: _labelStripHeight,
                  ),
                  Expanded(
                    child: Stack(
                      children: [
                        Positioned.fill(
                          bottom: _labelStripHeight,
                          child: _GridLines(color: scheme.outlineVariant),
                        ),
                        TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0, end: 1),
                          duration: ChartTokens.entranceFor(context),
                          curve: ChartTokens.entranceCurve,
                          builder: (context, t, _) => Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              for (var i = 0; i < groups.length; i++)
                                Expanded(
                                  child: MouseRegion(
                                    onEnter: (_) => setState(() => _hover = i),
                                    onExit: (_) {
                                      if (_hover == i) {
                                        setState(() => _hover = null);
                                      }
                                    },
                                    child: _Group(
                                      group: groups[i],
                                      max: top,
                                      progress: t,
                                      highlighted: _hover == i,
                                      trackColor:
                                          scheme.surfaceContainerHighest,
                                      labelColor: scheme.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Height reserved under the bars for the month labels.
const double _labelStripHeight = 20;

/// Rounds up to a value a person would say out loud.
///
/// Scaling bars against the largest month means the tallest bar always touches
/// the top, so every chart looks equally full and the axis label is an odd
/// number nobody chose. A round ceiling gives the bars somewhere to be short.
double _niceCeiling(double max) {
  if (max <= 0) return 1;
  final magnitude = math.pow(10, (math.log(max) / math.ln10).floor()).toDouble();
  for (final step in const [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0]) {
    final candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
}

/// Three labels: the ceiling, its midpoint and zero. More would crowd a chart
/// this short, and fewer would leave the middle of the range unscaled.
class _Axis extends StatelessWidget {
  const _Axis({
    required this.top,
    required this.format,
    required this.color,
    required this.bottomInset,
  });

  final double top;
  final String Function(double) format;
  final Color color;
  final double bottomInset;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontSize: 10, color: color);
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset, right: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(format(top), style: style),
          Text(format(top / 2), style: style),
          Text(format(0), style: style),
        ],
      ),
    );
  }
}

/// Hairline gridlines at the same three positions as the axis labels.
///
/// Never dashed, and never in a series colour: a gridline that reads as a mark
/// competes with the data it is there to measure.
class _GridLines extends StatelessWidget {
  const _GridLines({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    final line = Container(
      height: ChartTokens.gridLineWidth,
      color: color.withValues(alpha: 0.5),
    );
    return Column(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [line, line, line],
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({
    required this.group,
    required this.max,
    required this.progress,
    required this.highlighted,
    required this.trackColor,
    required this.labelColor,
  });

  final BarGroup group;
  final double max;
  final double progress;
  final bool highlighted;
  final Color trackColor;
  final Color labelColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final b in group.bars)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: LayoutBuilder(
                    builder: (context, c) {
                      // A zero-value month still draws a hairline stub. A bar of
                      // no height is indistinguishable from a month that is not
                      // in the series at all, and those mean different things.
                      final frac = max <= 0 ? 0.0 : (b.value / max);
                      final h = (c.maxHeight * frac * progress).clamp(
                          b.value > 0 ? 2.0 : 1.0, c.maxHeight);
                      return Container(
                        width: ChartTokens.barMaxWidth,
                        height: h,
                        decoration: BoxDecoration(
                          color: b.value > 0
                              ? b.color
                              : trackColor.withValues(alpha: 0.6),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(ChartTokens.barCornerRadius),
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: _labelStripHeight,
          child: Center(
            child: Text(
          group.label,
          maxLines: 1,
          overflow: TextOverflow.clip,
          style: TextStyle(
            fontSize: 11,
            color: labelColor,
            // Weight, not colour: the axis must never borrow a series hue, or
            // the label starts looking like a data mark.
            fontWeight: highlighted ? FontWeight.w800 : FontWeight.w500,
          ),
        ),
          ),
        ),
      ],
    );
  }
}
