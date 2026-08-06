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
    this.emptyLabel = 'Not enough data yet',
    this.semanticLabel,
    super.key,
  });

  final List<BarGroup> groups;
  final double height;

  /// How to render a value in the hover readout and the axis cap.
  final String Function(double value)? formatValue;

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
              child: TweenAnimationBuilder<double>(
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
                            if (_hover == i) setState(() => _hover = null);
                          },
                          child: _Group(
                            group: groups[i],
                            max: max,
                            progress: t,
                            highlighted: _hover == i,
                            trackColor: scheme.surfaceContainerHighest,
                            labelColor: scheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
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
        const SizedBox(height: AppSpacing.xs),
        Text(
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
      ],
    );
  }
}
