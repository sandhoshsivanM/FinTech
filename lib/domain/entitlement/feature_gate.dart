import 'package:meta/meta.dart';

import 'entitlement.dart';
import 'pro_feature.dart';

/// Why a feature is or is not available right now.
enum GateReason {
  /// Free for everyone, forever.
  alwaysFree,

  /// Free tier, and this is a free feature.
  includedInFree,

  /// Pro is unlocked.
  unlocked,

  /// Pro feature, Pro not unlocked.
  needsPro,

  /// A counted allowance is used up (imports, profiles). Still needsPro to
  /// resolve, but the copy differs: "you have used your free import" reads very
  /// differently from "this is a Pro feature", and only one of them is true.
  allowanceUsed,
}

@immutable
class GateDecision {
  const GateDecision(this.allowed, this.reason);

  final bool allowed;
  final GateReason reason;

  static const _free = GateDecision(true, GateReason.alwaysFree);
  static const _included = GateDecision(true, GateReason.includedInFree);
  static const _unlocked = GateDecision(true, GateReason.unlocked);
  static const _needsPro = GateDecision(false, GateReason.needsPro);
  static const _allowanceUsed = GateDecision(false, GateReason.allowanceUsed);

  @override
  bool operator ==(Object other) =>
      other is GateDecision && other.allowed == allowed && other.reason == reason;

  @override
  int get hashCode => Object.hash(allowed, reason);

  @override
  String toString() => 'GateDecision($allowed, ${reason.name})';
}

/// The single place that answers "can this user use this feature".
///
/// Pure: no Riverpod, no Flutter, no I/O. Every screen asks this and nothing
/// re-implements it, so there is exactly one thing to test and exactly one
/// thing to get wrong.
GateDecision gateFor(ProFeature feature, Entitlement entitlement) {
  // Checked FIRST, before the entitlement is even looked at. Ordering is the
  // enforcement: it makes it structurally impossible for any future change to
  // the Pro logic below to accidentally gate a promised-free feature.
  if (kAlwaysFree.contains(feature)) return GateDecision._free;

  if (entitlement.isPro) return GateDecision._unlocked;

  return kProFeatures.contains(feature)
      ? GateDecision._needsPro
      : GateDecision._included;
}

/// Convenience for the common boolean question.
bool isAllowed(ProFeature feature, Entitlement entitlement) =>
    gateFor(feature, entitlement).allowed;

/// Whether a counted import may still be committed.
///
/// [used] is how many imports this vault has already committed. Pro is
/// unlimited; free gets [ProAllowances.freeCommittedImports], and the failure
/// is reported as [GateReason.allowanceUsed] so the UI can say "you have used
/// your free import" rather than the less honest "this is a Pro feature" — it
/// was not, a moment ago.
GateDecision gateForImport(Entitlement entitlement, {required int used}) {
  if (entitlement.isPro) return GateDecision._unlocked;
  return used < ProAllowances.freeCommittedImports
      ? GateDecision._included
      : GateDecision._allowanceUsed;
}

/// Whether another profile/vault may be created.
GateDecision gateForProfile(Entitlement entitlement, {required int existing}) {
  if (entitlement.isPro) return GateDecision._unlocked;
  return existing < ProAllowances.freeProfiles
      ? GateDecision._included
      : GateDecision._allowanceUsed;
}
