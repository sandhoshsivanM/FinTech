// One path from text to draft, shared by Gmail, OCR and the iOS shortcut.
// Text goes in, the shared parser (packages/khazana_domain) extracts values,
// the text is dropped. Nothing here logs or keeps [text].
import 'package:khazana_domain/services/notification_parser.dart';

import 'capture_draft.dart';
import 'capture_sink.dart';

enum IngestOutcome { added, duplicate, ignored }

class CaptureIngestor {
  CaptureIngestor({required this.sink, NotificationParser? parser, DateTime Function()? clock})
      : parser = parser ?? const NotificationParser(),
        _clock = clock ?? DateTime.now;

  final CaptureSink sink;
  final NotificationParser parser;
  final DateTime Function() _clock;

  /// [sender] is a hint for bank-profile matching (an email From header).
  Future<IngestOutcome> ingest(String text, DraftSource source, {String? sender}) async {
    final now = _clock();
    final parsed = parser.parse(fitForParser(text), now: now, sender: sender);
    if (parsed == null) return IngestOutcome.ignored;
    final added = await sink.add(CaptureDraft.fromParsed(parsed, source, now));
    return added ? IngestOutcome.added : IngestOutcome.duplicate;
  }

  /// The parser rejects anything over [NotificationParser.maxLength] (a ReDoS
  /// guard). Emails and OCR dumps are longer than an SMS, so hand it the
  /// stretch around the first amount, which is where the alert sentence is.
  static String fitForParser(String text) {
    const max = NotificationParser.maxLength;
    if (text.length <= max) return text;
    final m = _amountAnchor.firstMatch(text);
    final center = m?.start ?? 0;
    var start = center - 400;
    if (start < 0) start = 0;
    var end = start + max - 1;
    if (end > text.length) {
      end = text.length;
      start = end - (max - 1) < 0 ? 0 : end - (max - 1);
    }
    return text.substring(start, end);
  }

  static final _amountAnchor = RegExp(r'(?:rs\.?|inr|₹) ?[0-9]', caseSensitive: false);
}
