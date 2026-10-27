import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/capture/capture_draft.dart';
import 'package:khazana_online/capture/capture_ingestor.dart';
import 'package:khazana_online/capture/capture_sink.dart';
import 'package:khazana_online/capture/ocr/ocr_capture.dart';
import 'package:khazana_online/capture/ocr/text_recognizer.dart';
import 'package:khazana_online/capture/shortcut_entry.dart';

import 'helpers.dart';

class FakeOcr implements OcrEngine {
  FakeOcr(this.text, {this.fail = false});
  final String text;
  final bool fail;
  @override
  Future<String> recognize(String path) async {
    if (fail) throw StateError('mlkit failed');
    return text;
  }
}

class FakeImages implements ImageSourcePort {
  FakeImages(this.path);
  final String? path;
  @override
  Future<String?> pick({required bool camera}) async => path;
}

void main() {
  test('OCR text goes through the shared parser into a draft, and the image is deleted', () async {
    final sink = InMemoryCaptureSink();
    final deleted = <String>[];
    final ocr = OcrCapture(
      engine: FakeOcr('Paid to Swiggy\n$hdfcDebit'),
      ingestor: newIngestor(sink),
      images: FakeImages('/tmp/shot.png'),
      deleteFile: (p) async => deleted.add(p),
    );
    expect(await ocr.captureFromPicker(camera: false), IngestOutcome.added);
    expect((await sink.all()).single.source, DraftSource.ocr);
    expect(deleted, ['/tmp/shot.png']);
  });

  test('a cancelled picker does nothing', () async {
    final ocr = OcrCapture(engine: FakeOcr(''), ingestor: newIngestor(), images: FakeImages(null));
    expect(await ocr.captureFromPicker(camera: true), isNull);
  });

  test('an image with no payment is ignored; the image is still deleted when OCR throws', () async {
    final deleted = <String>[];
    final ocr = OcrCapture(
        engine: FakeOcr('Menu: dosa 40'), ingestor: newIngestor(), images: FakeImages('a.png'), deleteFile: (p) async => deleted.add(p));
    expect(await ocr.captureFromPicker(camera: false), IngestOutcome.ignored);

    final failing = OcrCapture(
        engine: FakeOcr('', fail: true), ingestor: newIngestor(), images: FakeImages('b.png'), deleteFile: (p) async => deleted.add(p));
    await expectLater(failing.captureFromPicker(camera: false), throwsStateError);
    expect(deleted, ['a.png', 'b.png']);
  });

  test('shortcut text outcomes', () async {
    final sink = InMemoryCaptureSink();
    final ing = newIngestor(sink);
    expect(await handleShortcutText(hdfcDebit, ing), 'added');
    expect(await handleShortcutText(hdfcDebit, ing), 'duplicate');
    expect(await handleShortcutText(otpSms, ing), 'ignored');
    expect(await handleShortcutText('  ', ing), 'ignored');
    expect(await handleShortcutText(null, ing), 'ignored');
    expect((await sink.all()).single.source, DraftSource.shortcut);
  });

  test('a sink failure is reported as error, not thrown into the intent', () async {
    expect(await handleShortcutText(hdfcDebit, CaptureIngestor(sink: _BrokenSink())), 'error');
  });
}

class _BrokenSink extends InMemoryCaptureSink {
  @override
  Future<bool> add(CaptureDraft draft) => throw StateError('keychain locked');
}
