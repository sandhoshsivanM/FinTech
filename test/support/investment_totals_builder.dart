import 'package:decimal/decimal.dart';
import 'package:khazana/domain/entities/asset_group.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/investment_totals.dart';

/// Builds an [InvestmentTotals] for tests from plain asset-type amounts.
///
/// Domain services take [InvestmentTotals] rather than a holdings list, so tests
/// no longer need to construct `Holding` rows with quantities and prices just to
/// express "the user has ₹5L in FDs". This says that directly.
///
/// [costBasis] defaults to [marketValue] — a flat portfolio — because most
/// callers are testing something other than P&L and should not have to state a
/// cost they do not care about.
InvestmentTotals totalsOf(
  Map<AssetType, int> byType, {
  int? costBasis,
  int unpricedCount = 0,
  int indicativeValue = 0,
  DateTime? lastPricedAt,
}) {
  final byGroup = <AssetGroup, Decimal>{};
  var total = Decimal.zero;
  for (final e in byType.entries) {
    final g = AssetGroup.of(e.key);
    final v = Decimal.fromInt(e.value);
    byGroup[g] = (byGroup[g] ?? Decimal.zero) + v;
    total += v;
  }
  return InvestmentTotals(
    marketValue: total,
    costBasis: costBasis == null ? total : Decimal.fromInt(costBasis),
    valueByGroup: byGroup,
    positionCount: byType.length,
    unpricedCount: unpricedCount,
    indicativeValue: Decimal.fromInt(indicativeValue),
    lastPricedAt: lastPricedAt,
  );
}

/// A portfolio holding nothing. Distinct from "not loaded" — see
/// [InvestmentTotals.isEmpty].
final noInvestments = InvestmentTotals.empty;
