import 'package:flutter/material.dart';

/// Rises and fades a child in on first build, [order] steps after the first.
///
/// One controller, no timers: the stagger is an [Interval] inside a slightly
/// longer animation, so a widget disposed mid-entrance (or a test that pumps
/// once) leaves nothing pending. Under reduced motion it renders in place.
class Entrance extends StatefulWidget {
  const Entrance({required this.child, this.order = 0, super.key});

  final Widget child;
  final int order;

  static const _step = Duration(milliseconds: 60);
  static const _run = Duration(milliseconds: 420);

  @override
  State<Entrance> createState() => _EntranceState();
}

class _EntranceState extends State<Entrance>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late final Animation<double> _t;

  @override
  void initState() {
    super.initState();
    final delay = Entrance._step * widget.order;
    final total = delay + Entrance._run;
    _c = AnimationController(vsync: this, duration: total);
    _t = CurvedAnimation(
      parent: _c,
      curve: Interval(
        delay.inMicroseconds / total.inMicroseconds,
        1,
        curve: Curves.easeOutCubic,
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _c.value = 1;
    } else if (_c.status == AnimationStatus.dismissed) {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _t,
      child: widget.child,
      builder: (context, child) => Opacity(
        opacity: _t.value,
        child: Transform.translate(
          offset: Offset(0, 12 * (1 - _t.value)),
          child: child,
        ),
      ),
    );
  }
}

/// Counts a number up from zero when it first appears (and from the old value
/// when it changes). [format] owns currency and masking.
class CountUp extends StatelessWidget {
  const CountUp({
    required this.value,
    required this.format,
    this.style,
    this.render,
    super.key,
  });

  final double value;
  final String Function(double) format;
  final TextStyle? style;

  /// Lays out the formatted string, e.g. to set paise smaller.
  final Widget Function(String formatted)? render;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return Semantics(
      label: format(value),
      excludeSemantics: true,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value),
        duration: reduce ? Duration.zero : const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (context, v, _) =>
            render != null ? render!(format(v)) : Text(format(v), style: style),
      ),
    );
  }
}
