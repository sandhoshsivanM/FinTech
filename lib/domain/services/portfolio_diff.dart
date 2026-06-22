import 'package:decimal/decimal.dart';

import '../entities/holding.dart';

/// A holding parsed from a broker file, before it is reconciled with the DB.
class StagedHolding {
  const StagedHolding({
    required this.symbol,
    required this.exchange,
    required this.quantity,
    required this.avgCost,
    this.assetType = AssetType.equityEtf,
  });

  final String symbol;
  final String exchange;
  final Decimal quantity;
  final Decimal avgCost;
  final AssetType assetType;
}

enum ChangeKind { added, changed, unchanged }

class HoldingChange {
  const HoldingChange({
    required this.kind,
    required this.staged,
    this.existing,
  });
  final ChangeKind kind;
  final StagedHolding staged;
  final Holding? existing;
}

/// Result of reconciling a parsed file against current holdings.
class PortfolioDiff {
  const PortfolioDiff(this.changes);
  final List<HoldingChange> changes;

  List<HoldingChange> get added =>
      changes.where((c) => c.kind == ChangeKind.added).toList();
  List<HoldingChange> get changed =>
      changes.where((c) => c.kind == ChangeKind.changed).toList();
  List<HoldingChange> get unchanged =>
      changes.where((c) => c.kind == ChangeKind.unchanged).toList();

  /// Idempotent re-import: nothing new and nothing changed (PRD §16).
  bool get isNoOp => added.isEmpty && changed.isEmpty;
}

/// Reconciles parsed holdings against the database (PRD §14 idempotent upsert,
/// diff preview). Pure Dart, matches by symbol.
class PortfolioDiffEngine {
  const PortfolioDiffEngine();

  PortfolioDiff diff(List<Holding> existing, List<StagedHolding> staged) {
    final bySymbol = {for (final h in existing) h.symbol: h};
    final changes = <HoldingChange>[
      for (final s in staged)
        if (!bySymbol.containsKey(s.symbol))
          HoldingChange(kind: ChangeKind.added, staged: s)
        else
          _compare(bySymbol[s.symbol]!, s),
    ];
    return PortfolioDiff(changes);
  }

  HoldingChange _compare(Holding existing, StagedHolding s) {
    final same =
        existing.quantity == s.quantity && existing.avgCost == s.avgCost;
    return HoldingChange(
      kind: same ? ChangeKind.unchanged : ChangeKind.changed,
      staged: s,
      existing: existing,
    );
  }
}
