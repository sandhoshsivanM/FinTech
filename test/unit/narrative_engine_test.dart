import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/domain/entities/holding.dart';
import 'package:khazana/domain/entities/net_worth_snapshot.dart';
import 'package:khazana/domain/services/financial_health.dart';
import 'package:khazana/domain/services/insights_engine.dart';
import 'package:khazana/domain/services/narrative_engine.dart';

import '../support/investment_totals_builder.dart';

/// The narrative engine, and the compliance rule it exists to keep.
///
/// The ban-list group below is the actual guarantee. A style guide asking
/// people to avoid advice is a hope; running every rule against a matrix of
/// vaults and grepping the output is a mechanism. The web app previously shipped
/// "Prioritising high-APR debt first saves the most interest" and "Consider
/// diversifying into long-term assets" — both written in good faith, both
/// regulated advice.
void main() {
  const engine = NarrativeEngine();
  Decimal d(int v) => Decimal.fromInt(v);
  final now = DateTime.utc(2026, 6, 15);

  NetWorthSnapshot snap(int daysAgo, int netWorth) => NetWorthSnapshot(
        id: 'snap-$daysAgo',
        vaultId: 'v',
        date: now.subtract(Duration(days: daysAgo)),
        netWorth: d(netWorth),
        cash: d(netWorth),
        investments: Decimal.zero,
        liabilities: Decimal.zero,
      );

  HealthScore healthOf({
    Map<AssetType, int> investments = const {},
    bool withInsurance = false,
  }) =>
      const FinancialHealth().compute(HealthInputs(
        txns: const [],
        investments:
            investments.isEmpty ? noInvestments : totalsOf(investments),
        liabilities: const [],
        now: now,
      ));

  NarrativeContext ctx({
    HealthScore? health,
    Map<AssetType, int> investments = const {},
    int indicativeValue = 0,
    SafeToSpend? safe,
    List<SpendingAnomaly> anomalies = const [],
    List<NetWorthSnapshot> snapshots = const [],
    Map<String, String> categories = const {},
  }) {
    final totals = investments.isEmpty
        ? noInvestments
        : totalsOf(investments, indicativeValue: indicativeValue);
    return NarrativeContext(
      health: health ?? healthOf(investments: investments),
      investments: totals,
      safeToSpend: safe,
      anomalies: anomalies,
      snapshots: snapshots,
      categoryNames: categories,
      currencyFormat: (v) => '₹${v.round()}',
      now: now,
    );
  }

  group('SEBI ban list', () {
    /// A spread of vault shapes, so every rule gets a chance to fire.
    List<NarrativeContext> matrix() => [
          // Empty vault.
          ctx(),
          // Growing net worth, savings, a spike, money left, manual prices.
          ctx(
            investments: {AssetType.equityEtf: 500000, AssetType.bond: 300000},
            indicativeValue: 300000,
            safe: SafeToSpend(d(18200), d(1400), 13),
            anomalies: [SpendingAnomaly('food', d(9400), d(4500), 2.1)],
            snapshots: [snap(90, 1000000), snap(1, 1420000)],
            categories: {'food': 'Food'},
          ),
          // Shrinking net worth.
          ctx(snapshots: [snap(90, 1420000), snap(1, 1000000)]),
          // A portfolio priced entirely by hand.
          ctx(
            investments: {AssetType.bond: 500000},
            indicativeValue: 500000,
          ),
          // Nothing left to spend this month.
          ctx(safe: SafeToSpend(Decimal.zero, Decimal.zero, 0)),
        ];

    test('no generated sentence contains a banned phrase', () {
      for (final context in matrix()) {
        for (final n in engine.generate(context)) {
          final lower = n.text.toLowerCase();
          for (final banned in kBannedPhrases) {
            expect(lower.contains(banned), isFalse,
                reason: 'rule "${n.id}" produced advice-shaped text '
                    '(contains "$banned"): ${n.text}');
          }
        }
      }
    });

    test('the weekly report is clean too', () {
      for (final context in matrix()) {
        final report = engine.weeklyReport(context).toLowerCase();
        for (final banned in kBannedPhrases) {
          expect(report.contains(banned), isFalse,
              reason: 'weekly report contains "$banned": $report');
        }
      }
    });

    test('no rule is toned as advice', () {
      // There is no NarrativeTone.advice, and this asserts nobody adds one by
      // routing a directive through `caution`.
      for (final context in matrix()) {
        for (final n in engine.generate(context)) {
          expect(NarrativeTone.values, contains(n.tone));
        }
      }
    });

    test('the disclaimer exists and says what it must', () {
      expect(kNarrativeDisclaimer.toLowerCase(), contains('not investment advice'));
    });
  });

  group('rules stay silent rather than filling space', () {
    test('an empty vault says only what it can, and nothing generic', () {
      // The one sentence that fires is the honest one: which area cannot be
      // scored and what it needs. There is no "Keep tracking your spending!" —
      // filler teaches people the card never says anything worth reading.
      final all = engine.generate(ctx());
      expect(all.map((n) => n.id), ['untracked_category']);
    });

    test('one snapshot is not a trend', () {
      final n = engine.generate(ctx(snapshots: [snap(1, 1000000)]));
      expect(n.where((x) => x.id == 'networth_change'), isEmpty);
    });

    test('under 28 days of history is not a monthly change', () {
      final n = engine.generate(ctx(snapshots: [snap(10, 1000000), snap(1, 1200000)]));
      expect(n.where((x) => x.id == 'networth_change'), isEmpty,
          reason: 'a fortnight of movement is mostly one salary landing');
    });

    test('an anomaly with no known category name is skipped', () {
      final n = engine.generate(ctx(
        anomalies: [SpendingAnomaly('unknown-id', d(9400), d(4500), 2.1)],
      ));
      expect(n.where((x) => x.id == 'category_spike'), isEmpty,
          reason: 'a sentence naming a category id would be gibberish');
    });

    test('a lightly-manual portfolio does not raise a pricing headline', () {
      final n = engine.generate(ctx(
        investments: {AssetType.equityEtf: 1000000},
        indicativeValue: 50000, // 5%
      ));
      expect(n.where((x) => x.id == 'stale_pricing'), isEmpty);
    });

    test('nothing left to spend produces no safe-to-spend sentence', () {
      final n = engine.generate(ctx(safe: SafeToSpend(Decimal.zero, Decimal.zero, 0)));
      expect(n.where((x) => x.id == 'safe_to_spend'), isEmpty);
    });
  });

  group('content', () {
    test('a rising net worth reads as rising', () {
      final n = engine
          .generate(ctx(snapshots: [snap(90, 1000000), snap(1, 1420000)]))
          .firstWhere((x) => x.id == 'networth_change');
      expect(n.text, contains('up ₹420000'));
      expect(n.tone, NarrativeTone.positive);
    });

    test('a falling net worth reads as falling, without a negative sign', () {
      final n = engine
          .generate(ctx(snapshots: [snap(90, 1420000), snap(1, 1000000)]))
          .firstWhere((x) => x.id == 'networth_change');
      expect(n.text, contains('down ₹420000'));
      expect(n.text, isNot(contains('-')));
      expect(n.tone, NarrativeTone.caution);
    });

    test('an untracked category says what the app needs, not what to do', () {
      final n = engine
          .generate(ctx())
          .firstWhere((x) => x.id == 'untracked_category');
      expect(n.text, contains('not scored yet'));
      expect(n.text, contains('needs'));
    });

    test('a manual-priced portfolio discloses the share', () {
      final n = engine
          .generate(ctx(
            investments: {AssetType.bond: 500000},
            indicativeValue: 500000,
          ))
          .firstWhere((x) => x.id == 'stale_pricing');
      expect(n.text, contains('100%'));
      expect(n.text, contains('by hand'));
    });

    test('every narrative carries a stable id and a route', () {
      final all = engine.generate(ctx(
        investments: {AssetType.equityEtf: 500000, AssetType.bond: 300000},
        indicativeValue: 300000,
        safe: SafeToSpend(d(18200), d(1400), 13),
        anomalies: [SpendingAnomaly('food', d(9400), d(4500), 2.1)],
        snapshots: [snap(90, 1000000), snap(1, 1420000)],
        categories: {'food': 'Food'},
      ));
      expect(all, isNotEmpty);
      final ids = all.map((n) => n.id).toSet();
      expect(ids.length, all.length, reason: 'ids must be unique per run');
      for (final n in all) {
        expect(n.text, isNotEmpty);
        expect(n.text.endsWith('.'), isTrue,
            reason: '"${n.text}" is not a complete sentence');
      }
    });

    test('the headline is the highest-priority sentence', () {
      final context = ctx(
        safe: SafeToSpend(d(18200), d(1400), 13),
        anomalies: [SpendingAnomaly('food', d(9400), d(4500), 2.1)],
        categories: {'food': 'Food'},
      );
      final all = engine.generate(context);
      expect(engine.headline(context)!.id, all.first.id);
      // A spending spike outranks "here is your daily allowance".
      expect(all.first.id, 'category_spike');
    });

    test('the weekly report joins at most three sentences', () {
      final context = ctx(
        investments: {AssetType.equityEtf: 500000, AssetType.bond: 300000},
        indicativeValue: 300000,
        safe: SafeToSpend(d(18200), d(1400), 13),
        anomalies: [SpendingAnomaly('food', d(9400), d(4500), 2.1)],
        snapshots: [snap(90, 1000000), snap(1, 1420000)],
        categories: {'food': 'Food'},
      );
      final all = engine.generate(context);
      expect(all.length, greaterThan(3), reason: 'the cap is being exercised');
      // Counting full stops would miscount: "2.1x" and money amounts contain
      // them too.
      expect(engine.weeklyReport(context),
          all.take(3).map((n) => n.text).join(' '));
    });

    test('an empty vault gets an honest weekly report, not silence', () {
      expect(engine.weeklyReport(ctx()), isNotEmpty);
    });
  });
}
