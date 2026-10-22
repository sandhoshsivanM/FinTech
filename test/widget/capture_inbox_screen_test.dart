import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/domain/entities/account.dart';
import 'package:khazana/domain/entities/category.dart';
import 'package:khazana/domain/entities/pending_capture.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/features/accounts/providers/account_providers.dart';
import 'package:khazana/features/capture/providers/capture_providers.dart';
import 'package:khazana/features/capture/screens/capture_inbox_screen.dart';
import 'package:khazana/features/capture/services/capture_pipeline.dart';
import 'package:khazana/features/transactions/providers/category_providers.dart';

/// Records what would reach the ledger, without the ledger.
class _RecordingPoster implements CapturePoster {
  final posted = <({String id, Decimal amount, TxnType type, String categoryId})>[];
  final removed = <String>[];

  @override
  Future<String> post({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required DateTime date,
    String? merchant,
    String? accountId,
    required String source,
    required String captureId,
  }) async {
    final id = 'txn${posted.length + 1}';
    posted.add((id: id, amount: amount, type: type, categoryId: categoryId));
    return id;
  }

  @override
  Future<void> remove(String txnId) async => removed.add(txnId);
}

/// The review inbox as the user drives it: the four decisions (approve,
/// correct and approve, reject, undo) through the real buttons, the real
/// review service and a real database — only the ledger write is recorded
/// instead of performed.
void main() {
  late AppDatabase db;
  late _RecordingPoster poster;
  final now = DateTime.now();

  PendingCapture swiggy() => PendingCapture(
        id: 'cap1',
        vaultId: 'v1',
        amount: Decimal.parse('250'),
        type: TxnType.expense,
        merchant: 'swiggy',
        occurredAt: now,
        source: CaptureSource.sms,
        uncategorized: true,
        fingerprint: 'fp1',
        capturedAt: now,
        reasons: const [ReviewReason.unknownAccount],
        accountLast4: '1234',
        profileId: 'hdfc',
      );

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    db = AppDatabase(NativeDatabase.memory());
    poster = _RecordingPoster();
  });

  Future<void> open(WidgetTester tester, {List<PendingCapture>? seed}) async {
    tester.view.physicalSize = const Size(1200, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.runAsync(() async {
      final repo = ProviderContainer(overrides: [databaseProvider.overrideWithValue(db)])
          .read(pendingCaptureRepositoryProvider);
      for (final c in seed ?? [swiggy()]) {
        await repo.save(c);
      }
    });

    await tester.pumpWidget(ProviderScope(
      overrides: [
        appDatabaseProvider.overrideWith((ref) => db),
        databaseProvider.overrideWithValue(db),
        currentVaultIdProvider.overrideWithValue('v1'),
        captureSupportedProvider.overrideWithValue(false),
        capturePosterProvider.overrideWithValue(poster),
        categoryListProvider.overrideWith((ref) => Stream.value(const [
              Category(id: 'food', vaultId: 'v1', name: 'Food', iconCodepoint: 0xe1),
            ])),
        accountListProvider.overrideWith((ref) => Stream.value(const <Account>[])),
      ],
      child: const MaterialApp(home: CaptureInboxScreen()),
    ));
    await settle(tester);
  }

  /// Drop the screen (and its database streams), then close the database.
  /// Drift releases a closed stream on a zero-length timer, so that fires
  /// first. The close is pumped like any other query.
  Future<void> finish(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
    var closed = false;
    db.close().then((_) => closed = true);
    while (!closed) {
      await settle(tester);
    }
  }

  testWidgets('a waiting capture says why it waits and changes nothing yet',
      (tester) async {
    await open(tester);

    expect(find.text('To review · 1'), findsOneWidget);
    expect(find.text('swiggy'), findsOneWidget);
    expect(find.text(ReviewReason.unknownAccount.label), findsOneWidget);
    expect(find.text('Approve'), findsOneWidget);
    expect(poster.posted, isEmpty);
    await finish(tester);
  });

  testWidgets('Approve posts the amount as read and moves it to Recently added',
      (tester) async {
    await open(tester);

    await tap(tester, find.text('Approve'));

    expect(poster.posted.single.amount, Decimal.parse('250'));
    expect(poster.posted.single.categoryId, 'food');
    expect(find.text('To review · 0'), findsOneWidget);
    expect(find.text('Nothing to review'), findsOneWidget);
    expect(find.textContaining('Approved'), findsOneWidget);
    await finish(tester);
  });

  testWidgets('a corrected amount becomes "Save & approve" and posts the correction',
      (tester) async {
    await open(tester);

    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '2500');
    await tester.pump();
    expect(find.text('Save & approve'), findsOneWidget);
    expect(find.textContaining('Read as'), findsOneWidget,
        reason: 'the parsed amount stays visible beside the correction');

    await tap(tester, find.text('Save & approve'));

    expect(poster.posted.single.amount, Decimal.parse('2500'));
    expect(find.textContaining('Corrected & approved'), findsOneWidget);
    await finish(tester);
  });

  testWidgets('an empty amount cannot be approved', (tester) async {
    await open(tester);

    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '');
    await tester.pump();

    expect(find.text('Enter an amount'), findsOneWidget);
    final approve = tester.widget<ButtonStyleButton>(
        find.ancestor(of: find.byIcon(Icons.check), matching: find.bySubtype<ButtonStyleButton>()));
    expect(approve.onPressed, isNull);
    await finish(tester);
  });

  testWidgets('Reject posts nothing and can be restored', (tester) async {
    await open(tester);

    await tap(tester, find.text('Reject'));

    expect(poster.posted, isEmpty, reason: 'a rejected capture never touches a balance');
    expect(find.textContaining('Rejected'), findsOneWidget);

    await tap(tester, find.text('Restore'));

    expect(find.text('To review · 1'), findsOneWidget);
    expect(find.text(ReviewReason.undone.label), findsOneWidget);
    await finish(tester);
  });

  testWidgets('Undo takes the entry back out of the ledger and reopens the capture',
      (tester) async {
    await open(tester);
    await tap(tester, find.text('Approve'));
    expect(poster.posted, hasLength(1));

    await tap(tester, find.text('Undo'));

    expect(poster.removed, [poster.posted.single.id]);
    expect(find.text('To review · 1'), findsOneWidget);
    expect(find.text(ReviewReason.undone.label), findsOneWidget);
    await finish(tester);
  });
}

/// Drift answers on real futures, so each step lets them run before pumping.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await tester.pump();
  }
}

Future<void> tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await settle(tester);
}

