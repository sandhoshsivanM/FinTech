import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:meta/meta.dart';

/// Why a licence key was accepted or refused.
enum LicenseVerdict {
  valid,

  /// Not shaped like a key at all — wrong prefix, wrong length, bad base64.
  malformed,

  /// A key from a future format version. Refused rather than guessed at.
  unsupportedVersion,

  /// A valid signature over a payload for a different product.
  wrongProduct,

  /// Well-formed, but the signature does not verify under our public key.
  /// Either a forgery or a key issued under a rotated key pair.
  badSignature,
}

/// The result of checking a key, plus what the UI needs to display.
@immutable
class LicenseCheck {
  const LicenseCheck(this.verdict, {this.orderRef, this.issuedAt});

  final LicenseVerdict verdict;

  /// 16 hex chars, display only. See [Entitlement.orderRef].
  final String? orderRef;

  /// Display only — nothing compares it against the clock. A perpetual licence
  /// has no expiry, which is precisely what makes offline verification sound:
  /// there is no time-dependent claim for a wrong device clock to break.
  final DateTime? issuedAt;

  bool get isValid => verdict == LicenseVerdict.valid;
}

/// Khazana licence keys: `KHAZ1.<base64url(payload ‖ signature)>`
///
/// ```
///   byte  0      format version (0x01)
///   byte  1      product        (0x01 = khazana-pro)
///   bytes 2-3    issuedAtDays   uint16 BE, days since 2020-01-01, display only
///   bytes 4-11   orderRef       first 8 bytes of SHA-256(merchant order id)
///   bytes 12-75  Ed25519 signature over bytes 0..11
/// ```
///
/// 76 bytes → 102 base64url characters.
///
/// Why this shape:
///
///  * **Ed25519, verified on-device.** The client is a verifier, not an API
///    client. It never contacts anything to check a key, so Pro works on a
///    plane and we never learn who is running the app. This is the whole reason
///    not to use a merchant's built-in licence-key feature, which requires a
///    `/validate` round trip and would quietly turn the no-server promise into
///    a lie.
///  * **base64url, not base32 or a custom alphabet.** Both Dart and JavaScript
///    have it natively, so there is no hand-rolled codec to drift between the
///    two clients — and keeping the two clients from drifting is this repo's
///    entire quality strategy.
///  * **No email, no name, no device id.** The payload carries a *hash* of the
///    order, so the client holds zero personal data and the paywall can still
///    say "Licence …4F2A". A key is not an identity.
///  * **No expiry field.** Deliberate. A perpetual licence has nothing to check
///    a clock against; the moment an expiry exists, offline verification needs
///    trustworthy time and the design falls apart. This is the strongest reason
///    Pro must never become a subscription without a server.
class LicenseKey {
  const LicenseKey._();

  static const String prefix = 'KHAZ1.';
  static const int formatVersion = 0x01;
  static const int productKhazanaPro = 0x01;

  static const int _payloadLen = 12;
  static const int _signatureLen = 64;
  static const int totalLen = _payloadLen + _signatureLen; // 76

  static final DateTime _epoch = DateTime.utc(2020, 1, 1);

  static final Ed25519 _algo = Ed25519();

  /// Verifies [raw] against [publicKey] (32 bytes).
  ///
  /// Tolerant of how people actually paste keys: surrounding whitespace,
  /// internal spaces and newlines from an email client wrapping a long line,
  /// and a missing `KHAZ1.` prefix. None of those are the user's mistake to pay
  /// for.
  ///
  /// Note what is deliberately NOT stripped: hyphens. `-` is a real character
  /// in the base64url alphabet, so treating it as decoration and removing it
  /// corrupts the payload of any key that happens to contain one — which is
  /// most of them. That was a live bug here, caught by the shared fixture.
  static Future<LicenseCheck> verify(
    String raw,
    List<int> publicKey,
  ) async {
    final bytes = _decode(raw);
    if (bytes == null || bytes.length != totalLen) {
      return const LicenseCheck(LicenseVerdict.malformed);
    }

    if (bytes[0] != formatVersion) {
      return const LicenseCheck(LicenseVerdict.unsupportedVersion);
    }
    if (bytes[1] != productKhazanaPro) {
      return const LicenseCheck(LicenseVerdict.wrongProduct);
    }

    final payload = bytes.sublist(0, _payloadLen);
    final signature = bytes.sublist(_payloadLen);

    final ok = await _algo.verify(
      payload,
      signature: Signature(
        signature,
        publicKey: SimplePublicKey(publicKey, type: KeyPairType.ed25519),
      ),
    );
    if (!ok) return const LicenseCheck(LicenseVerdict.badSignature);

    return LicenseCheck(
      LicenseVerdict.valid,
      orderRef: _hex(payload.sublist(4, 12)),
      issuedAt: _epoch.add(Duration(days: (payload[2] << 8) | payload[3])),
    );
  }

  /// Builds the 12-byte payload. Shared with `tool/mint_licenses.dart` so the
  /// minter and the verifier cannot disagree about the layout.
  static Uint8List buildPayload({
    required DateTime issuedAt,
    required List<int> orderRefBytes,
  }) {
    assert(orderRefBytes.length == 8, 'orderRef must be 8 bytes');
    final days = issuedAt.toUtc().difference(_epoch).inDays;
    assert(days >= 0 && days <= 0xFFFF, 'issuedAt out of representable range');

    final out = Uint8List(_payloadLen);
    out[0] = formatVersion;
    out[1] = productKhazanaPro;
    out[2] = (days >> 8) & 0xFF;
    out[3] = days & 0xFF;
    out.setRange(4, 12, orderRefBytes);
    return out;
  }

  /// Formats payload + signature as the user-facing key string.
  static String encode(Uint8List payload, List<int> signature) {
    final all = Uint8List(totalLen)
      ..setRange(0, _payloadLen, payload)
      ..setRange(_payloadLen, totalLen, signature);
    return '$prefix${base64Url.encode(all).replaceAll('=', '')}';
  }

  static Uint8List? _decode(String raw) {
    // Whitespace only — `-` and `_` are base64url payload characters.
    var s = raw.replaceAll(RegExp(r'\s'), '');
    if (s.toUpperCase().startsWith('KHAZ1.')) s = s.substring(prefix.length);
    if (s.isEmpty) return null;

    // base64url without padding is what we emit; add it back before decoding.
    final pad = (4 - s.length % 4) % 4;
    try {
      return Uint8List.fromList(base64Url.decode(s + '=' * pad));
    } catch (_) {
      return null;
    }
  }

  static String _hex(List<int> bytes) =>
      bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join().toUpperCase();
}
