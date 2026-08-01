import 'package:decimal/decimal.dart';

import '../entities/investment_totals.dart';
import '../entities/net_worth_snapshot.dart';
import 'financial_health.dart';
import 'insights_engine.dart';

/// What a narrative is about. Drives which screen a tap should open.
enum NarrativeKind { networth, savings, spending, investing, protection, goal, pricing }

/// How a sentence should read. Deliberately has no "advice" value: this app
/// describes, it does not recommend.
enum NarrativeTone { positive, neutral, caution }

/// One generated sentence.
class Narrative {
  const Narrative({
    required this.id,
    required this.kind,
    required this.tone,
    required this.priority,
    required this.text,
    this.routeKey,
  });

  /// Stable across rebuilds, so a dismissal can stick to a sentence rather
  /// than to a position in a list.
  final String id;

  final NarrativeKind kind;
  final NarrativeTone tone;

  /// Higher wins. The Dashboard shows exactly one.
  final int priority;

  final String text;

  /// Which screen explains this further, e.g. `score.efficiency`.
  final String? routeKey;
}

/// Everything the rules read. Every field is already computed elsewhere —
/// re-deriving the health score here would make the Dashboard pay for it twice.
class NarrativeContext {
  const NarrativeContext({
    required this.health,
    required this.investments,
    this.safeToSpend,
    this.anomalies = const [],
    this.snapshots = const [],
    this.categoryNames = const {},
    this.currencyFormat = _defaultFormat,
    this.now,
  });

  final HealthScore health;
  final InvestmentTotals investments;
  final SafeToSpend? safeToSpend;
  final List<SpendingAnomaly> anomalies;
  final List<NetWorthSnapshot> snapshots;
  final Map<String, String> categoryNames;

  /// How money renders inside a sentence. Injected so the domain layer stays
  /// free of locale and formatting concerns.
  final String Function(Decimal) currencyFormat;

  final DateTime? now;

  static String _defaultFormat(Decimal d) => d.round().toString();
}

/// A rule that may or may not have something to say.
abstract class NarrativeRule {
  const NarrativeRule();

  String get id;

  /// Null when the rule does not fire. A rule must **never** return filler:
  /// the value of one honest sentence is destroyed by three generic ones
  /// beside it.
  Narrative? evaluate(NarrativeContext ctx);
}

/// The disclaimer rendered under any narrative block.
const kNarrativeDisclaimer = 'Informational only — not investment advice.';

/// Phrases that must never appear in generated text.
///
/// This is the actual compliance mechanism. A style guide is a hope; a test
/// that runs every rule against a matrix of vaults and greps its output is a
/// guarantee. See `test/unit/narrative_engine_test.dart`, and the mirrored list
/// in `webapp/src/domain/narrative.ts`.
///
/// The line is between description and direction. "HDFC Flexi Cap is 31% of
/// your equity" describes a fact about the user's own portfolio. "Consider
/// diversifying" tells them what to do with it, which is regulated advice this
/// app is not licensed to give.
const kBannedPhrases = <String>[
  'buy ',
  'sell ',
  'invest in',
  'recommend',
  'you should',
  'guaranteed',
  'will return',
  'best fund',
  'top pick',
  'consider ',
  'aim for',
  'prioritis',
  'prioritiz',
];

/// Generates the app's narrative sentences.
///
/// Sentences are assembled only from the templates in the rules below. There is
/// deliberately no general-purpose "describe this number" path: free-form
/// concatenation of an instrument name into an arbitrary sentence shape is
/// exactly how a description becomes a recommendation.
class NarrativeEngine {
  const NarrativeEngine([this.rules = kDefaultNarrativeRules]);

  final List<NarrativeRule> rules;

  /// Every sentence that fires, highest priority first.
  List<Narrative> generate(NarrativeContext ctx) {
    final out = <Narrative>[];
    for (final rule in rules) {
      final n = rule.evaluate(ctx);
      if (n != null) out.add(n);
    }
    out.sort((a, b) => b.priority.compareTo(a.priority));
    return out;
  }

  /// The single sentence for the Dashboard. Null when nothing fires — better
  /// an absent card than a generic one.
  Narrative? headline(NarrativeContext ctx) {
    final all = generate(ctx);
    return all.isEmpty ? null : all.first;
  }

  /// The Score screen's paragraph: up to three sentences, joined.
  String weeklyReport(NarrativeContext ctx) {
    final all = generate(ctx).take(3).map((n) => n.text);
    return all.isEmpty
        ? 'There is not enough history yet to summarise your week.'
        : all.join(' ');
  }
}

const kDefaultNarrativeRules = <NarrativeRule>[
  _NetWorthChangeRule(),
  _SavingsRateRule(),
  _CategorySpikeRule(),
  _SafeToSpendRule(),
  _UntrackedCategoryRule(),
  _StalePricingRule(),
];

/// "Your net worth is up ₹42,000 over the past month."
class _NetWorthChangeRule extends NarrativeRule {
  const _NetWorthChangeRule();

  @override
  String get id => 'networth_change';

  @override
  Narrative? evaluate(NarrativeContext ctx) {
    if (ctx.snapshots.length < 2) return null;
    final sorted = [...ctx.snapshots]..sort((a, b) => a.date.compareTo(b.date));
    final first = sorted.first;
    final last = sorted.last;
    final span = last.date.difference(first.date);
    // Under a month, the "change" is mostly noise from one salary landing.
    if (span.inDays < 28) return null;

    final delta = last.netWorth - first.netWorth;
    if (delta == Decimal.zero) return null;
    final up = delta > Decimal.zero;
    final months = (span.inDays / 30).round().clamp(1, 99);
    final window = months == 1 ? 'the past month' : 'the past $months months';

    return Narrative(
      id: id,
      kind: NarrativeKind.networth,
      tone: up ? NarrativeTone.positive : NarrativeTone.caution,
      priority: 90,
      text: up
          ? 'Your net worth is up ${ctx.currencyFormat(delta)} over $window.'
          : 'Your net worth is down ${ctx.currencyFormat(-delta)} over $window.',
      routeKey: 'score.wealth',
    );
  }
}

/// "You saved 34% of your income over the last 90 days."
class _SavingsRateRule extends NarrativeRule {
  const _SavingsRateRule();

  @override
  String get id => 'savings_rate';

  @override
  Narrative? evaluate(NarrativeContext ctx) {
    final efficiency =
        ctx.health.categories.where((c) => c.key == 'efficiency').firstOrNull;
    final metric = efficiency?.metrics
        .where((m) => m.key == 'efficiency.savings_rate')
        .firstOrNull;
    final value = metric?.value;
    if (value == null) return null;

    // The metric is achievement against a 30% target; recover the rate itself.
    final rate = value * 0.3;
    return Narrative(
      id: id,
      kind: NarrativeKind.savings,
      tone: rate >= 0.2 ? NarrativeTone.positive : NarrativeTone.neutral,
      priority: rate >= 0.2 ? 70 : 75,
      text: 'You saved ${(rate * 100).round()}% of your income over the last '
          '90 days.',
      routeKey: 'score.efficiency',
    );
  }
}

/// "Food is running 2.1× its usual — ₹9,400 against ₹4,500 on average."
class _CategorySpikeRule extends NarrativeRule {
  const _CategorySpikeRule();

  @override
  String get id => 'category_spike';

  @override
  Narrative? evaluate(NarrativeContext ctx) {
    if (ctx.anomalies.isEmpty) return null;
    final worst = ctx.anomalies
        .reduce((a, b) => b.ratio > a.ratio ? b : a);
    final name = ctx.categoryNames[worst.categoryId];
    if (name == null) return null;

    return Narrative(
      id: id,
      kind: NarrativeKind.spending,
      tone: NarrativeTone.caution,
      priority: 85,
      text: '$name is running ${worst.ratio.toStringAsFixed(1)}× its usual — '
          '${ctx.currencyFormat(worst.current)} against '
          '${ctx.currencyFormat(worst.avg)} on average.',
      routeKey: 'score.efficiency',
    );
  }
}

/// "₹18,200 left this month — about ₹1,400 a day for the next 13 days."
class _SafeToSpendRule extends NarrativeRule {
  const _SafeToSpendRule();

  @override
  String get id => 'safe_to_spend';

  @override
  Narrative? evaluate(NarrativeContext ctx) {
    final s = ctx.safeToSpend;
    if (s == null || s.remaining <= Decimal.zero || s.daysLeft <= 0) {
      return null;
    }
    return Narrative(
      id: id,
      kind: NarrativeKind.savings,
      tone: NarrativeTone.neutral,
      priority: 60,
      text: '${ctx.currencyFormat(s.remaining)} left this month — about '
          '${ctx.currencyFormat(s.perDay)} a day for the next ${s.daysLeft} '
          'day${s.daysLeft == 1 ? '' : 's'}.',
      routeKey: 'score.efficiency',
    );
  }
}

/// "Protection is not scored yet — it needs an insurance policy or an
/// emergency-fund goal."
///
/// The honesty rule surfaced as a sentence, and the natural nudge toward
/// completing the score. Phrased as what the *app* is missing rather than what
/// the user should do about it.
class _UntrackedCategoryRule extends NarrativeRule {
  const _UntrackedCategoryRule();

  static const _needs = <String, String>{
    'wealth': 'a holding or some transaction history',
    'protection': 'an insurance policy or an emergency-fund goal',
    'efficiency': 'some income and spending history',
    'future': 'a goal or a holding',
  };

  @override
  String get id => 'untracked_category';

  @override
  Narrative? evaluate(NarrativeContext ctx) {
    final untracked =
        ctx.health.categories.where((c) => !c.isTracked).toList();
    if (untracked.isEmpty) return null;
    final c = untracked.first;
    final needs = _needs[c.key];
    if (needs == null) return null;

    return Narrative(
      id: id,
      kind: NarrativeKind.protection,
      tone: NarrativeTone.neutral,
      priority: 80,
      text: '${c.label} is not scored yet — it needs $needs.',
      routeKey: 'score.${c.key}',
    );
  }
}

/// "About 40% of your portfolio value comes from prices you entered by hand."
class _StalePricingRule extends NarrativeRule {
  const _StalePricingRule();

  @override
  String get id => 'stale_pricing';

  @override
  Narrative? evaluate(NarrativeContext ctx) {
    final t = ctx.investments;
    if (t.isEmpty || t.marketValue <= Decimal.zero) return null;
    final share = (t.indicativeValue / t.marketValue).toDouble();
    // Below a fifth it is a footnote, not a headline.
    if (share < 0.2) return null;

    return Narrative(
      id: id,
      kind: NarrativeKind.pricing,
      tone: NarrativeTone.neutral,
      priority: 50,
      text: 'About ${(share * 100).round()}% of your portfolio value comes '
          'from prices entered by hand rather than live quotes.',
      routeKey: 'investments',
    );
  }
}

extension _FirstOrNull<E> on Iterable<E> {
  E? get firstOrNull {
    final it = iterator;
    return it.moveNext() ? it.current : null;
  }
}
