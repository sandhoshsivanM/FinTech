import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The bundled font (Anek Latin) has no arrow glyphs, and naming a font family
/// removes the platform's automatic fallback — so an arrow in visible text
/// renders as a missing-glyph box. Arrows in user-facing strings must be words
/// or icons. Comments may use them freely.
void main() {
  test('no arrow glyphs in user-facing strings', () {
    final arrows = RegExp('[←-⇿]');
    final quoted = RegExp('\'[^\'\\n]*\'|"[^"\\n]*"');
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final lines = f.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final line = lines[i].trimLeft();
        if (line.startsWith('//')) continue;
        for (final m in quoted.allMatches(lines[i])) {
          if (arrows.hasMatch(m.group(0)!)) offenders.add('${f.path}:${i + 1}');
        }
      }
    }
    expect(offenders, isEmpty);
  });
}
