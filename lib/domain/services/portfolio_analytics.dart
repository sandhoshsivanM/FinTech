import 'package:decimal/decimal.dart';

import '../entities/asset_group.dart';
import '../entities/portfolio.dart';
import 'xirr_calculator.dart';

/// Lot-level portfolio analytics: cost basis, realised and unrealised P&L, and
/// roll-ups by any dimension.
///
/// Pure Dart, Decimal money, no I/O — so every number here is unit-testable.
///
/// The load-bearing invariant, asserted in the tests: **a roll-up along any
/// dimension must sum to the portfolio total.** If sector-wise P&L doesn't add
/// up to total P&L, the roll-up is wrong.

/// An open (still-held) lot after FIFO matching.
class OpenLot {
  const OpenLot({
    required this.tradeId,
    required this.instrumentId,
    required this.quantity,
    required this.costBasis,
    required this.tradeDate,
    required this.isReviewed,
  });

  final String tradeId;
  final String instrumentId;

  /// Remaining quantity — may be less than the original buy if partly sold.
  final Decimal quantity;

  /// Cost of [quantity] units, charges included, pro-rated if partly sold.
  final Decimal costBasis;

  final DateTime tradeDate;
  final bool isReviewed;

  /// Per-unit cost including charges.
  Decimal get unitCost =>
      quantity == Decimal.zero ? Decimal.zero : _div(costBasis, quantity);
}

/// A closed lot: a sell matched against one or more buys, FIFO.
class Disposal {
  const Disposal({
    required this.instrumentId,
    required this.quantity,
    required this.costBasis,
    required this.proceeds,
    required this.buyDate,
    required this.sellDate,
  });

  final String instrumentId;
  final Decimal quantity;

  /// What the disposed units cost, charges included.
  final Decimal costBasis;

  /// What the sale netted, after charges.
  final Decimal proceeds;

  final DateTime buyDate;
  final DateTime sellDate;

  /// Realised gain or loss.
  Decimal get realisedPnl => proceeds - costBasis;

  /// Holding period, used for the short/long-term tax split.
  Duration get holdingPeriod => sellDate.difference(buyDate);
}

/// A current position in one instrument.
class Position {
  const Position({
    required this.instrument,
    required this.quantity,
    required this.costBasis,
    required this.lots,
    this.price,
    this.pricedAt,
  });

  final Instrument instrument;
  final Decimal quantity;

  /// Total cost of the held units, charges included.
  final Decimal costBasis;

  final List<OpenLot> lots;

  /// Latest known price. Null when never priced.
  final Decimal? price;

  /// When [price] was observed. Null when never priced.
  ///
  /// Callers must surface this: with manually entered prices, a P&L number
  /// without a date is a lie.
  final DateTime? pricedAt;

  /// True when we have no price and are therefore showing cost, not value.
  bool get isUnpriced => price == null;

  /// Market value, falling back to cost basis when unpriced so totals never
  /// silently drop a holding.
  Decimal get marketValue =>
      price == null ? costBasis : quantity * price!;

  /// Unrealised gain or loss. Zero while unpriced, by construction.
  Decimal get unrealisedPnl => marketValue - costBasis;

  /// Per-unit average cost including charges.
  Decimal get avgCost =>
      quantity == Decimal.zero ? Decimal.zero : _div(costBasis, quantity);

  /// Any lot still awaiting review — the position's numbers are provisional.
  bool get hasUnreviewedLots => lots.any((l) => !l.isReviewed);
}

/// One row of a roll-up (by sector, industry, market cap, asset group, …).
class RollupRow {
  const RollupRow({
    required this.key,
    required this.label,
    required this.marketValue,
    required this.costBasis,
    required this.instrumentCount,
    required this.unpricedCount,
  });

  /// Stable key. `null` is represented as [unclassifiedKey], never dropped.
  final String key;
  final String label;
  final Decimal marketValue;
  final Decimal costBasis;
  final int instrumentCount;

  /// How many instruments in this row have no price. When > 0 the row's P&L is
  /// understated, so the UI must say so rather than implying precision.
  final int unpricedCount;

  Decimal get pnl => marketValue - costBasis;

  /// Return as a percentage of cost. Null when cost is zero — an undefined
  /// percentage must not be rendered as 0%.
  Decimal? get pnlPct => costBasis == Decimal.zero
      ? null
      : _div(pnl * Decimal.fromInt(100), costBasis);
}

/// The dimension a roll-up groups by.
/// Note: there is deliberately no `account` dimension. `accountId` lives on
/// [Trade], so a position can span several broker accounts — grouping by account
/// is a lot-level roll-up with a different shape, not a position-level one.
/// Offering it here would return "Unclassified" for everything, which is worse
/// than not offering it.
enum RollupDimension {
  sector,
  industry,
  marketCap,
  assetGroup,
  assetType,
  instrument,
  currency,
}

/// Key/label used when a dimension value is missing.
const unclassifiedKey = '__unclassified__';
const unclassifiedLabel = 'Unclassified';

/// One node of a two-level roll-up: a parent row and the rows inside it.
class RollupNode {
  const RollupNode({required this.row, required this.children});

  final RollupRow row;

  /// Never empty for a parent that is present — see [PortfolioAnalytics.sunburst].
  final List<RollupRow> children;
}

/// What the sunburst's outer ring splits each group by.
///
/// Only equities carry a sector in the bundled classification table, so the
/// honest split is "sector where we have one, sub-type otherwise". Groups whose
/// members would each be their own sub-type split by instrument instead, since
/// a ring of one segment says nothing.
const kDefaultSunburstChildren = <AssetGroup, RollupDimension>{
  AssetGroup.equity: RollupDimension.sector,
  AssetGroup.debt: RollupDimension.assetType,
  AssetGroup.retirement: RollupDimension.assetType,
  AssetGroup.gold: RollupDimension.instrument,
  AssetGroup.realEstate: RollupDimension.instrument,
  AssetGroup.crypto: RollupDimension.instrument,
  AssetGroup.cash: RollupDimension.instrument,
};

/// A whole-portfolio view at a point in time.
class PortfolioSnapshot {
  const PortfolioSnapshot({
    required this.positions,
    required this.disposals,
    required this.dividends,
  });

  final List<Position> positions;
  final List<Disposal> disposals;
  final List<Dividend> dividends;

  Decimal get marketValue =>
      positions.fold(Decimal.zero, (s, p) => s + p.marketValue);

  Decimal get costBasis =>
      positions.fold(Decimal.zero, (s, p) => s + p.costBasis);

  Decimal get unrealisedPnl => marketValue - costBasis;

  Decimal get realisedPnl =>
      disposals.fold(Decimal.zero, (s, d) => s + d.realisedPnl);

  Decimal get dividendIncome =>
      dividends.fold(Decimal.zero, (s, d) => s + d.netAmount);

  /// Capital P&L only — realised plus unrealised, excluding dividends, which are
  /// reported separately so the two are never conflated.
  Decimal get totalPnl => unrealisedPnl + realisedPnl;

  /// Unrealised return as a percentage of cost. Null when cost is zero.
  Decimal? get unrealisedPnlPct => costBasis == Decimal.zero
      ? null
      : _div(unrealisedPnl * Decimal.fromInt(100), costBasis);

  /// Positions with no price. Their P&L reads as zero, so the UI must disclose.
  Iterable<Position> get unpriced => positions.where((p) => p.isUnpriced);

  /// The most recent price observation across the portfolio, or null if none.
  DateTime? get lastPricedAt {
    DateTime? latest;
    for (final p in positions) {
      final at = p.pricedAt;
      if (at == null) continue;
      if (latest == null || at.isAfter(latest)) latest = at;
    }
    return latest;
  }
}

/// Builds positions and P&L from trades, prices and dividends.
class PortfolioAnalytics {
  const PortfolioAnalytics();

  /// Matches buys against sells FIFO for a single instrument.
  ///
  /// Trades are sorted by date, then by id so the result is deterministic when
  /// two trades share a timestamp. A sell with no matching buy is skipped rather
  /// than producing a negative lot — a short position is not something this app
  /// models, and silently inventing one would corrupt every downstream total.
  ({List<OpenLot> open, List<Disposal> closed}) matchFifo(
    List<Trade> trades,
  ) {
    final sorted = [...trades]..sort((a, b) {
        final byDate = a.tradeDate.compareTo(b.tradeDate);
        return byDate != 0 ? byDate : a.id.compareTo(b.id);
      });

    final open = <OpenLot>[];
    final closed = <Disposal>[];

    for (final t in sorted) {
      if (t.side == TradeSide.buy) {
        open.add(OpenLot(
          tradeId: t.id,
          instrumentId: t.instrumentId,
          quantity: t.quantity,
          costBasis: t.netAmount,
          tradeDate: t.tradeDate,
          isReviewed: t.isReviewed,
        ));
        continue;
      }

      // Sell: consume the oldest open lots first.
      var remaining = t.quantity;
      // Proceeds per unit are net of the sell's charges, spread over the whole
      // sale so a partial match carries its share.
      final proceedsPerUnit =
          t.quantity == Decimal.zero ? Decimal.zero : _div(t.netAmount, t.quantity);

      while (remaining > Decimal.zero && open.isNotEmpty) {
        final lot = open.first;
        final take = remaining < lot.quantity ? remaining : lot.quantity;

        closed.add(Disposal(
          instrumentId: t.instrumentId,
          quantity: take,
          costBasis: lot.unitCost * take,
          proceeds: proceedsPerUnit * take,
          buyDate: lot.tradeDate,
          sellDate: t.tradeDate,
        ));

        remaining -= take;
        final left = lot.quantity - take;
        if (left <= Decimal.zero) {
          open.removeAt(0);
        } else {
          open[0] = OpenLot(
            tradeId: lot.tradeId,
            instrumentId: lot.instrumentId,
            quantity: left,
            costBasis: lot.unitCost * left,
            tradeDate: lot.tradeDate,
            isReviewed: lot.isReviewed,
          );
        }
      }
      // `remaining > 0` here means selling more than was ever bought. Ignored
      // deliberately — see the note above.
    }

    return (open: open, closed: closed);
  }

  /// Builds a full snapshot.
  ///
  /// [latestPrices] maps instrument id to its most recent price observation.
  PortfolioSnapshot snapshot({
    required List<Instrument> instruments,
    required List<Trade> trades,
    required Map<String, InstrumentPrice> latestPrices,
    List<Dividend> dividends = const [],
  }) {
    final byInstrument = <String, List<Trade>>{};
    for (final t in trades) {
      (byInstrument[t.instrumentId] ??= []).add(t);
    }

    final positions = <Position>[];
    final disposals = <Disposal>[];

    for (final inst in instruments) {
      final result = matchFifo(byInstrument[inst.id] ?? const []);
      disposals.addAll(result.closed);

      final qty =
          result.open.fold(Decimal.zero, (s, l) => s + l.quantity);
      final cost =
          result.open.fold(Decimal.zero, (s, l) => s + l.costBasis);

      // Fully exited instruments keep contributing realised P&L but are not
      // positions any more.
      if (qty <= Decimal.zero) continue;

      final price = latestPrices[inst.id];
      positions.add(Position(
        instrument: inst,
        quantity: qty,
        costBasis: cost,
        lots: result.open,
        price: price?.price,
        pricedAt: price?.asOf,
      ));
    }

    return PortfolioSnapshot(
      positions: positions,
      disposals: disposals,
      dividends: dividends,
    );
  }

  /// Groups positions along [dimension] and totals value, cost and P&L.
  ///
  /// This single method is what answers "sector-wise profit and loss". Rows come
  /// back sorted by market value descending — safe because a roll-up table is
  /// read as a ranking, unlike a chart, whose colour adjacency must stay fixed
  /// (see [kAssetGroupOrder]).
  List<RollupRow> rollup(
    List<Position> positions,
    RollupDimension dimension,
  ) {
    final value = <String, Decimal>{};
    final cost = <String, Decimal>{};
    final labels = <String, String>{};
    final counts = <String, int>{};
    final unpriced = <String, int>{};

    for (final p in positions) {
      final (key, label) = _bucket(p, dimension);
      value[key] = (value[key] ?? Decimal.zero) + p.marketValue;
      cost[key] = (cost[key] ?? Decimal.zero) + p.costBasis;
      labels[key] = label;
      counts[key] = (counts[key] ?? 0) + 1;
      if (p.isUnpriced) unpriced[key] = (unpriced[key] ?? 0) + 1;
    }

    final rows = [
      for (final key in value.keys)
        RollupRow(
          key: key,
          label: labels[key]!,
          marketValue: value[key]!,
          costBasis: cost[key]!,
          instrumentCount: counts[key]!,
          unpricedCount: unpriced[key] ?? 0,
        ),
    ]..sort((a, b) => b.marketValue.compareTo(a.marketValue));

    return rows;
  }

  /// Roll-up by asset group in the fixed chart order.
  ///
  /// Use this for the allocation chart. [rollup] sorts by value, which would
  /// make colour adjacency data-dependent and break the palette's colourblind
  /// guarantees.
  List<RollupRow> allocationByGroup(List<Position> positions) {
    final rows = rollup(positions, RollupDimension.assetGroup);
    final byKey = {for (final r in rows) r.key: r};
    return [
      for (final g in kAssetGroupOrder)
        if (byKey.containsKey(g.name)) byKey[g.name]!,
    ];
  }

  /// Two-level roll-up for the sunburst: asset group, then a child dimension.
  ///
  /// The inner ring is **always** emitted in [kAssetGroupOrder] and is **never**
  /// sorted by value — the palette's colourblind guarantee is a property of that
  /// exact adjacency, and re-sorting drops the worst adjacent protanopia ΔE from
  /// 9.1 to 3.2. Children carry no independent hue (they inherit the parent's at
  /// a lower lightness), so they *are* sorted, largest first.
  ///
  /// A group whose children are all unclassified yields exactly one child keyed
  /// [unclassifiedKey], never zero — an empty child list would leave a hollow
  /// gap in the outer ring where the parent's arc should be.
  List<RollupNode> sunburst(
    List<Position> positions, {
    Map<AssetGroup, RollupDimension> childByGroup = kDefaultSunburstChildren,
    RollupDimension defaultChild = RollupDimension.sector,
  }) {
    final byGroup = <AssetGroup, List<Position>>{};
    for (final p in positions) {
      (byGroup[p.instrument.group] ??= []).add(p);
    }

    return [
      for (final g in kAssetGroupOrder)
        if (byGroup.containsKey(g))
          RollupNode(
            row: _groupRow(g, byGroup[g]!),
            // Reuses [rollup] rather than re-bucketing: one implementation of
            // "group these positions", so a parent and its children cannot
            // disagree about which position went where.
            children: rollup(byGroup[g]!, childByGroup[g] ?? defaultChild),
          ),
    ];
  }

  RollupRow _groupRow(AssetGroup g, List<Position> members) {
    var value = Decimal.zero;
    var cost = Decimal.zero;
    var unpriced = 0;
    for (final p in members) {
      value += p.marketValue;
      cost += p.costBasis;
      if (p.isUnpriced) unpriced++;
    }
    return RollupRow(
      key: g.name,
      label: g.label,
      marketValue: value,
      costBasis: cost,
      instrumentCount: members.length,
      unpricedCount: unpriced,
    );
  }

  (String, String) _bucket(Position p, RollupDimension d) {
    final i = p.instrument;
    return switch (d) {
      RollupDimension.sector => _orUnclassified(i.sector),
      RollupDimension.industry => _orUnclassified(i.industry),
      RollupDimension.marketCap => i.marketCapBand == null
          ? (unclassifiedKey, unclassifiedLabel)
          : (i.marketCapBand!.key, i.marketCapBand!.label),
      RollupDimension.assetGroup => (i.group.name, i.group.label),
      RollupDimension.assetType => (i.kind.key, i.kind.label),
      RollupDimension.instrument => (i.id, i.name),
      RollupDimension.currency => (i.currency, i.currency),
    };
  }

  (String, String) _orUnclassified(String? v) =>
      (v == null || v.isEmpty) ? (unclassifiedKey, unclassifiedLabel) : (v, v);

  /// Annualised return (XIRR) for the whole portfolio.
  ///
  /// Cash flows are: buys negative, sells positive, dividends positive, and the
  /// current market value as a positive terminal flow. Returns null when there
  /// is nothing to solve or the solver does not converge — never a fabricated
  /// number.
  double? xirr({
    required List<Trade> trades,
    required List<Dividend> dividends,
    required Decimal currentValue,
    required DateTime asOf,
  }) {
    final flows = <CashFlow>[
      for (final t in trades)
        CashFlow(
          t.tradeDate,
          t.side == TradeSide.buy ? -t.netAmount : t.netAmount,
        ),
      for (final d in dividends) CashFlow(d.paidOn, d.netAmount),
    ];
    if (flows.isEmpty) return null;
    if (currentValue > Decimal.zero) {
      flows.add(CashFlow(asOf, currentValue));
    }
    // XirrCalculator anchors t0 on `flows.first`, so the list must be in date
    // order or every discount exponent is wrong.
    flows.sort((a, b) => a.date.compareTo(b.date));
    return const XirrCalculator().compute(flows);
  }
}

/// Decimal division at a fixed scale.
///
/// `Decimal` has no exact division, so a scale must be chosen. 10 places is far
/// beyond currency precision, which keeps per-unit intermediates from visibly
/// drifting when they are multiplied back out.
Decimal _div(Decimal a, Decimal b) =>
    (a / b).toDecimal(scaleOnInfinitePrecision: 10);
