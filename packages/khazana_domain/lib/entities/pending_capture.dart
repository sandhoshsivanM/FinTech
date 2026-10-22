import 'package:decimal/decimal.dart';

import 'capture_types.dart';
import 'transaction.dart';

export 'capture_types.dart';

/// Where an auto-captured transaction draft came from.
enum CaptureSource {
  sms('sms'),
  notification('notification');

  const CaptureSource(this.key);
  final String key;

  static CaptureSource fromKey(String k) => CaptureSource.values
      .firstWhere((e) => e.key == k, orElse: () => CaptureSource.notification);
}

/// One transaction the offline parser extracted from an SMS / notification, and
/// what became of it: posted automatically, waiting in the review inbox, or
/// decided by the user.
///
/// Privacy boundary (zero-telemetry baseline): this holds **only the extracted
/// values** — the raw message text is discarded the moment parsing completes and
/// is *never* persisted here.
class PendingCapture {
  const PendingCapture({
    required this.id,
    required this.vaultId,
    required this.amount,
    required this.type,
    this.merchant,
    required this.occurredAt,
    required this.source,
    this.uncategorized = true,
    required this.fingerprint,
    required this.capturedAt,
    this.status = CaptureStatus.pending,
    this.confidence,
    this.reasons = const [],
    this.accountId,
    this.categoryId,
    this.utr,
    this.accountLast4,
    this.availableBalance,
    this.instrument = CaptureInstrument.unknown,
    this.kind = CaptureKind.spend,
    this.profileId,
    this.finalAmount,
    this.decidedAt,
    this.postedTxnId,
  });

  final String id;
  final String vaultId;

  /// As parsed. Always positive; sign comes from [type]. A user correction is
  /// kept separately in [finalAmount] so parser mistakes stay measurable.
  final Decimal amount;
  final TxnType type;
  final String? merchant;
  final DateTime occurredAt;
  final CaptureSource source;

  /// True until the user assigns a category on review.
  final bool uncategorized;

  /// Dedupe key (see `ParsedNotification.fingerprintInput`) — keeps duplicate
  /// alerts from re-queuing the same spend.
  final String fingerprint;
  final DateTime capturedAt;

  final CaptureStatus status;

  /// Router confidence 0–100; null for captures made before routing existed.
  final int? confidence;

  /// Why the router sent this to review. Empty for auto-posted captures.
  final List<ReviewReason> reasons;

  /// The money account this lands on (matched from bank + last digits).
  final String? accountId;

  /// Suggested category (learned from earlier approvals of this merchant).
  final String? categoryId;

  final String? utr;
  final String? accountLast4;
  final Decimal? availableBalance;
  final CaptureInstrument instrument;
  final CaptureKind kind;
  final String? profileId;
  final Decimal? finalAmount;
  final DateTime? decidedAt;

  /// The transaction written for this capture, while it has one.
  final String? postedTxnId;

  /// What the ledger records: the user's correction when there is one.
  Decimal get effectiveAmount => finalAmount ?? amount;

  PendingCapture copyWith({
    CaptureStatus? status,
    int? confidence,
    List<ReviewReason>? reasons,
    String? accountId,
    String? categoryId,
    String? merchant,
    TxnType? type,
    Decimal? finalAmount,
    DateTime? decidedAt,
    String? postedTxnId,
    bool clearPostedTxnId = false,
    bool clearDecidedAt = false,
    bool clearFinalAmount = false,
  }) {
    return PendingCapture(
      id: id,
      vaultId: vaultId,
      amount: amount,
      type: type ?? this.type,
      merchant: merchant ?? this.merchant,
      occurredAt: occurredAt,
      source: source,
      uncategorized: uncategorized,
      fingerprint: fingerprint,
      capturedAt: capturedAt,
      status: status ?? this.status,
      confidence: confidence ?? this.confidence,
      reasons: reasons ?? this.reasons,
      accountId: accountId ?? this.accountId,
      categoryId: categoryId ?? this.categoryId,
      utr: utr,
      accountLast4: accountLast4,
      availableBalance: availableBalance,
      instrument: instrument,
      kind: kind,
      profileId: profileId,
      finalAmount: clearFinalAmount ? null : (finalAmount ?? this.finalAmount),
      decidedAt: clearDecidedAt ? null : (decidedAt ?? this.decidedAt),
      postedTxnId: clearPostedTxnId ? null : (postedTxnId ?? this.postedTxnId),
    );
  }
}
