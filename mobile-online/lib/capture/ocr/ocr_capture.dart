// Receipt / screenshot -> OCR -> shared parser -> review draft.
import 'dart:io';

import 'package:image_picker/image_picker.dart';

import '../capture_draft.dart';
import '../capture_ingestor.dart';
import 'text_recognizer.dart';

/// Picks an image: from the photo library (screenshots live there) or camera.
abstract class ImageSourcePort {
  Future<String?> pick({required bool camera});
}

class PickerImageSource implements ImageSourcePort {
  PickerImageSource([ImagePicker? p]) : _p = p ?? ImagePicker();
  final ImagePicker _p;

  @override
  Future<String?> pick({required bool camera}) async {
    final f = await _p.pickImage(source: camera ? ImageSource.camera : ImageSource.gallery, requestFullMetadata: false);
    return f?.path;
  }
}

class OcrCapture {
  OcrCapture({
    required this.engine,
    required this.ingestor,
    required this.images,
    Future<void> Function(String path)? deleteFile,
  }) : _delete = deleteFile ?? _deleteIfCached;

  final OcrEngine engine;
  final CaptureIngestor ingestor;
  final ImageSourcePort images;
  final Future<void> Function(String path) _delete;

  /// Null when the user cancelled the picker.
  Future<IngestOutcome?> captureFromPicker({required bool camera}) async {
    final path = await images.pick(camera: camera);
    if (path == null) return null;
    return captureFromPath(path);
  }

  Future<IngestOutcome> captureFromPath(String path) async {
    try {
      final text = await engine.recognize(path);
      return await ingestor.ingest(text, DraftSource.ocr);
    } finally {
      // The picker's copy is a temp file; do not leave a receipt image behind.
      await _delete(path);
    }
  }

  static Future<void> _deleteIfCached(String path) async {
    try {
      if (path.startsWith(Directory.systemTemp.path) || path.contains('/Caches/') || path.contains('/cache/')) {
        await File(path).delete();
      }
    } catch (_) {}
  }
}
