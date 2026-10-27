// Wiring for smart capture. Lazily built so importing this costs nothing.
// When the sync engine lands, replace the sink here with the vault-backed one.
import 'package:http/http.dart' as http;

import 'capture_ingestor.dart';
import 'capture_sink.dart';
import 'gmail/gmail_auth.dart';
import 'gmail/gmail_reader.dart';
import 'ocr/ocr_capture.dart';
import 'ocr/text_recognizer.dart';
import 'secret_store.dart';

class CaptureServices {
  CaptureServices({CaptureSink? sink, GmailAuth? gmailAuth, OcrEngine? ocrEngine, ImageSourcePort? images, http.Client? client})
      : sink = sink ?? SecureCaptureSink(),
        _gmailAuth = gmailAuth,
        _ocrEngine = ocrEngine,
        _images = images,
        _client = client;

  final CaptureSink sink;
  final GmailAuth? _gmailAuth;
  final OcrEngine? _ocrEngine;
  final ImageSourcePort? _images;
  final http.Client? _client;

  late final CaptureIngestor ingestor = CaptureIngestor(sink: sink);
  late final SecretStore _secrets = KeychainSecretStore();
  late final GmailAuth gmailAuth = _gmailAuth ?? AppAuthGmailAuth(store: _secrets);
  late final GmailReader gmail =
      GmailReader(auth: gmailAuth, ingestor: ingestor, store: _secrets, client: _client);
  late final OcrCapture ocr =
      OcrCapture(engine: _ocrEngine ?? MlKitOcrEngine(), ingestor: ingestor, images: _images ?? PickerImageSource());

  static CaptureServices instance = CaptureServices();
}
