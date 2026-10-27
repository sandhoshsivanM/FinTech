// Small byte helpers. The server's byte[] fields travel as standard base64.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

Uint8List utf8Bytes(String s) => Uint8List.fromList(utf8.encode(s));

String toBase64(List<int> bytes) => base64.encode(bytes);

/// Accepts standard and URL-safe base64, padded or not (as the web client does).
Uint8List fromBase64(String s) => Uint8List.fromList(base64.decode(base64.normalize(s.replaceAll('-', '+').replaceAll('_', '/'))));

String base64UrlNoPadding(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

Uint8List concat(List<List<int>> parts) {
  final out = BytesBuilder(copy: false);
  for (final p in parts) {
    out.add(p);
  }
  return out.toBytes();
}

final Random _secure = Random.secure();

Uint8List randomBytes(int n) => Uint8List.fromList(List.generate(n, (_) => _secure.nextInt(256)));

Uint8List fromHex(String hex) =>
    Uint8List.fromList([for (var i = 0; i < hex.length; i += 2) int.parse(hex.substring(i, i + 2), radix: 16)]);

String toHex(List<int> bytes) => bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

/// Compares without stopping at the first difference.
bool constantTimeEquals(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}
