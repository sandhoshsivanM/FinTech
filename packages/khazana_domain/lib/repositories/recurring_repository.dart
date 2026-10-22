import '../entities/recurring_rule.dart';

/// Recurring-rule repository contract (PRD §3C). Pure domain.
abstract interface class IRecurringRepository {
  Stream<List<RecurringRule>> watch(String vaultId);
  Future<List<RecurringRule>> activeRules(String vaultId);
  Future<void> save(RecurringRule rule);
  Future<void> delete(String id);
}
