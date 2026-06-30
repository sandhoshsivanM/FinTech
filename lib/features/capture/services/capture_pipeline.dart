import 'package:uuid/uuid.dart';

import '../../../domain/entities/pending_capture.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/repositories/pending_capture_repository.dart';
import '../../../domain/services/notification_parser.dart';
import 'capture_channel.dart';

/// Turns a raw captured message into a reviewable [PendingCapture]: parse in
/// memory, discard the raw text, dedup by fingerprint, enqueue. Nothing is ever
/// auto-committed to the ledger — the user reviews each draft (PRD §13).
class CapturePipeline {
  CapturePipeline({
    required IPendingCaptureRepository repo,
    required String vaultId,
    this.parser = const NotificationParser(),
    Uuid uuid = const Uuid(),
  })  : _repo = repo,
        _vaultId = vaultId,
        _uuid = uuid;

  final IPendingCaptureRepository _repo;
  final String _vaultId;
  final NotificationParser parser;
  final Uuid _uuid;

  /// Parses [msg] and enqueues a draft. Returns the saved draft, or null when
  /// the message isn't a transaction or is a duplicate. The raw text is dropped
  /// as soon as [NotificationParser.parse] returns.
  Future<PendingCapture?> ingest(CapturedMessage msg) async {
    final parsed = parser.parse(msg.text, now: msg.postedAt, sender: msg.sender);
    if (parsed == null) return null;

    final fingerprint = parsed.fingerprintInput;
    if (await _repo.exists(_vaultId, fingerprint)) return null;

    final occurredAt = DateTime.tryParse(parsed.timestamp) ?? msg.postedAt;
    final capture = PendingCapture(
      id: _uuid.v4(),
      vaultId: _vaultId,
      amount: parsed.amount,
      type: parsed.type,
      merchant: parsed.merchant.isEmpty ? null : parsed.merchant,
      occurredAt: occurredAt,
      source: msg.source,
      uncategorized: parsed.uncategorized,
      fingerprint: fingerprint,
      capturedAt: DateTime.now(),
    );
    await _repo.save(capture);
    return capture;
  }
}

/// Resolves a [PendingCapture]'s suggested category from learned merchant
/// aliases (best-effort; null when nothing matches). Pure helper.
String? suggestCategoryId(
  PendingCapture capture,
  Map<String, String> merchantToCategoryId,
) {
  final m = capture.merchant?.toLowerCase();
  if (m == null) return null;
  for (final entry in merchantToCategoryId.entries) {
    if (m.contains(entry.key.toLowerCase())) return entry.value;
  }
  return null;
}

/// Whether a draft is income (for UI sign/colour).
bool isIncomeCapture(PendingCapture c) => c.type == TxnType.income;
