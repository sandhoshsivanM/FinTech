import 'package:decimal/decimal.dart';

import '../entities/capture_types.dart';
import '../entities/transaction.dart';

/// Everything the router needs to know about one capture, gathered by the
/// caller. Pure data, so every routing rule can be unit-tested without a
/// database.
class RoutingFacts {
  const RoutingFacts({
    required this.amount,
    required this.type,
    required this.kind,
    required this.occurredAt,
    this.profileId,
    this.merchant,
    this.utr,
    this.availableBalance,
    this.accountId,
    this.categoryId,
    this.previousBalance,
    this.recentAmounts = const [],
    this.nearbyTransactions = const [],
    this.oppositeLegExists = false,
    this.alwaysReview = false,
  });

  final Decimal amount;
  final TxnType type;
  final CaptureKind kind;
  final DateTime occurredAt;
  final String? profileId;
  final String? merchant;
  final String? utr;

  /// "Avl Bal" printed in this alert, if any.
  final Decimal? availableBalance;

  /// Matched money account, if the user has linked this suffix.
  final String? accountId;

  /// Category learned from earlier approvals of this merchant.
  final String? categoryId;

  /// "Avl Bal" from the previous alert for the same account, if any.
  final Decimal? previousBalance;

  /// Same-direction amounts on this account over the last 90 days.
  final List<Decimal> recentAmounts;

  /// Ledger entries within ±2 days, for spotting one the user typed by hand.
  final List<Txn> nearbyTransactions;

  /// Another capture carries this reference in the opposite direction — the
  /// other leg of a transfer between the user's own accounts.
  final bool oppositeLegExists;

  final bool alwaysReview;
}

class RouteDecision {
  const RouteDecision({
    required this.autoPost,
    required this.confidence,
    required this.reasons,
  });

  final bool autoPost;

  /// 0–100.
  final int confidence;

  /// Empty when [autoPost] is true.
  final List<ReviewReason> reasons;
}

/// Decides whether a capture goes straight to the ledger or to the review inbox.
///
/// Two layers. A **score** says how trustworthy the parse is; a set of
/// **forced-review rules** catches cases where a perfect parse is still the
/// wrong thing to post automatically (a refund, a transfer, an amount far
/// outside the account's normal range). Any forced rule wins over any score,
/// which keeps the dangerous cases out of the ledger however the weights are
/// later tuned.
class CaptureRouter {
  const CaptureRouter();

  /// Minimum score to post without asking. A recognised bank, a linked account,
  /// a learned category and a merchant reach it; anything less needs one of the
  /// strong anchors (a reference number or a consistent balance).
  static const autoPostThreshold = 80;

  /// An amount this many times the account's 95th percentile is "unusual".
  static const unusualFactor = 3;

  /// Below this many past entries there is no "usual" to compare against.
  static const minHistoryForUnusual = 5;

  RouteDecision decide(RoutingFacts f) {
    var score = 0;
    final soft = <ReviewReason>[];
    final forced = <ReviewReason>[];

    if (f.profileId != null) {
      score += 30;
    } else {
      soft.add(ReviewReason.genericParser);
    }
    if (f.accountId != null) {
      score += 25;
    } else {
      forced.add(ReviewReason.unknownAccount);
    }
    if (f.categoryId != null) {
      score += 15;
    } else {
      forced.add(ReviewReason.noCategory);
    }
    if (f.merchant != null && f.merchant!.isNotEmpty) {
      score += 10;
    } else {
      soft.add(ReviewReason.noMerchant);
    }
    if (f.utr != null) score += 10;

    final balance = balanceCheck(f);
    if (balance == true) score += 10;
    if (balance == false) forced.add(ReviewReason.balanceMismatch);

    if (f.kind == CaptureKind.refund) forced.add(ReviewReason.refund);
    if (f.kind == CaptureKind.cardBillPayment) forced.add(ReviewReason.cardBillPayment);
    if (f.oppositeLegExists) forced.add(ReviewReason.possibleTransfer);
    if (isUnusual(f.amount, f.recentAmounts)) forced.add(ReviewReason.unusualAmount);
    if (looksTypedByHand(f)) forced.add(ReviewReason.possibleDuplicate);
    if (f.alwaysReview) forced.insert(0, ReviewReason.alwaysReview);

    final confidence = score.clamp(0, 100);
    if (forced.isEmpty && confidence >= autoPostThreshold) {
      return RouteDecision(autoPost: true, confidence: confidence, reasons: const []);
    }
    final reasons = [...forced, ...soft];
    if (forced.isEmpty) reasons.insert(0, ReviewReason.lowConfidence);
    return RouteDecision(autoPost: false, confidence: confidence, reasons: reasons);
  }

  /// Whether this alert's balance follows from the previous alert's, for the
  /// same account: previous − amount for a debit, previous + amount for a
  /// credit. Null when either balance is unknown.
  ///
  /// Deliberately compares bank figures with bank figures, never with Khazana's
  /// computed balance: most people never enter an exact opening balance, and a
  /// check against it would flag every single capture. A broken chain means a
  /// misread amount — or an alert that never arrived, which is worth knowing.
  static bool? balanceCheck(RoutingFacts f) {
    final prev = f.previousBalance;
    final now = f.availableBalance;
    if (prev == null || now == null) return null;
    final expected = f.type == TxnType.expense ? prev - f.amount : prev + f.amount;
    return expected == now;
  }

  /// True when [amount] is more than [unusualFactor] × the 95th percentile of
  /// [history]. Sorting is O(n log n); n is one account's last 90 days, which
  /// is small enough that a selection algorithm would buy nothing measurable.
  static bool isUnusual(Decimal amount, List<Decimal> history) {
    if (history.length < minHistoryForUnusual) return false;
    final sorted = [...history]..sort();
    final index = ((sorted.length - 1) * 95 / 100).ceil();
    final p95 = sorted[index];
    return amount > p95 * Decimal.fromInt(unusualFactor);
  }

  /// An entry of the same amount and direction already in the ledger within
  /// ±2 days, not created by auto-capture — the user probably typed it by hand
  /// before the alert arrived.
  static bool looksTypedByHand(RoutingFacts f) {
    const window = Duration(days: 2);
    for (final t in f.nearbyTransactions) {
      if (t.isAutoCaptured) continue;
      if (t.type != f.type || t.amount != f.amount) continue;
      if (t.date.difference(f.occurredAt).abs() <= window) return true;
    }
    return false;
  }
}
