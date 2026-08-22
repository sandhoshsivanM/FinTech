import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../../core/errors/app_error.dart';

/// Stores receipt images on-device, encrypted with the vault key.
///
/// They used to be a plain `File.copy()` into `<documents>/receipts/`, which
/// meant the one part of the vault that is a *photograph* — a bank slip, a
/// medical bill, a salary statement — was the one part sitting in cleartext.
/// Anything with access to the app container could read them, they were
/// included in any device backup that reached the folder, and "Erase all data"
/// deleted the database rows while leaving every image behind.
///
/// Now each file is AES-256-GCM sealed with the same key as the database, using
/// the same layout as the encrypted backup format:
///
///   0x00  12  random IV (fresh per file, never reused)
///   0x0C  ..  ciphertext
///   EOF-16 16 GCM authentication tag
///
/// The transaction still stores only the *relative* path, so the store survives
/// the app container moving between OS updates.
class AttachmentService {
  const AttachmentService({required this.key, this.uuid = const Uuid()});

  /// The vault key — the same 32 bytes that open the database. Receipts are
  /// part of the vault, so they are locked and erased with it.
  final Uint8List key;
  final Uuid uuid;

  static const String dirName = 'receipts';
  static const String _ext = '.enc';
  static const int _ivLen = 12;
  static const int _tagLen = 16;

  static final AesGcm _algo = AesGcm.with256bits(nonceLength: _ivLen);

  Future<Directory> _dir() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, dirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// Picks an image, encrypts it into the sandbox, and returns the relative
  /// path (`receipts/<id>.enc`) to store on the transaction — or null if the
  /// user cancelled.
  ///
  /// The original is never copied in the clear, not even briefly: the bytes go
  /// from the picker straight through AES-GCM into the destination file.
  Future<String?> pickAndStore() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: false,
    );
    final srcPath = result?.files.single.path;
    if (srcPath == null) return null;
    return storeBytes(await File(srcPath).readAsBytes());
  }

  /// Encrypts [plain] into the sandbox and returns its relative path.
  ///
  /// Split out from [pickAndStore] so the storage half can be tested without a
  /// file-picker platform channel — the encryption is the part worth pinning,
  /// and a test that reimplemented it would pass while the real path rotted.
  Future<String> storeBytes(Uint8List plain) async {
    final sealed = await _seal(plain);
    final destName = '${uuid.v4()}$_ext';
    final dir = await _dir();
    await File(p.join(dir.path, destName)).writeAsBytes(sealed, flush: true);
    return p.join(dirName, destName);
  }

  /// Decrypts a stored attachment. Returns null if the file is gone (a receipt
  /// the user deleted out from under us is a missing image, not an error).
  ///
  /// Throws [BackupError] if the file exists but fails authentication — that
  /// means tampering or a key mismatch, and silently showing nothing would hide
  /// something the user should know about.
  Future<Uint8List?> readBytes(String? relative) async {
    if (relative == null) return null;
    final file = File(await absolutePath(relative));
    if (!await file.exists()) return null;

    final bytes = await file.readAsBytes();
    if (bytes.length < _ivLen + _tagLen) {
      throw const BackupError('This receipt file is damaged.');
    }
    try {
      final clear = await _algo.decrypt(
        SecretBox(
          bytes.sublist(_ivLen, bytes.length - _tagLen),
          nonce: bytes.sublist(0, _ivLen),
          mac: Mac(bytes.sublist(bytes.length - _tagLen)),
        ),
        secretKey: SecretKey(key),
      );
      return Uint8List.fromList(clear);
    } on SecretBoxAuthenticationError {
      throw const BackupError('This receipt could not be decrypted.');
    }
  }

  /// Resolves a stored relative path to an absolute on-disk path.
  Future<String> absolutePath(String relative) async {
    final base = await getApplicationDocumentsDirectory();
    return p.join(base.path, relative);
  }

  Future<void> delete(String? relative) async {
    if (relative == null) return;
    final file = File(await absolutePath(relative));
    if (await file.exists()) await file.delete();
  }

  /// Removes every stored receipt. Called by "Erase all data", which for a long
  /// time cleared the database and left this directory untouched — so the
  /// images outlived the transactions that referenced them, with nothing left
  /// in the app that could ever show or delete them again.
  Future<void> purgeAll() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, dirName));
    if (await dir.exists()) await dir.delete(recursive: true);
  }

  Future<Uint8List> _seal(Uint8List plain) async {
    final iv = _randomBytes(_ivLen);
    final box = await _algo.encrypt(plain, secretKey: SecretKey(key), nonce: iv);
    final out = BytesBuilder()
      ..add(iv)
      ..add(box.cipherText)
      ..add(box.mac.bytes);
    return out.toBytes();
  }

  static Uint8List _randomBytes(int n) {
    final r = Random.secure();
    return Uint8List.fromList(List.generate(n, (_) => r.nextInt(256)));
  }
}
