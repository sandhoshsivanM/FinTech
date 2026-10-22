/// PII filter for log messages (PRD §5B): strips any numeric run longer than
/// 3 digits before a message is written — prevents accidental amount logging.
/// Pure Dart, no imports.
abstract final class LogSanitizer {
  static final _longNumber = RegExp(r'\d{4,}');

  /// Replaces numeric sequences of 4+ digits with a redaction marker, leaving
  /// short numbers (≤3 digits, e.g. HTTP codes, small counts) intact.
  static String scrub(String message) =>
      message.replaceAll(_longNumber, '[redacted]');
}
