import 'package:drift/drift.dart';

import '../../domain/entities/recurring_rule.dart';
import '../../domain/entities/transaction.dart';
import '../../domain/repositories/recurring_repository.dart';
import '../database/app_database.dart';
import '../database/recurring_dao.dart';

class DriftRecurringRepository implements IRecurringRepository {
  DriftRecurringRepository(this._dao);
  final RecurringDao _dao;

  @override
  Stream<List<RecurringRule>> watch(String vaultId) =>
      _dao.watchForVault(vaultId).map((rows) => rows.map(_toEntity).toList());

  @override
  Future<List<RecurringRule>> activeRules(String vaultId) async =>
      (await _dao.activeForVault(vaultId)).map(_toEntity).toList();

  @override
  Future<void> save(RecurringRule r) => _dao.upsert(RecurringRulesCompanion(
        id: Value(r.id),
        vaultId: Value(r.vaultId),
        amount: Value(r.amount),
        type: Value(r.type.name),
        categoryId: Value(r.categoryId),
        merchant: Value(r.merchant),
        note: Value(r.note),
        frequency: Value(r.frequency.key),
        nextRun: Value(r.nextRun.millisecondsSinceEpoch),
        active: Value(r.active),
      ));

  @override
  Future<void> delete(String id) => _dao.deleteById(id);

  static RecurringRule _toEntity(RecurringRuleRow r) => RecurringRule(
        id: r.id,
        vaultId: r.vaultId,
        amount: r.amount,
        type: r.type == 'income' ? TxnType.income : TxnType.expense,
        categoryId: r.categoryId,
        merchant: r.merchant,
        note: r.note,
        frequency: Frequency.fromKey(r.frequency),
        nextRun: DateTime.fromMillisecondsSinceEpoch(r.nextRun),
        active: r.active,
      );
}
