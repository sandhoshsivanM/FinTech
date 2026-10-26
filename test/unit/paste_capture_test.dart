import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/features/capture/screens/capture_inbox_screen.dart';

void main() {
  group('splitPastedMessages', () {
    test('separates alerts on blank lines and keeps one alert whole', () {
      const a = 'Rs 450 debited from a/c XX1234 to SWIGGY';
      const b = 'INR 99.00 credited to a/c XX9876\nUPI Ref 123456789012';
      expect(splitPastedMessages('$a\n\n  \n$b\n'), [a, b]);
    });

    test('nothing to paste gives nothing', () {
      expect(splitPastedMessages('   \n\n '), isEmpty);
    });

    test('caps one paste at 50 messages', () {
      final many = List.generate(60, (i) => 'Rs $i debited').join('\n\n');
      expect(splitPastedMessages(many), hasLength(50));
    });
  });
}
