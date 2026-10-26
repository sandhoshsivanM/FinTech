import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/services/notification_providers.dart';
import '../../../core/services/notification_sync_service.dart';
import 'package:khazana_domain/entities/recurring_rule.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'transaction_providers.dart';
import 'package:khazana_domain/services/notification_scheduler.dart';
import 'package:khazana_domain/services/recurrence_calculator.dart';

const _uuid = Uuid();

final recurrenceCalculatorProvider =
    Provider<RecurrenceCalculator>((ref) => const RecurrenceCalculator());

final recurringListProvider = StreamProvider<List<RecurringRule>>((ref) {
  return ref
      .watch(recurringRepositoryProvider)
      .watch(ref.watch(currentVaultIdProvider));
});

final recurringActionsProvider =
    Provider<RecurringActions>((ref) => RecurringActions(ref));

class RecurringActions {
  RecurringActions(this._ref);
  final Ref _ref;

  Future<void> add({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required Frequency frequency,
    required DateTime firstRun,
    String? merchant,
    String? accountId,
  }) async {
    await _ref.read(recurringRepositoryProvider).save(RecurringRule(
          id: _uuid.v4(),
          vaultId: _ref.read(currentVaultIdProvider),
          amount: amount,
          type: type,
          categoryId: categoryId,
          merchant: merchant,
          accountId: accountId,
          frequency: frequency,
          nextRun: firstRun,
        ));
    // The whole point of the feature: a bill added now must be handed to the OS
    // now, because the app may never be resumed again before it falls due.
    _ref.reconcileNotifications();
  }

  /// Corrects a rule in place. It keeps its id, so only future postings read
  /// the new figures; transactions already posted stay as they were.
  Future<void> update({
    required RecurringRule rule,
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required Frequency frequency,
    required DateTime nextRun,
    String? merchant,
    String? accountId,
  }) async {
    await _ref.read(recurringRepositoryProvider).save(RecurringRule(
          id: rule.id,
          vaultId: rule.vaultId,
          amount: amount,
          type: type,
          categoryId: categoryId,
          merchant: merchant,
          note: rule.note,
          accountId: accountId,
          frequency: frequency,
          nextRun: nextRun,
          active: rule.active,
        ));
    _ref.reconcileNotifications();
  }

  Future<void> delete(String id) async {
    await _ref.read(recurringRepositoryProvider).delete(id);
    // Alarms outlive the records they describe.
    _ref.reconcileNotifications();
  }

  /// Materializes all due recurring rules into transactions and advances their
  /// nextRun (PRD §14). Returns the number of transactions created.
  Future<int> processDue({DateTime? now}) async {
    final today = now ?? DateTime.now();
    final vaultId = _ref.read(currentVaultIdProvider);
    final repo = _ref.read(recurringRepositoryProvider);
    final calc = _ref.read(recurrenceCalculatorProvider);
    final database = _ref.read(databaseProvider);
    // Materialized rows are ordinary transactions and go through the same
    // TransactionNotifier.add as a hand-entered one, so they reach the ledger
    // (postings, net worth, account balances) instead of bypassing it.
    final notifier = _ref.read(transactionListProvider.notifier);
    final rules = await repo.activeRules(vaultId);

    // Fetched once rather than per occurrence: the name only decides the label
    // of the category's expense account when LedgerWriter first creates it.
    final categoryNames = {
      for (final c in await _ref.read(categoryRepositoryProvider).getAll(vaultId))
        c.id: c.name,
    };

    var created = 0;
    for (final rule in rules) {
      final result = calc.materialize(rule, today);
      if (result.due.isEmpty) continue;
      await database.transaction(() async {
        for (final occ in result.due) {
          await notifier.add(
            amount: rule.amount,
            type: rule.type,
            categoryId: rule.categoryId,
            date: occ.date,
            merchant: rule.merchant,
            note: rule.note ?? 'Recurring',
            categoryName: categoryNames[rule.categoryId],
            accountId: rule.accountId,
          );
          created++;
        }
      });
      await repo.save(rule.copyWith(nextRun: result.newNextRun));
    }
    if (created > 0) {
      await _announce(created, today);
      // Materializing advances every rule's nextRun, so every bill reminder the
      // OS is holding now points at a date that has already passed.
      _ref.reconcileNotifications();
    }
    return created;
  }

  /// Posts ONE occurrence of [rule], optionally at a different [date] or
  /// [amount] than scheduled — a salary due on the 7th that arrived on the 10th
  /// happened on the 10th.
  ///
  /// The rule advances from its SCHEDULED date, never from the date it was
  /// posted on: stepping from a late payment would drag every future occurrence
  /// along with it.
  Future<void> postOnce(
    RecurringRule rule, {
    DateTime? date,
    Decimal? amount,
  }) async {
    final calc = _ref.read(recurrenceCalculatorProvider);
    final notifier = _ref.read(transactionListProvider.notifier);
    final names = {
      for (final c in await _ref
          .read(categoryRepositoryProvider)
          .getAll(_ref.read(currentVaultIdProvider)))
        c.id: c.name,
    };
    await _ref.read(databaseProvider).transaction(() async {
      await notifier.add(
        amount: amount ?? rule.amount,
        type: rule.type,
        categoryId: rule.categoryId,
        date: date ?? rule.nextRun,
        merchant: rule.merchant,
        note: rule.note ?? 'Recurring',
        categoryName: names[rule.categoryId],
        accountId: rule.accountId,
      );
      await _ref.read(recurringRepositoryProvider).save(
          rule.copyWith(nextRun: calc.next(rule.nextRun, rule.frequency)));
    });
    _ref.reconcileNotifications();
  }

  Future<void> _announce(int created, DateTime today) async {
    if (_ref.read(notifyPrefsProvider).allows(NotifyCategory.bills)) {
      // Local-only notification (PRD §2 no server push). The id was hardcoded
      // to 909001, which meant a second run the same day silently replaced the
      // first instead of reporting its own work; keying it to the day makes each
      // run identifiable and still collapses repeats within one.
      final key = 'recurring-materialised:'
          '${today.year}-${today.month}-${today.day}';
      await _ref.read(notificationServiceProvider).showFrom(PlannedNotification(
            dedupeKey: key,
            fireAt: today.millisecondsSinceEpoch,
            category: NotifyCategory.bills,
            title: 'Recurring transactions added',
            body: '$created scheduled transaction(s) were recorded.',
            deepLink: '/app/transactions',
          ));
    }
  }
}

/// Runs recurring materialization once when the DB becomes available.
///
/// Kept on mobile although the web app posts only from "Run due": phone users
/// already rely on bills and salary appearing by themselves, and taking that
/// away would read as data going missing. Run due and Post now are extras.
final recurringProcessorProvider = FutureProvider<int>((ref) async {
  await ref.watch(appDatabaseProvider.future);
  return ref.read(recurringActionsProvider).processDue();
});
