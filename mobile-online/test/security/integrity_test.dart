import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/security/integrity.dart';

import 'fakes.dart';

const _rooted = IntegrityReport({IntegrityFinding.rooted});

void main() {
  const strict = SecurityPolicy();

  test('clean device: everything allowed', () {
    for (final a in SensitiveAction.values) {
      expect(strict.decide(a, const IntegrityReport.clean()), Decision.allow);
    }
  });

  test('compromised device: pairing, key export and phrase reveal are blocked; the rest warns', () {
    for (final a in [SensitiveAction.pairing, SensitiveAction.keyExport, SensitiveAction.recoveryPhraseReveal]) {
      expect(strict.decide(a, _rooted), Decision.block, reason: a.name);
    }
    expect(strict.decide(SensitiveAction.signIn, _rooted), Decision.warn);
    expect(strict.decide(SensitiveAction.balanceView, _rooted), Decision.warn);
  });

  test('every finding kind blocks', () {
    for (final f in IntegrityFinding.values) {
      expect(strict.decide(SensitiveAction.keyExport, IntegrityReport({f})), Decision.block, reason: f.name);
    }
  });

  test('a software-held key blocks the sensitive actions even on a clean device', () {
    expect(strict.decide(SensitiveAction.pairing, const IntegrityReport.clean(), softwareKey: true), Decision.block);
    expect(strict.decide(SensitiveAction.signIn, const IntegrityReport.clean(), softwareKey: true), Decision.allow);
  });

  test('debug override downgrades block to warn, never to silence', () {
    const dbg = SecurityPolicy(allowCompromised: true);
    expect(dbg.decide(SensitiveAction.pairing, _rooted), Decision.warn);
    expect(dbg.decide(SensitiveAction.pairing, const IntegrityReport.clean()), Decision.allow);
  });

  test('the define is honoured in debug builds (this test run) only through fromBuild', () {
    expect(SecurityPolicy.fromBuild(allowCompromisedDefine: false).allowCompromised, isFalse);
    // kDebugMode is true under flutter test; a release build compiles it to false.
    expect(SecurityPolicy.fromBuild(allowCompromisedDefine: true).allowCompromised, isTrue);
  });

  test('guard throws BlockedBySecurity, re-probes each time', () async {
    final probe = FakeProbe(_rooted);
    final guard = SensitiveActionGuard(probe: probe, policy: strict);
    await expectLater(guard.require(SensitiveAction.recoveryPhraseReveal), throwsA(isA<BlockedBySecurity>()));
    expect(await guard.require(SensitiveAction.balanceView), Decision.warn);
    probe.report = const IntegrityReport.clean();
    expect(await guard.require(SensitiveAction.pairing), Decision.allow);
    expect(probe.calls, 3);
  });

  test('guard consults the software-key flag', () async {
    final guard = SensitiveActionGuard(probe: FakeProbe(), policy: strict, isSoftwareKey: () => true);
    await expectLater(guard.require(SensitiveAction.keyExport), throwsA(isA<BlockedBySecurity>()));
  });

  group('channel probe', () {
    TestWidgetsFlutterBinding.ensureInitialized();
    const channel = MethodChannel('khazana/integrity');
    void mock(Future<Object?> Function(MethodCall) h) =>
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, h);
    tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null));

    test('parses findings; unknown names count as tampering', () async {
      mock((_) async => ['rooted', 'somethingNew']);
      final r = await ChannelIntegrityProbe().check();
      expect(r.findings, {IntegrityFinding.rooted, IntegrityFinding.tampered});
    });
    test('a failing probe fails closed', () async {
      mock((_) async => throw PlatformException(code: 'boom'));
      expect((await ChannelIntegrityProbe().check()).compromised, isTrue);
    });
    test('no native side: clean', () async {
      expect((await ChannelIntegrityProbe().check()).compromised, isFalse);
    });
  });
}
