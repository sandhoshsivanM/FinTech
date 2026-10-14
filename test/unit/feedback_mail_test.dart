import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/branding.dart';
import 'package:khazana/core/feedback/feedback_mail.dart';

void main() {
  const info = FeedbackDeviceInfo(
    appVersion: '1.0.0',
    channel: 'play',
    platform: 'android',
    osVersion: 'Android 14 (API 34)',
    locale: 'en-IN',
    themeMode: 'dark',
    screenClass: 'compact',
  );

  group('buildFeedbackMailto', () {
    final uri = buildFeedbackMailto(info);

    test('is addressed to the feedback inbox', () {
      expect(uri.scheme, 'mailto');
      expect(uri.path, kFeedbackEmail);
      expect(kFeedbackEmail, 'sandhoshsivan00@gmail.com');
    });

    test('carries the versioned subject', () {
      expect(
        uri.queryParameters['subject'],
        'Khazana feedback — 1.0.0 (android)',
      );
    });

    test('encodes spaces as %20, never +', () {
      expect(uri.toString(), isNot(contains('+')));
      expect(uri.toString(), contains('%20'));
    });

    test('body leaves room for the message, then the device block', () {
      final body = uri.queryParameters['body']!;
      expect(body.startsWith('\n'), isTrue);
      for (final line in [
        'App version: 1.0.0',
        'Build channel: play',
        'OS: android Android 14 (API 34)',
        'Locale: en-IN',
        'Theme: dark',
        'Screen: compact',
      ]) {
        expect(body, contains(line));
      }
    });

    test('carries no financial fields', () {
      final body = uri.queryParameters['body']!.toLowerCase();
      for (final word in [
        'amount',
        'balance',
        'account',
        'vault',
        'pin',
        'net worth',
        '₹',
        'inr',
      ]) {
        expect(body, isNot(contains(word)), reason: word);
      }
      // The only digits are the version and the OS string we passed in.
      final digits = RegExp(r'\d+').allMatches(body).map((m) => m.group(0));
      expect(digits.toSet(), {'1', '0', '14', '34'});
    });

    test('truncates very long OS strings', () {
      final long = FeedbackDeviceInfo(
        appVersion: '1.0.0',
        channel: 'direct',
        platform: 'linux',
        osVersion: 'x' * 300,
        locale: 'en',
        themeMode: 'system',
        screenClass: 'expanded',
      );
      final body = feedbackBody(long);
      expect(body, isNot(contains('x' * (kMaxOsVersionLength + 1))));
      expect(body, contains('…'));
    });
  });

  test('screenSizeClass follows the Material breakpoints', () {
    expect(screenSizeClass(390), 'compact');
    expect(screenSizeClass(700), 'medium');
    expect(screenSizeClass(1280), 'expanded');
  });

  test('problem report text names the feedback address', () {
    expect(problemReportShareText(), contains(kFeedbackEmail));
    expect(problemReportShareText(), contains('no financial data'));
    expect(kProblemReportSubject, contains(kAppVersion));
  });
}
