import 'package:decimal/decimal.dart';

import 'transaction.dart';

/// Where an auto-captured transaction draft came from.
enum CaptureSource {
  sms('sms'),
  notification('notification');

  const CaptureSource(this.key);
  final String key;

  static CaptureSource fromKey(String k) => CaptureSource.values
      .firstWhere((e) => e.key == k, orElse: () => CaptureSource.notification);
}

/// A transaction draft extracted from an SMS / notification by the offline
/// parser, awaiting user review (PRD §13 review-before-save).
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
  });

  final String id;
  final String vaultId;
  final Decimal amount; // always positive; sign comes from [type]
  final TxnType type;
  final String? merchant;
  final DateTime occurredAt;
  final CaptureSource source;

  /// True until the user assigns a category on review.
  final bool uncategorized;

  /// SHA-256 dedup key (same scheme as bank import) — keeps duplicate alerts
  /// from re-queuing the same spend.
  final String fingerprint;
  final DateTime capturedAt;
}
