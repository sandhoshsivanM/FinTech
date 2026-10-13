import '../../../core/help/info_hint.dart';
import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/money_format.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../home_palette.dart';
import '../home_providers.dart';
import 'entrance.dart';

/// "Total balance": every live bank and cash account — the money that can
/// actually be spent. Counts up on arrival; the eye is the app-wide ghost mode.
class BalanceHero extends ConsumerWidget {
  const BalanceHero({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ghost = ref.watch(ghostModeProvider);
    final total = ref.watch(liquidBalanceProvider);
    final count = ref.watch(walletCardsProvider)?.where((c) => !c.owed).length;
    final text = Theme.of(context).textTheme;
    final palette = HomePalette.of(context);
    final muted = palette.muted;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'Total balance',
              style: text.bodyMedium?.copyWith(color: muted),
            ),
            const InfoHint('dashboard.totalBalance'),
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: ghost ? 'Show amounts' : 'Hide amounts',
              onPressed: () => ref.read(ghostModeProvider.notifier).toggle(),
              icon: Icon(
                ghost
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 18,
                color: muted,
              ),
            ),
          ],
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          transitionBuilder: (child, a) => ScaleTransition(
            scale: Tween(begin: 0.92, end: 1.0).animate(a),
            child: FadeTransition(opacity: a, child: child),
          ),
          child: ghost || total == null
              ? Text(
                  '₹ ••••••',
                  key: const ValueKey('hidden'),
                  style: _figure(text),
                )
              : CountUp(
                  key: const ValueKey('shown'),
                  value: total.toDouble(),
                  format: (v) =>
                      Money.format(Decimal.parse(v.toStringAsFixed(2))),
                  style: _figure(text),
                  render: (s) => _quietPaise(s, _figure(text), muted),
                ),
        ),
        if (count != null) ...[
          const SizedBox(height: 4),
          Text(
            'Across $count account${count == 1 ? '' : 's'}',
            style: text.bodySmall?.copyWith(color: muted),
          ),
        ],
      ],
    );
  }

  static TextStyle? _figure(TextTheme t) => t.headlineLarge?.copyWith(
    fontSize: 44,
    fontWeight: FontWeight.w300,
    letterSpacing: -1.2,
    fontFeatures: const [FontFeature.tabularFigures()],
  );

  /// The paise, set smaller and muted: the rupees are what a glance should
  /// read. "₹44,36,934.00" → "₹44,36,934" + ".00".
  static Widget _quietPaise(String s, TextStyle? style, Color muted) {
    final m = RegExp(r'^(.*?)([.,]\d{2})$').firstMatch(s);
    if (m == null) return Text(s, style: style);
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: m.group(1)),
          TextSpan(
            text: m.group(2),
            style: TextStyle(
              fontSize: (style?.fontSize ?? 38) * 0.5,
              fontWeight: FontWeight.w500,
              letterSpacing: 0,
              color: muted,
            ),
          ),
        ],
      ),
      style: style,
    );
  }
}
