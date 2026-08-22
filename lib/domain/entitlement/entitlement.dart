import 'package:meta/meta.dart';

/// Where a Pro unlock came from.
///
/// Recorded rather than reduced to a bool because the recovery advice differs:
/// an App Store purchase is restored with a button, a licence key is re-entered
/// by hand, and telling someone the wrong one wastes their afternoon.
enum ProSource {
  /// Not unlocked.
  none,

  /// StoreKit non-consumable (iOS, iPadOS, macOS — one Universal Purchase).
  appStore,

  /// Play Billing one-time product.
  playStore,

  /// Ed25519-signed licence key, for the web and desktop builds where there is
  /// no app store to ask.
  licenseKey,

  /// `--dart-define=KHAZANA_PRO=true`. Development only; never in a store build.
  devOverride,
}

/// Whether Pro is unlocked, and what we know about how.
@immutable
class Entitlement {
  const Entitlement({
    required this.isPro,
    required this.source,
    this.grantedAt,
    this.lastVerifiedAt,
    this.orderRef,
    this.missingSince,
  });

  /// The starting state, and the state we fall back to — never by deleting
  /// anything, only by declining to grant.
  static const free = Entitlement(isPro: false, source: ProSource.none);

  final bool isPro;
  final ProSource source;

  /// When the purchase or licence was first seen on this device.
  final DateTime? grantedAt;

  /// Last time a store or a signature confirmed it. Null for a cache that has
  /// never been re-checked.
  final DateTime? lastVerifiedAt;

  /// First 8 bytes of SHA-256 over the merchant order id, hex — display only.
  ///
  /// Deliberately a hash and not an email or a name: it lets the paywall show
  /// "Licence …4F2A · activated 12 Mar 2026" and lets a publicly-posted key be
  /// traced back to its order, while the client holds zero personal data.
  final String? orderRef;

  /// When a *successful* store query first came back reporting no purchase.
  ///
  /// Load-bearing for the two-strikes rule in [EntitlementNotifier]: the usual
  /// cause of a single miss is being signed into the wrong store account, and
  /// revoking Pro from a paying customer over that is far worse than being slow
  /// to revoke it from someone who refunded.
  final DateTime? missingSince;

  Entitlement copyWith({
    bool? isPro,
    ProSource? source,
    DateTime? grantedAt,
    DateTime? lastVerifiedAt,
    String? orderRef,
    DateTime? missingSince,
    bool clearMissingSince = false,
  }) {
    return Entitlement(
      isPro: isPro ?? this.isPro,
      source: source ?? this.source,
      grantedAt: grantedAt ?? this.grantedAt,
      lastVerifiedAt: lastVerifiedAt ?? this.lastVerifiedAt,
      orderRef: orderRef ?? this.orderRef,
      missingSince:
          clearMissingSince ? null : (missingSince ?? this.missingSince),
    );
  }

  Map<String, dynamic> toJson() => {
        'isPro': isPro,
        'source': source.name,
        if (grantedAt != null) 'grantedAt': grantedAt!.toIso8601String(),
        if (lastVerifiedAt != null)
          'lastVerifiedAt': lastVerifiedAt!.toIso8601String(),
        if (orderRef != null) 'orderRef': orderRef,
        if (missingSince != null) 'missingSince': missingSince!.toIso8601String(),
      };

  /// Tolerant on purpose. A cache written by a newer build, or half-corrupted,
  /// must degrade to Free rather than throw on startup — this is read before
  /// the first frame, and an exception here is a launch failure.
  static Entitlement fromJson(Map<String, dynamic> json) {
    DateTime? date(String key) {
      final raw = json[key];
      return raw is String ? DateTime.tryParse(raw) : null;
    }

    return Entitlement(
      isPro: json['isPro'] == true,
      source: ProSource.values.firstWhere(
        (s) => s.name == json['source'],
        orElse: () => ProSource.none,
      ),
      grantedAt: date('grantedAt'),
      lastVerifiedAt: date('lastVerifiedAt'),
      orderRef: json['orderRef'] as String?,
      missingSince: date('missingSince'),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is Entitlement &&
      other.isPro == isPro &&
      other.source == source &&
      other.grantedAt == grantedAt &&
      other.lastVerifiedAt == lastVerifiedAt &&
      other.orderRef == orderRef &&
      other.missingSince == missingSince;

  @override
  int get hashCode =>
      Object.hash(isPro, source, grantedAt, lastVerifiedAt, orderRef, missingSince);

  @override
  String toString() => 'Entitlement(isPro: $isPro, source: ${source.name})';
}
