// Platform keystores return ECDSA signatures as ASN.1 DER (SEQUENCE { r, s });
// JWS (ES256) wants raw r||s, 32 bytes each. Strict: anything malformed throws.
import 'dart:typed_data';

class DerFormatException implements Exception {
  DerFormatException(this.message);
  final String message;
  @override
  String toString() => 'DerFormatException: $message';
}

/// One DER TLV read at [offset]: returns (tag, valueStart, valueEnd).
({int tag, int start, int end}) readTlv(Uint8List b, int offset) {
  if (offset + 2 > b.length) throw DerFormatException('truncated header');
  final tag = b[offset];
  var len = b[offset + 1];
  var start = offset + 2;
  if (len & 0x80 != 0) {
    final n = len & 0x7f;
    if (n == 0 || n > 3 || start + n > b.length) throw DerFormatException('bad length');
    len = 0;
    for (var i = 0; i < n; i++) {
      len = (len << 8) | b[start + i];
    }
    start += n;
  }
  final end = start + len;
  if (end > b.length) throw DerFormatException('length exceeds input');
  return (tag: tag, start: start, end: end);
}

Uint8List _fixed32(Uint8List b, int start, int end) {
  var s = start;
  while (end - s > 32 && b[s] == 0) {
    s++;
  }
  if (end - s > 32) throw DerFormatException('integer longer than 32 bytes');
  final out = Uint8List(32);
  out.setRange(32 - (end - s), 32, b, s);
  return out;
}

Uint8List derEcdsaToRaw(Uint8List der) {
  final seq = readTlv(der, 0);
  if (seq.tag != 0x30 || seq.end != der.length) throw DerFormatException('not a SEQUENCE');
  final r = readTlv(der, seq.start);
  if (r.tag != 0x02) throw DerFormatException('r is not an INTEGER');
  final s = readTlv(der, r.end);
  if (s.tag != 0x02 || s.end != seq.end) throw DerFormatException('s is not the last INTEGER');
  if (r.end == r.start || s.end == s.start) throw DerFormatException('empty integer');
  return Uint8List.fromList([..._fixed32(der, r.start, r.end), ..._fixed32(der, s.start, s.end)]);
}

/// Converts an uncompressed X9.63 point (0x04 || X || Y) to a P-256 JWK.
Map<String, String> p256JwkFromUncompressed(Uint8List point, String Function(List<int>) b64) {
  if (point.length != 65 || point[0] != 0x04) throw DerFormatException('not an uncompressed P-256 point');
  return {
    'kty': 'EC',
    'crv': 'P-256',
    'x': b64(point.sublist(1, 33)),
    'y': b64(point.sublist(33, 65)),
  };
}
