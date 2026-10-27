import 'dart:typed_data';

import 'package:khazana_online/core/dpop.dart';
import 'package:khazana_online/security/device_key_provider.dart';
import 'package:khazana_online/security/hardware_key.dart';
import 'package:khazana_online/security/integrity.dart';
import 'package:pointycastle/export.dart';

Uint8List _int(Uint8List be) {
  var b = be.toList();
  while (b.length > 1 && b.first == 0) {
    b.removeAt(0);
  }
  if (b.first & 0x80 != 0) b = [0, ...b];
  return Uint8List.fromList([0x02, b.length, ...b]);
}

/// Raw r||s to DER, as a platform keystore would return it.
Uint8List rawToDer(Uint8List raw) {
  final body = [..._int(raw.sublist(0, 32)), ..._int(raw.sublist(32))];
  return Uint8List.fromList([0x30, body.length, ...body]);
}

Uint8List uncompressed(DeviceKey k) {
  final q = k.publicKey.Q!;
  Uint8List be(BigInt v) {
    final o = Uint8List(32);
    for (var i = 31; i >= 0; i--) {
      o[i] = (v & BigInt.from(255)).toInt();
      v >>= 8;
    }
    return o;
  }

  return Uint8List.fromList([4, ...be(q.x!.toBigInteger()!), ...be(q.y!.toBigInteger()!)]);
}

/// A fake secure chip: keys live in a map and only signatures come out.
class FakeHardware implements HardwareKeyBackend {
  FakeHardware({this.lvl = HardwareLevel.strongBox});
  HardwareLevel lvl;
  final keys = <String, DeviceKey>{};
  int creates = 0;

  @override
  Future<HardwareLevel> level() async => lvl;
  @override
  Future<Uint8List?> publicKey(String alias) async => keys[alias] == null ? null : uncompressed(keys[alias]!);
  @override
  Future<({Uint8List publicKey, HardwareLevel level})> create(String alias) async {
    if (lvl == HardwareLevel.none) throw HardwareKeyUnavailable('no chip');
    creates++;
    final k = keys[alias] = DeviceKey.generate();
    return (publicKey: uncompressed(k), level: lvl);
  }

  @override
  Future<Uint8List> signDer(String alias, Uint8List message) async => rawToDer(keys[alias]!.signRaw(message));
  @override
  Future<void> delete(String alias) async => keys.remove(alias);
}

class FakeLegacy implements LegacySoftwareKey {
  String? stored;
  bool session = false;
  @override
  Future<String?> read() async => stored;
  @override
  Future<void> write(String exported) async => stored = exported;
  @override
  Future<void> erase() async => stored = null;
  @override
  Future<bool> hasSession() async => session;
}

class FakeProbe implements IntegrityProbe {
  FakeProbe([this.report = const IntegrityReport.clean()]);
  IntegrityReport report;
  int calls = 0;
  @override
  Future<IntegrityReport> check() async {
    calls++;
    return report;
  }
}

bool verifyEs256(Uint8List message, Uint8List raw, ECPublicKey pub) {
  BigInt big(List<int> b) => b.fold(BigInt.zero, (a, x) => (a << 8) | BigInt.from(x));
  final v = ECDSASigner(SHA256Digest())..init(false, PublicKeyParameter<ECPublicKey>(pub));
  return v.verifySignature(message, ECSignature(big(raw.sublist(0, 32)), big(raw.sublist(32))));
}
