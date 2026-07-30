import 'package:khazana/domain/services/log_sanitizer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('LogSanitizer (PRD §5B: strip numbers >3 digits)', () {
    test('redacts a 4+ digit number (e.g. an amount)', () {
      expect(LogSanitizer.scrub('Saved amount 125000 to db'),
          'Saved amount [redacted] to db');
    });

    test('keeps 3-digit numbers (e.g. HTTP codes, small counts)', () {
      expect(LogSanitizer.scrub('HTTP 404 after 3 retries'),
          'HTTP 404 after 3 retries');
    });

    test('redacts each long run independently', () {
      expect(LogSanitizer.scrub('from 10000 to 25000'),
          'from [redacted] to [redacted]');
    });

    test('boundary: exactly 3 digits kept, 4 digits redacted', () {
      expect(LogSanitizer.scrub('999'), '999');
      expect(LogSanitizer.scrub('1000'), '[redacted]');
    });

    test('leaves non-numeric text untouched', () {
      expect(LogSanitizer.scrub('ImportService failed'),
          'ImportService failed');
    });
  });
}
