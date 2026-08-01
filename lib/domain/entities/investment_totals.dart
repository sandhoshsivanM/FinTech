import 'package:decimal/decimal.dart';

import '../services/portfolio_analytics.dart';
import 'asset_group.dart';

/// Everything the rest of the app needs to know about the portfolio.
///
/// This is the single seam between the Investments feature and every other
/// consumer of investment value: the Dashboard's tile, the health score, the
/// safety net, account net worth, and the daily snapshot.
///
/// Deliberately **not** [Position] or [PortfolioSnapshot]. Two reasons:
///
///  * The health score must not depend on FIFO lot matching. Coupling a score
///    to the disposal algorithm means every change to one is a change to both.
///  * The web client builds this from its own model, so the type has to be
///    expressible without Dart-side lot machinery.
///
/// Before this existed, each consumer summed the legacy `Holdings` table itself
/// while the Investments screen read the lot model — so the Dashboard and the
/// Investments screen showed different numbers for the same portfolio, and
/// sample data (which only wrote the legacy table) rendered a large net worth
/// beside an empty Investments screen. One type, one derivation, one number.
class InvestmentTotals {
  const InvestmentTotals({
    required this.marketValue,
    required this.costBasis,
    required this.valueByGroup,
    required this.positionCount,
    required this.unpricedCount,
    required this.indicativeValue,
    this.lastPricedAt,
    this.unconvertedCurrencies = const {},
  });

  /// What the portfolio is worth. Unpriced positions contribute their cost
  /// basis, so this never silently drops a holding — see [unpricedCount] and
  /// [indicativeValue] for how much of it is not a real market price.
  final Decimal marketValue;

  /// What was paid, charges included.
  final Decimal costBasis;

  /// Market value per chart group. Every present group has an entry; absent
  /// groups are simply missing rather than mapped to zero.
  final Map<AssetGroup, Decimal> valueByGroup;

  /// Distinct instruments currently held. Zero means the vault genuinely has no
  /// investments — which callers must keep distinct from "not loaded yet".
  final int positionCount;

  /// Positions with no recorded price at all.
  final int unpricedCount;

  /// How much of [marketValue] rests on something other than a market quote:
  /// positions carried at cost, priced by hand, or carrying a price whose date
  /// is not real. A total that is a third guesswork should not be presented
  /// with the same confidence as one that isn't.
  final Decimal indicativeValue;

  /// The most recent price observation anywhere in the portfolio.
  final DateTime? lastPricedAt;

  /// Currencies held that could not be converted, because no rate is stored.
  ///
  /// Those holdings are **excluded** from [marketValue] rather than counted at
  /// parity. Counting 100 USD as 100 INR would understate net worth by 99% and
  /// look entirely plausible on screen; an obviously missing number sends the
  /// user to Settings, a quietly wrong one does not.
  final Set<String> unconvertedCurrencies;

  static final empty = InvestmentTotals(
    marketValue: Decimal.zero,
    costBasis: Decimal.zero,
    valueByGroup: const {},
    positionCount: 0,
    unpricedCount: 0,
    indicativeValue: Decimal.zero,
  );

  /// True when some holding could not be expressed in the base currency.
  bool get hasUnconverted => unconvertedCurrencies.isNotEmpty;

  /// True when the vault holds nothing.
  ///
  /// Distinct from "still loading" on purpose: callers must represent that as
  /// an absent value, never as [empty]. Treating a loading portfolio as an
  /// empty one makes the health score visibly dip on every cold open.
  bool get isEmpty => positionCount == 0;

  /// Unrealised gain or loss.
  Decimal get unrealisedPnl => marketValue - costBasis;

  /// Value of the retirement-bucket assets (FD / PPF-EPF / NPS).
  Decimal get retirementValue =>
      valueByGroup[AssetGroup.retirement] ?? Decimal.zero;

  /// Value in growth assets — equity and gold. Used by the score's Future
  /// category, where "am I invested for growth" is a different question from
  /// "am I invested at all".
  Decimal get growthValue =>
      (valueByGroup[AssetGroup.equity] ?? Decimal.zero) +
      (valueByGroup[AssetGroup.gold] ?? Decimal.zero);

  /// The largest single group's share of the portfolio, 0..1. Null when there
  /// is nothing held — an undefined concentration must not read as zero.
  double? get concentration {
    if (marketValue <= Decimal.zero || valueByGroup.isEmpty) return null;
    final largest = valueByGroup.values
        .fold(Decimal.zero, (a, b) => b > a ? b : a);
    return (largest / marketValue).toDouble();
  }

  /// Builds the totals, converting any foreign holding into [baseCurrency].
  ///
  /// [rateFor] returns base units per 1 unit of the given currency, or null
  /// when no rate is known. Passing null for [rateFor] keeps every amount at
  /// face value — correct only for a single-currency vault, which is why the
  /// providers always supply one.
  factory InvestmentTotals.fromSnapshot(
    PortfolioSnapshot snap, {
    String baseCurrency = 'INR',
    Decimal? Function(String currency)? rateFor,
  }) {
    final byGroup = <AssetGroup, Decimal>{};
    final unconverted = <String>{};
    var market = Decimal.zero;
    var cost = Decimal.zero;
    var indicative = Decimal.zero;
    var counted = 0;

    for (final p in snap.positions) {
      final currency = p.instrument.currency;
      Decimal rate = Decimal.one;
      if (currency != baseCurrency) {
        final found = rateFor?.call(currency);
        if (found == null) {
          // Excluded, and named, rather than counted at parity.
          unconverted.add(currency);
          continue;
        }
        rate = found;
      }

      final value = p.marketValue * rate;
      final g = p.instrument.group;
      byGroup[g] = (byGroup[g] ?? Decimal.zero) + value;
      market += value;
      cost += p.costBasis * rate;
      counted++;
      // Not just unpriced: a bond you typed a price for last month is no more
      // a market quote than one you never priced at all.
      if (p.isIndicative) indicative += value;
    }

    return InvestmentTotals(
      marketValue: market,
      costBasis: cost,
      valueByGroup: byGroup,
      positionCount: counted,
      unpricedCount: snap.unpriced.length,
      indicativeValue: indicative,
      lastPricedAt: snap.lastPricedAt,
      unconvertedCurrencies: unconverted,
    );
  }
}
