import 'package:decimal/decimal.dart';
import 'package:intl/intl.dart';

/// Money formatting for display and for screen readers (PRD §10A: currency
/// read as words, e.g. "Ten thousand rupees", not "10,000").
abstract final class Money {
  static final NumberFormat _inr =
      NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

  /// Display string, e.g. ₹10,000.00 (Indian grouping).
  static String format(Decimal amount) => _inr.format(amount.toDouble());

  /// Short form for chart axes: ₹1.2L, ₹90k, ₹450.
  ///
  /// Uses the Indian scale — lakh and crore — because the rest of the app
  /// groups digits that way (₹9,25,935.49, not ₹925,935.49) and an axis reading
  /// "₹925k" beside a total reading "₹9,25,935" makes the reader do a
  /// conversion to check they match.
  ///
  /// One decimal at most. An axis label is read at a glance and is there to
  /// give the bars a scale, not to be the number of record — that is what the
  /// hover readout and the totals above are for.
  static String compact(num amount) {
    final v = amount.abs();
    final sign = amount < 0 ? '-' : '';
    String trim(double x) {
      final s = x.toStringAsFixed(1);
      return s.endsWith('.0') ? s.substring(0, s.length - 2) : s;
    }

    if (v >= 10000000) return '$sign₹${trim(v / 10000000)}Cr';
    if (v >= 100000) return '$sign₹${trim(v / 100000)}L';
    if (v >= 1000) return '$sign₹${trim(v / 1000)}k';
    return '$sign₹${v.toStringAsFixed(0)}';
  }

  /// Signed display for a transaction type.
  static String formatSigned(Decimal amount, {required bool isIncome}) {
    final s = format(amount);
    return isIncome ? '+$s' : '-$s';
  }

  /// Accessible words for screen readers (whole-rupee precision; paise spoken
  /// separately when present).
  static String toWords(Decimal amount) {
    final negative = amount < Decimal.zero;
    final abs = amount.abs();
    final rupees = abs.truncate().toBigInt().toInt();
    final paise = ((abs - abs.truncate()) * Decimal.fromInt(100))
        .round()
        .toBigInt()
        .toInt();
    final buf = StringBuffer();
    if (negative) buf.write('minus ');
    buf.write(_indianWords(rupees));
    buf.write(rupees == 1 ? ' rupee' : ' rupees');
    if (paise > 0) {
      buf.write(' and ${_indianWords(paise)} paise');
    }
    return buf.toString();
  }

  // --- Indian numbering system to words (supports up to crores) ---
  static const _ones = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  static const _tens = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
    'eighty', 'ninety'
  ];

  static String _twoDigits(int n) {
    if (n < 20) return _ones[n];
    final t = _tens[n ~/ 10];
    final o = n % 10;
    return o == 0 ? t : '$t-${_ones[o]}';
  }

  static String _threeDigits(int n) {
    final h = n ~/ 100;
    final rest = n % 100;
    if (h == 0) return _twoDigits(rest);
    final hundred = '${_ones[h]} hundred';
    return rest == 0 ? hundred : '$hundred ${_twoDigits(rest)}';
  }

  static String _indianWords(int n) {
    if (n < 1000) return _threeDigits(n);
    final parts = <String>[];
    final crore = n ~/ 10000000;
    final lakh = (n % 10000000) ~/ 100000;
    final thousand = (n % 100000) ~/ 1000;
    final below = n % 1000;
    if (crore > 0) parts.add('${_indianWords(crore)} crore');
    if (lakh > 0) parts.add('${_twoDigits(lakh)} lakh');
    if (thousand > 0) parts.add('${_twoDigits(thousand)} thousand');
    if (below > 0) parts.add(_threeDigits(below));
    return parts.join(' ');
  }
}
