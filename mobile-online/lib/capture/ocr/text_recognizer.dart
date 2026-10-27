// On-device OCR. ML Kit runs entirely on the phone: the image is never
// uploaded, and the recognized text is handed straight to the parser.
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

abstract class OcrEngine {
  /// All text found in the image at [path], lines joined with newlines.
  Future<String> recognize(String path);
}

class MlKitOcrEngine implements OcrEngine {
  @override
  Future<String> recognize(String path) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final result = await recognizer.processImage(InputImage.fromFilePath(path));
      return result.text;
    } finally {
      await recognizer.close();
    }
  }
}
