import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/investments/providers/sip_providers.dart';
import 'package:khazana/features/investments/screens/allocation_screen.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/services/allocation_targets.dart';

/// The prototype's sample portfolio: ₹10,00,000 across six groups.
final _holdings = [
  AllocationInput(AssetType.equityMf, Decimal.parse('410000')),
  AllocationInput(AssetType.equityEtf, Decimal.parse('210000')),
  AllocationInput(AssetType.debtMf, Decimal.parse('140000')),
  AllocationInput(AssetType.digitalGold, Decimal.parse('34000')),
  AllocationInput(AssetType.goldEtf, Decimal.parse('20000')),
  AllocationInput(AssetType.silver, Decimal.parse('8000')),
  AllocationInput(AssetType.sgb, Decimal.parse('3000')),
  AllocationInput(AssetType.ppfEpf, Decimal.parse('80000')),
  AllocationInput(AssetType.cash, Decimal.parse('75000')),
  AllocationInput(AssetType.crypto, Decimal.parse('20000')),
];

const _targets = {
  AssetGroup.equity: 60,
  AssetGroup.debt: 20,
  AssetGroup.gold: 10,
  AssetGroup.retirement: 5,
  AssetGroup.cash: 5,
};

void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  Widget harness(Map<AssetGroup, int> targets) => ProviderScope(
    overrides: [
      appDatabaseProvider.overrideWith((ref) async => db),
      currentVaultIdProvider.overrideWithValue('v1'),
      sipPlansProvider.overrideWith((ref) => Stream.value(const [])),
      allocationViewProvider.overrideWithValue(
        AsyncValue.data(
          AllocationView(
            report: targetVsActual(_holdings, targets),
            targets: targets,
            unconverted: const {},
          ),
        ),
      ),
    ],
    child: const MaterialApp(home: AllocationScreen()),
  );

  FilledButton saveButton(WidgetTester t) =>
      t.widget<FilledButton>(find.byKey(const Key('allocation-save')));

  testWidgets('shows each group with its gap and action', (tester) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness(_targets));
    await tester.pumpAndSettle();

    expect(find.text('Gold & commodities'), findsOneWidget);
    expect(find.text('Add ₹60,000'), findsOneWidget); // Debt
    expect(find.text('Add ₹35,000'), findsOneWidget); // Gold & commodities
    expect(find.text('Over by ₹30,000'), findsOneWidget); // Retirement
    expect(find.text('−3.5%'), findsOneWidget);
    expect(
      find.text('2 categories are off target'),
      findsNothing,
      reason: 'retirement and cash are over too: four are off',
    );
    expect(find.text('4 categories are off target'), findsOneWidget);

    // Expanding the gold group lists Digital Gold and Silver.
    await tester.tap(find.text('Gold & commodities'));
    await tester.pumpAndSettle();
    expect(find.text('Digital Gold · 1'), findsOneWidget);
    expect(find.text('Silver · 1'), findsOneWidget);
  });

  testWidgets('Save is disabled until the targets total 100', (tester) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness(_targets));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('allocation-edit')));
    await tester.pumpAndSettle();
    expect(find.text('Targets total 100%'), findsOneWidget);
    expect(saveButton(tester).onPressed, isNotNull);

    await tester.tap(find.byTooltip('Lower Debt target'));
    await tester.pumpAndSettle();
    expect(find.text('Targets total 99%'), findsOneWidget);
    expect(find.text('Add 1% more to reach 100%.'), findsOneWidget);
    expect(saveButton(tester).onPressed, isNull);

    await tester.tap(find.byTooltip('Raise Gold & commodities target'));
    await tester.pumpAndSettle();
    expect(saveButton(tester).onPressed, isNotNull);
  });

  testWidgets('first-time targets start from today\'s mix and total 100', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness(const {}));
    await tester.pumpAndSettle();
    expect(find.text('Set your targets'), findsOneWidget);

    await tester.tap(find.byKey(const Key('allocation-edit')));
    await tester.pumpAndSettle();
    expect(find.text('Targets total 100%'), findsOneWidget);
    expect(saveButton(tester).onPressed, isNotNull);
  });
}
