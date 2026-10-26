import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/investments/providers/portfolio_providers.dart';
import 'package:khazana/features/investments/widgets/position_sheet.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/services/portfolio_analytics.dart';

void main() {
  testWidgets('lists the trades and asks before deleting', (tester) async {
    const inst = Instrument(
        id: 'i1', vaultId: 'v', kind: AssetType.equityEtf, name: 'Nifty ETF');
    final trade = Trade(
      id: 't1',
      vaultId: 'v',
      instrumentId: 'i1',
      side: TradeSide.buy,
      quantity: Decimal.fromInt(5),
      pricePerUnit: Decimal.fromInt(100),
      tradeDate: DateTime(2026, 1, 2),
    );
    final other = Trade(
      id: 't2',
      vaultId: 'v',
      instrumentId: 'other',
      side: TradeSide.buy,
      quantity: Decimal.one,
      pricePerUnit: Decimal.one,
      tradeDate: DateTime(2026, 1, 3),
    );
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tradesProvider.overrideWith((ref) => Stream.value([trade, other])),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: PositionSheet(
            position: Position(
                instrument: inst,
                quantity: Decimal.fromInt(5),
                costBasis: Decimal.fromInt(500),
                lots: const []),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('trade-t1')), findsOneWidget);
    expect(find.byKey(const ValueKey('trade-t2')), findsNothing);

    await tester.tap(find.byTooltip('Delete trade'));
    await tester.pumpAndSettle();
    expect(find.text('Delete this trade?'), findsOneWidget);
  });
}
