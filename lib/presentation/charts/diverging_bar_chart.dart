import 'package:flutter/material.dart';

import '../../core/theme/semantic_colors.dart';

import '../../core/theme/app_tokens.dart';
import 'chart_tokens.dart';

/// One labelled quantity that may be negative.
class DivergingBar {
  const DivergingBar({required this.label, required this.value, this.detail});

  final String label;
  final double value;

  /// Optional second line — a return percentage, usually.
  final String? detail;
}

/// Horizontal bars growing left or right from a shared zero.
///
/// Winners and losers in one chart. Two separate ranked lists — "top gainers"
/// and "top losers" — make the reader hold one list in their head to compare it
/// with the other, and hide the thing that actually matters, which is whether
/// the gains outweigh the losses. Here that is the visible balance of ink
/// either side of the axis.
///
/// The zero line is the chart's spine, so it is placed once from the widest
/// magnitude in EITHER direction and every bar is measured against the same
/// scale. Scaling each side independently would make a ₹200 loss look the same
/// size as a ₹20,000 gain.
class DivergingBarChart extends StatefulWidget {
  const DivergingBarChart({
    required this.bars,
    this.formatValue,
    this.positiveColor,
    this.negativeColor,
    this.emptyLabel = 'Nothing to compare yet',
    this.semanticLabel,
    super.key,
  });

  final List<DivergingBar> bars;
  final String Function(double value)? formatValue;
  /// Null means "use the theme's income/expense", resolved in `build`.
  final Color? positiveColor;
  final Color? negativeColor;
  final String emptyLabel;
  final String? semanticLabel;

  @override
  State<DivergingBarChart> createState() => _DivergingBarChartState();
}

class _DivergingBarChartState extends State<DivergingBarChart> {
  int? _hover;

  @override
  Widget build(BuildContext context) {
    final posColor = widget.positiveColor ?? context.colors.income;
    final negColor = widget.negativeColor ?? context.colors.expense;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final bars = widget.bars;

    if (bars.isEmpty) {
      return SizedBox(
        height: 80,
        child: Center(
          child: Text(widget.emptyLabel,
              style: text.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
        ),
      );
    }

    final extent = bars.fold(0.0, (m, b) => b.value.abs() > m ? b.value.abs() : m);
    // With nothing negative there is nothing to diverge from, so the spine
    // moves to the left edge and the bars use the full width. Keeping it
    // centred threw away half the resolution of every comparison to reserve
    // room for values that cannot occur.
    final centred = bars.any((b) => b.value < 0);
    String fmt(double v) =>
        widget.formatValue?.call(v) ?? v.toStringAsFixed(0);

    return Semantics(
      label: widget.semanticLabel,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < bars.length; i++)
              MouseRegion(
                onEnter: (_) => setState(() => _hover = i),
                onExit: (_) {
                  if (_hover == i) setState(() => _hover = null);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 168,
                        child: Text(
                          bars[i].label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: text.bodySmall?.copyWith(
                            fontWeight: _hover == i
                                ? FontWeight.w800
                                : FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0, end: 1),
                          duration: ChartTokens.entranceFor(context),
                          curve: ChartTokens.entranceCurve,
                          builder: (context, t, _) => CustomPaint(
                            size: const Size(double.infinity, 16),
                            painter: _DivergingBarPainter(
                              value: bars[i].value,
                              extent: extent,
                              centred: centred,
                              progress: t,
                              positive: posColor,
                              negative: negColor,
                              axis: scheme.outlineVariant,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      // Amount and percentage get their own fixed columns.
                      // Concatenating them into one box meant the longest row
                      // set the truncation point for every row, so a portfolio
                      // with one six-figure position clipped the percentages
                      // off all the others.
                      SizedBox(
                        width: 118,
                        child: Text(
                          fmt(bars[i].value),
                          textAlign: TextAlign.right,
                          maxLines: 1,
                          style: text.bodySmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: bars[i].value < 0
                                ? negColor
                                : posColor,
                          ),
                        ),
                      ),
                      ?bars[i].detail == null
                          ? null
                          : SizedBox(
                              width: 68,
                              child: Text(
                                bars[i].detail!,
                                textAlign: TextAlign.right,
                                maxLines: 1,
                                style: text.bodySmall?.copyWith(
                                  color: bars[i].value < 0
                                      ? negColor
                                      : posColor,
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

class _DivergingBarPainter extends CustomPainter {
  _DivergingBarPainter({
    required this.value,
    required this.extent,
    required this.progress,
    required this.positive,
    required this.negative,
    required this.axis,
    required this.centred,
  });

  final double value;
  final double extent;
  final bool centred;
  final double progress;
  final Color positive;
  final Color negative;
  final Color axis;

  @override
  void paint(Canvas canvas, Size size) {
    final mid = centred ? size.width / 2 : 0.0;

    // The spine is drawn first and always, even for a row whose bar is too
    // small to see: without it a near-zero value has no anchor and the row
    // reads as missing data rather than as a holding that has barely moved.
    canvas.drawLine(
      Offset(mid, 0),
      Offset(mid, size.height),
      Paint()
        ..color = axis
        ..strokeWidth = ChartTokens.gridLineWidth,
    );

    if (extent <= 0) return;
    final half = (centred ? mid : size.width) - 2;
    final len = (value.abs() / extent) * half * progress;
    if (len <= 0) return;

    final rect = value >= 0
        ? Rect.fromLTWH(mid, 2, len, size.height - 4)
        : Rect.fromLTWH(mid - len, 2, len, size.height - 4);

    canvas.drawRRect(
      RRect.fromRectAndCorners(
        rect,
        // Rounded at the growing end only, so the bar stays welded to its axis.
        topRight: Radius.circular(value >= 0 ? ChartTokens.barCornerRadius : 0),
        bottomRight:
            Radius.circular(value >= 0 ? ChartTokens.barCornerRadius : 0),
        topLeft: Radius.circular(value < 0 ? ChartTokens.barCornerRadius : 0),
        bottomLeft:
            Radius.circular(value < 0 ? ChartTokens.barCornerRadius : 0),
      ),
      Paint()..color = value >= 0 ? positive : negative,
    );
  }

  @override
  bool shouldRepaint(_DivergingBarPainter old) =>
      old.value != value ||
      old.extent != extent ||
      old.centred != centred ||
      old.progress != progress;
}
