import '../entities/capture_types.dart';
import '../repositories/pending_capture_repository.dart';

/// Finds the Khazana money account a captured alert belongs to, from the links
/// the user has confirmed ("HDFC ••1234 is my HDFC Savings").
///
/// Built once per batch: the constructor indexes every link into a map, so each
/// lookup is O(1) instead of a scan over all links — the matcher runs for every
/// message in a 90-day history import, which can be thousands.
class CaptureAccountMatcher {
  CaptureAccountMatcher(Iterable<CaptureAccountLink> links)
      : _byKey = {for (final l in links) _key(l.profileId, l.last4, l.instrument): l.accountId};

  final Map<String, String> _byKey;

  /// A UPI payment and a plain account alert from the same bank both move the
  /// same savings account, so they share a family. Cards do not: a debit card
  /// prints the *card's* digits, which are not the account's.
  static String _family(CaptureInstrument i) => switch (i) {
        CaptureInstrument.creditCard => 'credit_card',
        CaptureInstrument.debitCard => 'debit_card',
        CaptureInstrument.account ||
        CaptureInstrument.upi ||
        CaptureInstrument.unknown =>
          'account',
      };

  static String _key(String profileId, String last4, CaptureInstrument i) =>
      '$profileId|$last4|${_family(i)}';

  /// The linked account id, or null when the user hasn't linked this suffix.
  ///
  /// Tries the bank-specific link first, then a bank-less one — a link made
  /// from an alert that named no bank still answers for that suffix.
  String? match({
    required String? profileId,
    required String? last4,
    required CaptureInstrument instrument,
  }) {
    if (last4 == null) return null;
    return _byKey[_key(profileId ?? '', last4, instrument)] ??
        _byKey[_key('', last4, instrument)];
  }
}
