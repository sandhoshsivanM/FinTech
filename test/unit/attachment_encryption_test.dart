import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/errors/app_error.dart';
import 'package:khazana/features/attachments/services/attachment_service.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';

/// Receipts are the one part of the vault that is a photograph, and they were
/// the one part stored in cleartext: `pickAndStore` did a plain `File.copy()`
/// into `<documents>/receipts/`, and "Erase all data" deleted database rows
/// while leaving every image behind. The app's written promise is AES-256 and
/// permanent deletion; for receipts it was neither.
///
/// These tests hold both halves of that promise.
class _FakePathProvider extends PathProviderPlatform
    with MockPlatformInterfaceMixin {
  _FakePathProvider(this.root);
  final String root;

  @override
  Future<String?> getApplicationDocumentsPath() async => root;
}

void main() {
  late Directory tmp;
  late AttachmentService service;

  Uint8List keyOf(int seed) {
    final r = Random(seed);
    return Uint8List.fromList(List.generate(32, (_) => r.nextInt(256)));
  }

  /// Stands in for a receipt image — content is irrelevant, only that it
  /// round-trips byte for byte.
  final plain =
      Uint8List.fromList(List.generate(4096, (i) => (i * 31 + 7) % 256));

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('khazana_receipts_');
    PathProviderPlatform.instance = _FakePathProvider(tmp.path);
    service = AttachmentService(key: keyOf(1));
  });

  tearDown(() async {
    if (await tmp.exists()) await tmp.delete(recursive: true);
  });

  test('what lands on disk is ciphertext, not the image', () async {
    final rel = await service.storeBytes(plain);
    final onDisk = await File(p.join(tmp.path, rel)).readAsBytes();

    expect(onDisk, isNot(equals(plain)));
    expect(onDisk.length, plain.length + 12 + 16,
        reason: '12-byte IV prefix and 16-byte GCM tag suffix');
    // No plaintext prefix survives at the head of the file.
    expect(onDisk.sublist(28, 60), isNot(equals(plain.sublist(0, 32))));
  });

  test('readBytes returns exactly what was stored', () async {
    final rel = await service.storeBytes(plain);
    expect(await service.readBytes(rel), equals(plain));
  });

  test('every receipt gets a fresh IV, so two identical images differ on disk',
      () async {
    final a = await service.storeBytes(plain);
    final b = await service.storeBytes(plain);

    final bytesA = await File(p.join(tmp.path, a)).readAsBytes();
    final bytesB = await File(p.join(tmp.path, b)).readAsBytes();

    expect(bytesA, isNot(equals(bytesB)),
        reason: 'a reused nonce under the same key breaks AES-GCM outright');
    expect(await service.readBytes(a), equals(plain));
    expect(await service.readBytes(b), equals(plain));
  });

  test('a receipt from another vault cannot be read', () async {
    final rel = await service.storeBytes(plain);
    final otherVault = AttachmentService(key: keyOf(2));

    await expectLater(otherVault.readBytes(rel), throwsA(isA<BackupError>()));
  });

  test('a tampered receipt is refused rather than shown', () async {
    final rel = await service.storeBytes(plain);
    final file = File(p.join(tmp.path, rel));
    final bytes = await file.readAsBytes();
    bytes[20] ^= 0xFF;
    await file.writeAsBytes(bytes, flush: true);

    await expectLater(service.readBytes(rel), throwsA(isA<BackupError>()));
  });

  test('a truncated receipt is refused rather than crashing', () async {
    final rel = await service.storeBytes(plain);
    final file = File(p.join(tmp.path, rel));
    await file.writeAsBytes((await file.readAsBytes()).sublist(0, 10),
        flush: true);

    await expectLater(service.readBytes(rel), throwsA(isA<BackupError>()));
  });

  test('a missing receipt reads as null, not an error', () async {
    expect(await service.readBytes('receipts/nope.enc'), isNull);
    expect(await service.readBytes(null), isNull);
  });

  test('purgeAll removes every receipt', () async {
    await service.storeBytes(plain);
    await service.storeBytes(plain);
    final dir = Directory(p.join(tmp.path, AttachmentService.dirName));
    expect(await dir.exists(), isTrue);
    expect(await dir.list().length, 2);

    await service.purgeAll();

    expect(await dir.exists(), isFalse,
        reason: '"Erase all data" says it permanently deletes. For the one '
            'record type that is a photograph of someone\'s finances, it must.');
  });

  test('purgeAll on an empty vault is a no-op, not a crash', () async {
    await service.purgeAll();
    await service.purgeAll();
  });

  test('delete removes one receipt and leaves the rest', () async {
    final a = await service.storeBytes(plain);
    final b = await service.storeBytes(plain);

    await service.delete(a);

    expect(await service.readBytes(a), isNull);
    expect(await service.readBytes(b), equals(plain));
  });
}
