import 'dart:async';

import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/investments/providers/sip_providers.dart';
import 'package:khazana/features/investments/screens/sips_screen.dart';
import 'package:khazana_domain/entities/holding.dart';
import 'package:khazana_domain/entities/sip.dart';

/// The screen's side of Mark done / Skipped / Undo. What those calls write to
/// the vault (a trade plus an instalment, atomically) is pinned against a real
/// database in test/integration/sip_repository_test.dart.
class _FakeActions extends SipActions {
  _FakeActions(super.ref, this.inst);
  final StreamController<List<SipInstalment>> inst;
  final recorded = <SipInstalment>[];
  final calls = <String>[];

  void _emit() => inst.add(List.of(recorded));

  @override
  Future<Decimal?> latestNav(String instrumentId) async =>
      Decimal.parse('96.42');

  @override
  Future<SipInstalment> markDone(
    SipPlan plan,
    CalendarDate due, {
    required Decimal amount,
    required Decimal nav,
  }) async {
    calls.add('done $amount @ $nav');
    final i = SipInstalment(
      id: 'n1',
      sipId: plan.id,
      dueDate: due,
      status: SipInstalmentStatus.done,
      amount: amount,
      units: Decimal.parse('82.971'),
      nav: nav,
      tradeId: 't1',
    );
    recorded.add(i);
    _emit();
    return i;
  }

  @override
  Future<void> markSkipped(SipPlan plan, CalendarDate due) async {
    calls.add('skipped');
    recorded.add(
      SipInstalment(
        id: 'n2',
        sipId: plan.id,
        dueDate: due,
        status: SipInstalmentStatus.skipped,
        amount: Decimal.zero,
      ),
    );
    _emit();
  }

  @override
  Future<void> undo(String instalmentId) async {
    calls.add('undo $instalmentId');
    recorded.removeWhere((i) => i.id == instalmentId);
    _emit();
  }
}

void main() {
  late AppDatabase db;
  setUp(() => db = AppDatabase(NativeDatabase.memory()));
  tearDown(() => db.close());

  const today = CalendarDate(2026, 11, 23);
  final plan = SipPlan(
    id: 's1',
    vaultId: 'v1',
    instrumentId: 'i1',
    name: 'Parag Parikh Flexi Cap',
    assetType: AssetType.equityMf,
    amount: Decimal.parse('8000'),
    dayOfMonth: 23,
    startDate: const CalendarDate(2026, 11, 1),
    stepUpPct: 10,
  );

  late _FakeActions fake;
  Widget harness() {
    final inst = StreamController<List<SipInstalment>>.broadcast();
    return ProviderScope(
      overrides: [
        appDatabaseProvider.overrideWith((ref) async => db),
        currentVaultIdProvider.overrideWithValue('v1'),
        sipTodayProvider.overrideWithValue(today),
        sipPlansProvider.overrideWith((ref) => Stream.value([plan])),
        sipInstalmentsProvider.overrideWith((ref) async* {
          yield const <SipInstalment>[];
          yield* inst.stream;
        }),
        allocationTargetsProvider.overrideWith((ref) => Stream.value(const {})),
        sipActionsProvider.overrideWith(
          (ref) => fake = _FakeActions(ref, inst),
        ),
      ],
      child: const MaterialApp(home: SipsScreen()),
    );
  }

  testWidgets('Mark done records at the prefilled NAV; Undo reverts it', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 3000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    // Started this month, so the first step-up is next April.
    expect(find.text('Due today, 23 Nov'), findsOneWidget);
    expect(find.text('₹8,000'), findsWidgets);
    expect(find.textContaining('+10% each April'), findsOneWidget);

    await tester.tap(find.text('Mark done'));
    await tester.pumpAndSettle();
    expect(find.text('8000'), findsOneWidget);
    expect(find.text('96.42'), findsOneWidget);
    expect(find.text('Records 82.970 units'), findsOneWidget);

    await tester.tap(find.byKey(const Key('markdone-confirm')));
    await tester.pumpAndSettle();
    expect(fake.calls, ['done 8000 @ 96.42']);
    expect(find.text('Recorded: 82.971 units at ₹96.42'), findsOneWidget);

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(fake.calls.last, 'undo n1');
    expect(find.text('Mark done'), findsOneWidget);
  });

  testWidgets('Skipped records nothing but the answer', (tester) async {
    tester.view.physicalSize = const Size(1080, 3000);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(harness());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Skipped'));
    await tester.pumpAndSettle();
    expect(fake.calls, ['skipped']);
    expect(find.text('Skipped this month. Nothing recorded.'), findsOneWidget);
  });

  testWidgets('a NAV must be entered before Record is enabled', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MarkDoneSheet(
            name: 'X',
            due: today,
            amount: Decimal.parse('5000'),
          ),
        ),
      ),
    );
    final record = find.byKey(const Key('markdone-confirm'));
    expect(tester.widget<FilledButton>(record).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('markdone-nav')), '96.42');
    await tester.pump();
    expect(tester.widget<FilledButton>(record).onPressed, isNotNull);
    expect(find.text('Records 51.856 units'), findsOneWidget);
  });
}
