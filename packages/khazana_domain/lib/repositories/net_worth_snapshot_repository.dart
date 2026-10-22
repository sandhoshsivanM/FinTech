import '../entities/net_worth_snapshot.dart';

/// Net-worth snapshot repository contract. Pure domain — no Drift imports.
abstract interface class INetWorthSnapshotRepository {
  Stream<List<NetWorthSnapshot>> watch(String vaultId);
  Future<List<NetWorthSnapshot>> getAll(String vaultId);
  Future<void> save(NetWorthSnapshot snapshot);
}
