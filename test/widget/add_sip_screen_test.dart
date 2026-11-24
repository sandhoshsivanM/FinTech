import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/investments/providers/portfolio_providers.dart';
import 'package:khazana/features/investments/providers/sip_providers.dart';
import 'package:khazana/features/investments/screens/add_sip_screen.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/services/allocation_targets.dart';

void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  // Regression: on a 1080 px phone (411 dp) the half-width "SIP date" field
  // overflowed by 8 px with "23 of month". An overflow throws in tests.
  for (final scale in [1.0, 1.3]) {
    testWidgets('Add a SIP lays out on a phone at text scale $scale', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.625;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWith((ref) async => db),
            currentVaultIdProvider.overrideWithValue('v1'),
            instrumentsProvider.overrideWith(
              (ref) => Stream.value(const [
                Instrument(
                  id: 'i1',
                  vaultId: 'v1',
                  kind: AssetType.equityMf,
                  name: 'Parag Parikh Flexi Cap Fund - Direct Growth',
                ),
              ]),
            ),
            allocationViewProvider.overrideWithValue(
              AsyncValue.data(
                AllocationView(
                  report: targetVsActual(const [], const {}),
                  targets: const {},
                  unconverted: const {},
                ),
              ),
            ),
          ],
          child: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: const MaterialApp(home: AddSipScreen()),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('SIP date'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
