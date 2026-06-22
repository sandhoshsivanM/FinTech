import 'dart:async';

import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/repositories/transaction_repository.dart';

const _uuid = Uuid();

/// Sealed transaction state (PRD §3C: Loading / Data / Error).
sealed class TransactionState {
  const TransactionState();
}

class TransactionLoading extends TransactionState {
  const TransactionLoading();
}

class TransactionData extends TransactionState {
  const TransactionData(this.transactions);
  final List<Txn> transactions;
}

class TransactionError extends TransactionState {
  const TransactionError(this.message);
  final String message;
}

/// Streams the vault's transactions and exposes CRUD (PRD §3C naming).
class TransactionNotifier extends StateNotifier<TransactionState> {
  TransactionNotifier(this._repo, this._vaultId)
      : super(const TransactionLoading()) {
    _sub = _repo.watch(_vaultId).listen(
          (txns) => state = TransactionData(txns),
          onError: (Object e) => state = TransactionError(e.toString()),
        );
  }

  final ITransactionRepository _repo;
  final String _vaultId;
  late final StreamSubscription<List<Txn>> _sub;

  Future<void> add({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required DateTime date,
    String? merchant,
    String? note,
  }) {
    final now = DateTime.now();
    return _repo.save(Txn(
      id: _uuid.v4(),
      vaultId: _vaultId,
      amount: amount,
      type: type,
      categoryId: categoryId,
      date: date,
      merchant: merchant,
      note: note,
      createdAt: now,
    ));
  }

  Future<void> update(Txn txn) => _repo.save(txn);

  Future<void> remove(String id) => _repo.delete(id);

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

final transactionListProvider =
    StateNotifierProvider<TransactionNotifier, TransactionState>((ref) {
  final repo = ref.watch(transactionRepositoryProvider);
  final vaultId = ref.watch(currentVaultIdProvider);
  return TransactionNotifier(repo, vaultId);
});
