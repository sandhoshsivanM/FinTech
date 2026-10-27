import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/capture/shortcut_entry.dart';

void main() {
  final swift = File('ios/Runner/CaptureIntent.swift').readAsStringSync();

  test('Swift intent and Dart entry agree on channel, entrypoint and library', () {
    expect(swift, contains('"$shortcutChannelName"'));
    expect(swift, contains('"captureIntentMain"'));
    expect(swift, contains('package:khazana_online/capture/shortcut_entry.dart'));
  });

  test('the intent is registered in the Xcode project and never logs the message', () {
    expect(File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync(), contains('CaptureIntent.swift in Sources'));
    expect(RegExp(r'\b(print|NSLog|os_log|Logger)\(').hasMatch(swift), isFalse);
  });

  test('no Google client id is committed in native config', () {
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    expect(plist, contains(r'$(KHAZANA_GOOGLE_REVERSED_CLIENT_ID)'));
    expect(RegExp(r'apps\.googleusercontent').hasMatch(plist), isFalse);
  });
}
