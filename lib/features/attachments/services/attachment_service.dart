import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

/// Stores receipt images entirely on-device in the app's sandboxed documents
/// directory (PRD §11 local media, zero-cost, no cloud). The transaction keeps
/// only the *relative* path; the absolute path is resolved on read so the store
/// survives app-container moves.
class AttachmentService {
  const AttachmentService({this.uuid = const Uuid()});
  final Uuid uuid;

  static const String dirName = 'receipts';

  Future<Directory> _dir() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(base.path, dirName));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// Picks an image and copies it into the sandbox. Returns the relative path
  /// (`receipts/<id><ext>`) to store on the transaction, or null if cancelled.
  Future<String?> pickAndStore() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: false,
    );
    final srcPath = result?.files.single.path;
    if (srcPath == null) return null;

    final ext = p.extension(srcPath);
    final destName = '${uuid.v4()}$ext';
    final dir = await _dir();
    await File(srcPath).copy(p.join(dir.path, destName));
    return p.join(dirName, destName);
  }

  /// Resolves a stored relative path to an absolute on-disk path.
  Future<String> absolutePath(String relative) async {
    final base = await getApplicationDocumentsDirectory();
    return p.join(base.path, relative);
  }

  /// Resolves to a [File], or null if the attachment is missing.
  Future<File?> resolve(String? relative) async {
    if (relative == null) return null;
    final file = File(await absolutePath(relative));
    return await file.exists() ? file : null;
  }

  Future<void> delete(String? relative) async {
    if (relative == null) return;
    final file = File(await absolutePath(relative));
    if (await file.exists()) await file.delete();
  }
}
