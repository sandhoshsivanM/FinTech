import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/money_format.dart';
import 'package:khazana_domain/entities/transaction.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../../transactions/providers/transaction_providers.dart';
import '../home_palette.dart';

/// This calendar month in three numbers — earned, spent, kept — each
/// with a tinted round icon. The twin of `webapp/src/components/home/MonthTiles.tsx`.
class MonthTiles extends ConsumerWidget {
  const MonthTiles({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(transactionListProvider);
    final ghost = ref.watch(ghostModeProvider);
    final txns = state is TransactionData ? state.transactions : const <Txn>[];
    final now = DateTime.now();
    var income = Decimal.zero, spent = Decimal.zero;
    for (final t in txns) {
      if (t.date.year != now.year || t.date.month != now.month) continue;
      if (t.type == TxnType.income) {
        income += t.amount;
      } else {
        spent += t.amount;
      }
    }
    final saved = income - spent;
    final tiles = [
      ('Income', Money.format(income), Icons.trending_up_rounded),
      ('Spent', Money.format(spent), Icons.trending_down_rounded),
      (
        'Saved',
        '${saved < Decimal.zero ? '−' : ''}${Money.format(saved.abs())}',
        Icons.savings_outlined,
      ),
    ];
    final p = HomePalette.of(context);
    return Row(
      children: [
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: HomeGroup(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          tiles[i].$1,
                          style: TextStyle(fontSize: 11.5, color: p.muted),
                        ),
                      ),
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: p.blue.withValues(alpha: 0.14),
                        ),
                        child: Icon(tiles[i].$3, size: 14, color: p.blue),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      ghost ? '••••' : tiles[i].$2,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w300,
                        color: p.ink,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}
