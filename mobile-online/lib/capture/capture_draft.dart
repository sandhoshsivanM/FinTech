// A capture draft: the values extracted from one bank alert, receipt or
// screenshot, waiting for the user's review. It holds ONLY parsed values. The
// text it came from (SMS, email body, OCR output) is dropped the moment parsing
// ends and is never stored, logged or uploaded.
import 'package:decimal/decimal.dart';
import 'package:khazana_domain/entities/transaction.dart' show TxnType;
import 'package:khazana_domain/services/notification_parser.dart';

/// Which channel produced a draft.
enum DraftSource {
  gmail('gmail'),
  ocr('ocr'),
  shortcut('shortcut');

  const DraftSource(this.key);
  final String key;
  static DraftSource fromKey(String? k) =>
      DraftSource.values.firstWhere((e) => e.key == k, orElse: () => DraftSource.shortcut);
}

enum DraftStatus {
  pending('pending'),
  approved('approved'),
  rejected('rejected');

  const DraftStatus(this.key);
  final String key;
  static DraftStatus fromKey(String? k) =>
      DraftStatus.values.firstWhere((e) => e.key == k, orElse: () => DraftStatus.pending);
}

class CaptureDraft {
  CaptureDraft({
    required this.fingerprint,
    required this.amount,
    required this.type,
    required this.merchant,
    required this.date,
    required this.source,
    required this.capturedAt,
    this.kind = CaptureKind.spend,
    this.instrument = CaptureInstrument.unknown,
    this.accountLast4,
    this.utr,
    this.availableBalance,
    this.profileId,
    this.status = DraftStatus.pending,
    this.decidedAt,
  });

  /// Dedupe key from the parser (UTR, or date|amount|merchant|account|balance).
  /// Built from parsed values only, so it is safe to keep. Doubles as the id.
  final String fingerprint;
  final Decimal amount;
  final TxnType type;
  final String merchant;

  /// 'YYYY-MM-DD'
  final String date;
  final DraftSource source;
  final DateTime capturedAt;
  final CaptureKind kind;
  final CaptureInstrument instrument;
  final String? accountLast4;
  final String? utr;
  final Decimal? availableBalance;
  final String? profileId;
  final DraftStatus status;
  final DateTime? decidedAt;

  String get id => fingerprint;

  factory CaptureDraft.fromParsed(ParsedNotification p, DraftSource source, DateTime now) => CaptureDraft(
        fingerprint: p.fingerprintInput,
        amount: p.amount,
        type: p.type,
        merchant: p.merchant,
        date: p.timestamp,
        source: source,
        capturedAt: now,
        kind: p.kind,
        instrument: p.instrument,
        accountLast4: p.accountLast4,
        utr: p.utr,
        availableBalance: p.availableBalance,
        profileId: p.profileId,
      );

  CaptureDraft copyWith({
    Decimal? amount,
    TxnType? type,
    String? merchant,
    String? date,
    DraftStatus? status,
    DateTime? decidedAt,
  }) =>
      CaptureDraft(
        fingerprint: fingerprint,
        amount: amount ?? this.amount,
        type: type ?? this.type,
        merchant: merchant ?? this.merchant,
        date: date ?? this.date,
        source: source,
        capturedAt: capturedAt,
        kind: kind,
        instrument: instrument,
        accountLast4: accountLast4,
        utr: utr,
        availableBalance: availableBalance,
        profileId: profileId,
        status: status ?? this.status,
        decidedAt: decidedAt ?? this.decidedAt,
      );

  Map<String, Object?> toJson() => {
        'fingerprint': fingerprint,
        'amount': amount.toString(),
        'type': type.name,
        'merchant': merchant,
        'date': date,
        'source': source.key,
        'capturedAt': capturedAt.toUtc().toIso8601String(),
        'kind': kind.key,
        'instrument': instrument.key,
        'accountLast4': accountLast4,
        'utr': utr,
        'availableBalance': availableBalance?.toString(),
        'profileId': profileId,
        'status': status.key,
        'decidedAt': decidedAt?.toUtc().toIso8601String(),
      };

  static CaptureDraft? tryFromJson(Object? j) {
    if (j is! Map) return null;
    final amount = Decimal.tryParse('${j['amount']}');
    final fp = j['fingerprint'];
    final captured = DateTime.tryParse('${j['capturedAt']}');
    if (amount == null || fp is! String || captured == null) return null;
    return CaptureDraft(
      fingerprint: fp,
      amount: amount,
      type: j['type'] == 'income' ? TxnType.income : TxnType.expense,
      merchant: '${j['merchant'] ?? ''}',
      date: '${j['date'] ?? ''}',
      source: DraftSource.fromKey(j['source'] as String?),
      capturedAt: captured,
      kind: CaptureKind.fromKey(j['kind'] as String?),
      instrument: CaptureInstrument.fromKey(j['instrument'] as String?),
      accountLast4: j['accountLast4'] as String?,
      utr: j['utr'] as String?,
      availableBalance: j['availableBalance'] == null ? null : Decimal.tryParse('${j['availableBalance']}'),
      profileId: j['profileId'] as String?,
      status: DraftStatus.fromKey(j['status'] as String?),
      decidedAt: j['decidedAt'] == null ? null : DateTime.tryParse('${j['decidedAt']}'),
    );
  }
}
