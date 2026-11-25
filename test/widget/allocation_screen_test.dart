import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/investments/providers/portfolio_providers.dart';
import 'package:khazana/features/investments/providers/sip_providers.dart';
import 'package:khazana_domain/entities/portfolio.dart';
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

  Widget harness(
    Map<AssetGroup, int> targets, {
    List<Instrument> instruments = const [],
  }) => ProviderScope(
    overrides: [
      appDatabaseProvider.overrideWith((ref) async => db),
      currentVaultIdProvider.overrideWithValue('v1'),
      sipPlansProvider.overrideWith((ref) => Stream.value(const [])),
      instrumentsProvider.overrideWith((ref) => Stream.value(instruments)),
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

  // Regression: a childless ColoredBox under loose constraints paints at
  // 0 px, which left both bars blank on a device while every text test passed.
  testWidgets('both summary bars paint every segment at full height', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness(_targets));
    await tester.pumpAndSettle();

    for (final key in ['allocation-bar-actual', 'allocation-bar-target']) {
      final bar = find.byKey(Key(key));
      expect(tester.getSize(bar).width, greaterThan(200), reason: key);
      final segments = find.descendant(
        of: bar,
        matching: find.byType(ColoredBox),
      );
      expect(segments, findsWidgets, reason: key);
      for (final e in segments.evaluate()) {
        final size = tester.getSize(find.byWidget(e.widget));
        expect(size.height, 14, reason: key);
        expect(size.width, greaterThan(0), reason: key);
      }
    }
  });

  testWidgets('an empty target bar still shows its track', (tester) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness(const {}));
    await tester.pumpAndSettle();

    final track = find.descendant(
      of: find.byKey(const Key('allocation-bar-target')),
      matching: find.byType(ColoredBox),
    );
    expect(tester.getSize(track).height, 14);
    expect(tester.getSize(track).width, greaterThan(200));
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

  testWidgets('a gold ETF filed as equity is flagged; Fix re-files it', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    const gold = Instrument(
      id: 'g1',
      vaultId: 'v1',
      kind: AssetType.equityEtf,
      name: 'GOLDBEES',
      symbol: 'GOLDBEES',
    );
    final calls = <String>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          portfolioActionsProvider.overrideWithValue(_RecordingActions(calls)),
        ],
        child: harness(_targets, instruments: const [gold]),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('1 holding looks misfiled'), findsOneWidget);
    expect(calls, isEmpty, reason: 'nothing changes until Fix is tapped');
    await tester.tap(find.byKey(const Key('refile-g1')));
    await tester.pump();
    expect(calls, ['g1 -> gold_etf']);
  });

  testWidgets('no card when every type looks right', (tester) async {
    tester.view.physicalSize = const Size(1080, 4000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness(_targets));
    await tester.pumpAndSettle();
    expect(find.textContaining('misfiled'), findsNothing);
  });
}

class _RecordingActions implements PortfolioActions {
  _RecordingActions(this.calls);
  final List<String> calls;

  @override
  Future<void> setInstrumentKind(String instrumentId, AssetType kind) async =>
      calls.add('$instrumentId -> ${kind.key}');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
