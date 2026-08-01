import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/asset_group.dart';
import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/portfolio.dart';
import 'package:khazana/domain/services/portfolio_analytics.dart';

/// Invariants for the two-level roll-up behind the sunburst.
///
/// These are the ones that break first and break silently: a chart whose rings
/// do not reconcile still renders, it just shows the wrong shape.
void main() {
  const pa = PortfolioAnalytics();
  Decimal d(String s) => Decimal.parse(s);
  final now = DateTime(2026, 6, 1);

  Position position({
    required String id,
    required AssetType kind,
    String? sector,
    String value = '1000',
    String cost = '1000',
    bool priced = true,
  }) {
    final instrument = Instrument(
      id: id,
      vaultId: 'v',
      kind: kind,
      name: id,
      symbol: id,
      sectorCode: sector,
    );
    return Position(
      instrument: instrument,
      quantity: Decimal.one,
      costBasis: d(cost),
      lots: const [],
      price: priced ? d(value) : null,
      pricedAt: priced ? now : null,
    );
  }

  test('parents come back in kAssetGroupOrder, filtered to those present', () {
    // Built deliberately out of order, and with the biggest group last, so a
    // value sort or an insertion-order pass would both produce a different list.
    final nodes = pa.sunburst([
      position(id: 'CASH1', kind: AssetType.cash, value: '100'),
      position(id: 'GOLD1', kind: AssetType.goldEtf, value: '500'),
      position(id: 'EQ1', kind: AssetType.equityEtf, value: '9000'),
    ]);

    // Asserting the LIST, not a set: a set assertion passes while the ordering
    // guarantee — which is what makes the palette colourblind-safe — silently
    // breaks.
    expect(nodes.map((n) => n.row.key).toList(),
        [AssetGroup.equity.name, AssetGroup.gold.name, AssetGroup.cash.name]);
  });

  test('children sum exactly to their parent', () {
    final nodes = pa.sunburst([
      position(id: 'A', kind: AssetType.equityEtf, sector: 'IT', value: '3000'),
      position(id: 'B', kind: AssetType.equityEtf, sector: 'IT', value: '2000'),
      position(
          id: 'C',
          kind: AssetType.equityEtf,
          sector: 'Financial Services',
          value: '5000'),
      position(id: 'F', kind: AssetType.fd, value: '4000'),
    ]);

    for (final n in nodes) {
      final summed = n.children
          .fold(Decimal.zero, (a, c) => a + c.marketValue);
      expect(summed, n.row.marketValue,
          reason: '${n.row.label} children do not reconcile to the parent');
      final cost = n.children.fold(Decimal.zero, (a, c) => a + c.costBasis);
      expect(cost, n.row.costBasis, reason: '${n.row.label} cost basis');
    }
  });

  test('parents sum exactly to the portfolio total', () {
    final positions = [
      position(id: 'A', kind: AssetType.equityEtf, sector: 'IT', value: '3000'),
      position(id: 'B', kind: AssetType.goldEtf, value: '1500'),
      position(id: 'C', kind: AssetType.fd, value: '5500'),
    ];
    final snapshot = pa.snapshot(
      instruments: positions.map((p) => p.instrument).toList(),
      trades: const [],
      latestPrices: const {},
      dividends: const [],
    );
    final nodes = pa.sunburst(positions);
    final summed =
        nodes.fold(Decimal.zero, (a, n) => a + n.row.marketValue);

    expect(summed, d('10000'));
    // And the snapshot built from the same instruments has no positions at all
    // without trades — a guard that this test is comparing what it thinks.
    expect(snapshot.positions, isEmpty);
  });

  test('unpriced counts roll up from children to parent', () {
    final nodes = pa.sunburst([
      position(id: 'A', kind: AssetType.equityEtf, sector: 'IT', value: '1000'),
      position(
          id: 'B',
          kind: AssetType.equityEtf,
          sector: 'IT',
          cost: '2000',
          priced: false),
      position(
          id: 'C',
          kind: AssetType.equityEtf,
          sector: 'Energy',
          cost: '3000',
          priced: false),
    ]);
    final equity = nodes.single;
    expect(equity.row.unpricedCount, 2);
    expect(
      equity.children.fold(0, (a, c) => a + c.unpricedCount),
      equity.row.unpricedCount,
    );
  });

  test('a group with no classified children yields exactly one child', () {
    // Never zero: an empty child list leaves a hollow gap in the outer ring
    // where the parent's arc should be.
    final nodes = pa.sunburst([
      position(id: 'X', kind: AssetType.equityEtf, value: '1000'),
      position(id: 'Y', kind: AssetType.equityEtf, value: '2000'),
    ]);
    final equity = nodes.single;
    expect(equity.children, hasLength(1));
    expect(equity.children.single.key, unclassifiedKey);
    expect(equity.children.single.marketValue, equity.row.marketValue);
  });

  test('every present group has at least one child', () {
    final nodes = pa.sunburst([
      for (final t in AssetType.values)
        position(id: t.key, kind: t, value: '1000'),
    ]);
    expect(nodes, hasLength(AssetGroup.values.length));
    for (final n in nodes) {
      expect(n.children, isNotEmpty, reason: '${n.row.label} has no children');
    }
  });

  test('an empty portfolio yields no nodes rather than empty rings', () {
    expect(pa.sunburst(const []), isEmpty);
  });

  test('debt and retirement split by asset type, not by sector', () {
    // Only equities carry a sector in the bundled table, so splitting a bond
    // sleeve "by sector" would render one Unclassified wedge and call it
    // information.
    final nodes = pa.sunburst([
      position(id: 'FD1', kind: AssetType.fd, value: '1000'),
      position(id: 'PPF1', kind: AssetType.ppfEpf, value: '2000'),
    ]);
    final retirement = nodes.single;
    expect(retirement.row.key, AssetGroup.retirement.name);
    expect(retirement.children.map((c) => c.key).toSet(),
        {AssetType.fd.key, AssetType.ppfEpf.key});
  });

  test('unpriced positions are carried at cost, not dropped', () {
    final nodes = pa.sunburst([
      position(id: 'B', kind: AssetType.bond, cost: '7500', priced: false),
    ]);
    expect(nodes.single.row.marketValue, d('7500'));
    expect(nodes.single.row.unpricedCount, 1);
  });
}
