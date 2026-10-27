// Root / jailbreak / tamper detection and what we do about it.
//
// Detection runs natively (`khazana/integrity`). It is heuristic: a determined
// attacker can hide root, so this raises the bar and is paired with server-side
// attestation (attestation.dart). The point of THIS layer is that on a device
// we think is compromised we say so and refuse the actions that expose secrets,
// instead of silently carrying on.
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum IntegrityFinding {
  rooted, // su binaries, test-keys, Magisk, writable system / jailbreak files
  debuggerAttached,
  hookingFramework, // Frida, Substrate, Xposed in the process
  emulator, // simulator / emulator (no hardware-backed keys)
  tampered, // injected libraries, repackaged
}

class IntegrityReport {
  const IntegrityReport(this.findings);
  const IntegrityReport.clean() : findings = const {};
  final Set<IntegrityFinding> findings;
  bool get compromised => findings.isNotEmpty;
}

abstract class IntegrityProbe {
  Future<IntegrityReport> check();
}

class ChannelIntegrityProbe implements IntegrityProbe {
  ChannelIntegrityProbe([MethodChannel? channel]) : _c = channel ?? const MethodChannel('khazana/integrity');
  final MethodChannel _c;

  @override
  Future<IntegrityReport> check() async {
    try {
      final raw = await _c.invokeMethod<List<Object?>>('check');
      final found = <IntegrityFinding>{};
      for (final name in raw ?? const []) {
        final f = IntegrityFinding.values.where((v) => v.name == name);
        // An unknown finding from native code is treated as tampering, not ignored.
        found.add(f.isEmpty ? IntegrityFinding.tampered : f.first);
      }
      return IntegrityReport(found);
    } on MissingPluginException {
      return const IntegrityReport.clean(); // platforms with no native probe (tests, desktop)
    } on PlatformException {
      // The probe itself failing is suspicious: fail closed.
      return const IntegrityReport({IntegrityFinding.tampered});
    }
  }
}

/// Things that expose secrets or add trust. Extend as features land.
enum SensitiveAction { signIn, pairing, keyExport, recoveryPhraseReveal, balanceView }

enum Decision { allow, warn, block }

class SecurityPolicy {
  const SecurityPolicy({this.allowCompromised = false, this.softwareKeyBlocksSensitive = true});

  /// Debug-only escape hatch (the factory below ignores it in release).
  final bool allowCompromised;

  /// A software-held key cannot be trusted for the actions below.
  final bool softwareKeyBlocksSensitive;

  /// The define only takes effect in debug builds; release builds ignore it.
  factory SecurityPolicy.fromBuild({required bool allowCompromisedDefine}) =>
      SecurityPolicy(allowCompromised: kDebugMode && allowCompromisedDefine);

  static const _blocking = {
    SensitiveAction.pairing,
    SensitiveAction.keyExport,
    SensitiveAction.recoveryPhraseReveal,
  };

  Decision decide(SensitiveAction action, IntegrityReport report, {bool softwareKey = false}) {
    if (allowCompromised) return report.compromised ? Decision.warn : Decision.allow;
    if (_blocking.contains(action)) {
      if (report.compromised) return Decision.block;
      if (softwareKey && softwareKeyBlocksSensitive) return Decision.block;
      return Decision.allow;
    }
    // Everything else continues but the user is told.
    return report.compromised ? Decision.warn : Decision.allow;
  }
}

class BlockedBySecurity implements Exception {
  BlockedBySecurity(this.action, this.report);
  final SensitiveAction action;
  final IntegrityReport report;
  @override
  String toString() => 'BlockedBySecurity(${action.name}: ${report.findings.map((f) => f.name).join(', ')})';
}

/// Checks integrity right before a sensitive action. Re-checks every time (a
/// hook can appear after launch); the result is not cached.
class SensitiveActionGuard {
  SensitiveActionGuard({required this.probe, required this.policy, this.isSoftwareKey});
  final IntegrityProbe probe;
  final SecurityPolicy policy;

  /// Reports whether the device key is the software fallback.
  final bool Function()? isSoftwareKey;

  /// Throws [BlockedBySecurity] to block; returns the decision otherwise so the
  /// UI can show a warning for [Decision.warn].
  Future<Decision> require(SensitiveAction action) async {
    final report = await probe.check();
    final decision = policy.decide(action, report, softwareKey: isSoftwareKey?.call() ?? false);
    if (decision == Decision.block) throw BlockedBySecurity(action, report);
    return decision;
  }
}
