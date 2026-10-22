import 'dart:convert';

import 'package:cryptography/cryptography.dart';

/// SHA-256 transaction fingerprint for dedup (PRD §13C). Pure Dart.
abstract final class BankFingerprint {
  static Future<String> compute(String input) async {
    final hash = await Sha256().hash(utf8.encode(input));
    final sb = StringBuffer();
    for (final b in hash.bytes) {
      sb.write(b.toRadixString(16).padLeft(2, '0'));
    }
    return sb.toString();
  }
}
