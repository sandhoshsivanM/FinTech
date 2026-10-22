// Khazana Online is a separate app from the offline Khazana (ADR 0007): it
// never imports the offline app, never depends on it, and never opens its
// storage. Shared code comes only through packages/.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('nothing in lib/ imports the offline app or touches its storage', () {
    final offline = [
      RegExp(r'''import\s+['"]package:khazana/'''),
      RegExp(r'''['"]\.\./\.\./lib/'''),
      RegExp(r'khazana\.db|fintech_os|kVault'),
    ];
    final hits = [
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>())
        if (f.path.endsWith('.dart'))
          for (final re in offline)
            if (re.hasMatch(f.readAsStringSync())) '${f.path}: ${re.pattern}',
    ];
    expect(hits, isEmpty);
  });

  test('pubspec depends on the shared package, never on the offline app', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('path: ../packages/khazana_domain'));
    expect(RegExp(r'^\s+khazana:', multiLine: true).hasMatch(pubspec), isFalse);
    expect(RegExp(r'path:\s*\.\.\s*$', multiLine: true).hasMatch(pubspec), isFalse);
  });

  test('the app is com.khazana.online on every platform', () {
    expect(File('android/app/build.gradle.kts').readAsStringSync(), contains('applicationId = "com.khazana.online"'));
    expect(File('macos/Runner/Configs/AppInfo.xcconfig').readAsStringSync(),
        contains('PRODUCT_BUNDLE_IDENTIFIER = com.khazana.online'));
    final ios = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
    expect(ios, contains('PRODUCT_BUNDLE_IDENTIFIER = com.khazana.online;'));
    expect(ios, isNot(contains('com.khazana.app')));
  });

  test('release builds allow no plain http', () {
    expect(File('android/app/src/main/AndroidManifest.xml').readAsStringSync(), isNot(contains('usesCleartextTraffic')));
    expect(Directory('android/app/src/main/res/xml').existsSync(), isFalse);
  });
}
