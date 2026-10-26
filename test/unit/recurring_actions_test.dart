import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/di/data_providers.dart';
import 'package:khazana/core/services/notification_sync_service.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/features/transactions/providers/recurring_providers.dart';
import 'package:khazana_domain/entities/recurring_rule.dart';
import 'package:khazana_domain/entities/transaction.dart';

/// Recurring rules post only when asked (web parity), and what they post is an
/// ordinary transaction: it must reach the ledger, not just the table.
class _NoopSync extends NotificationSyncService {
  _NoopSync(super.ref);
  @override
  void scheduleReconcile({Duration delay = const Duration(seconds: 2)}) {}
}

void main() {
  late AppDatabase db;
  late ProviderContainer container;
  const vault = 'v1';

  Decimal d(String s) => Decimal.parse(s);

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await db
        .into(db.categories)
        .insert(
          CategoriesCompanion.insert(id: 'c1', vaultId: vault, name: 'Rent'),
        );
    container = ProviderContainer(
      overrides: [
        appDatabaseProvider.overrideWith((ref) async => db),
        currentVaultIdProvider.overrideWithValue(vault),
        notificationSyncProvider.overrideWith(_NoopSync.new),
      ],
    );
    await container.read(appDatabaseProvider.future);
  });

  tearDown(() async {
    container.dispose();
    await db.close();
  });

  RecurringRule rule({
    String id = 'r1',
    DateTime? nextRun,
    String? accountId,
  }) => RecurringRule(
    id: id,
    vaultId: vault,
    amount: d('1000'),
    type: TxnType.expense,
    categoryId: 'c1',
    merchant: 'Landlord',
    accountId: accountId,
    frequency: Frequency.monthly,
    nextRun: nextRun ?? DateTime(2026, 1, 7),
  );

  Future<RecurringRule> stored(String id) async =>
      (await container.read(recurringRepositoryProvider).activeRules(vault))
          .firstWhere((r) => r.id == id);

  test(
    'processDue posts every due occurrence with postings and advances',
    () async {
      await container.read(recurringRepositoryProvider).save(rule());

      final n = await container
          .read(recurringActionsProvider)
          .processDue(now: DateTime(2026, 3, 10));

      expect(n, 3); // Jan, Feb, Mar
      final txns = await container
          .read(transactionRepositoryProvider)
          .getAll(vault);
      expect(txns, hasLength(3));
      expect(txns.every((t) => t.accountId != null), isTrue);
      // Two legs per entry: the ledger saw them, not just the table.
      final postings = await container
          .read(postingRepositoryProvider)
          .getAll(vault);
      expect(postings, hasLength(6));
      expect((await stored('r1')).nextRun, DateTime(2026, 4, 7));
    },
  );

  test('processDue is idempotent: a second run posts nothing', () async {
    await container.read(recurringRepositoryProvider).save(rule());
    final actions = container.read(recurringActionsProvider);
    await actions.processDue(now: DateTime(2026, 1, 20));
    expect(await actions.processDue(now: DateTime(2026, 1, 20)), 0);
    expect(await container.read(transactionRepositoryProvider).count(vault), 1);
  });

  test(
    'postOnce uses the override date and amount, advances from schedule',
    () async {
      final r = rule(nextRun: DateTime(2026, 1, 7));
      await container.read(recurringRepositoryProvider).save(r);

      await container
          .read(recurringActionsProvider)
          .postOnce(r, date: DateTime(2026, 1, 10), amount: d('1200'));

      final txns = await container
          .read(transactionRepositoryProvider)
          .getAll(vault);
      expect(txns, hasLength(1));
      expect(txns.single.date, DateTime(2026, 1, 10));
      expect(txns.single.amount, d('1200'));
      expect(
        await container.read(postingRepositoryProvider).getAll(vault),
        hasLength(2),
      );
      // Late once, not late forever: the schedule steps from the 7th.
      expect((await stored('r1')).nextRun, DateTime(2026, 2, 7));
    },
  );

  test('postOnce without overrides matches the scheduled occurrence', () async {
    final r = rule();
    await container.read(recurringRepositoryProvider).save(r);
    await container.read(recurringActionsProvider).postOnce(r);
    final t =
        (await container.read(transactionRepositoryProvider).getAll(vault))
            .single;
    expect(t.date, r.nextRun);
    expect(t.amount, r.amount);
  });

  test('update keeps the id and replaces the editable fields', () async {
    final r = rule();
    await container.read(recurringRepositoryProvider).save(r);

    await container
        .read(recurringActionsProvider)
        .update(
          rule: r,
          amount: d('1500'),
          type: TxnType.expense,
          categoryId: 'c1',
          frequency: Frequency.weekly,
          nextRun: DateTime(2026, 5, 1),
          merchant: 'New landlord',
        );

    final all = await container
        .read(recurringRepositoryProvider)
        .activeRules(vault);
    expect(all, hasLength(1));
    final u = all.single;
    expect(u.id, 'r1');
    expect(u.amount, d('1500'));
    expect(u.frequency, Frequency.weekly);
    expect(u.nextRun, DateTime(2026, 5, 1));
    expect(u.merchant, 'New landlord');
    expect(u.accountId, isNull);
  });
}
