import 'package:flutter_test/flutter_test.dart';
import 'package:khazana_online/core/gateway_client.dart';
import 'package:khazana_online/core/phone.dart';

void main() {
  test('numbers typed any usual way become the 10 national digits', () {
    for (final input in ['98765 43210', '+91 98765-43210', '919876543210', '09876543210', '(98765) 43210']) {
      expect(nationalNumber(input), '9876543210', reason: input);
    }
  });

  test('only 10 digits starting 6 to 9 are Indian mobiles', () {
    expect(isValidIndianMobile('9876543210'), isTrue);
    expect(isValidIndianMobile('5876543210'), isFalse);
    expect(isValidIndianMobile('987654321'), isFalse);
    expect(isValidIndianMobile('98765432101'), isFalse);
    expect(toE164('9876543210'), '+919876543210');
  });

  test('a code is exactly six digits', () {
    expect(isCode('123456'), isTrue);
    expect(isCode('12345'), isFalse);
    expect(isCode('12345a'), isFalse);
  });

  test('server answers become plain words, rate limits say how long', () {
    expect(phoneProblem(ApiException(400, 'invalid_phone')), contains('valid 10-digit'));
    expect(phoneProblem(ApiException(400, 'invalid_grant')), contains('isn’t right, or it has expired'));
    expect(phoneProblem(ApiException(503, 'temporarily_unavailable')), contains('could not be sent'));
    expect(phoneProblem(ApiException(429, 'too_many_requests', 20)), contains('20 seconds'));
    expect(phoneProblem(ApiException(429, 'too_many_requests', 600)), contains('10 minutes'));
    expect(phoneProblem(ApiException(429, 'too_many_requests')), contains('a while'));
    expect(phoneProblem(ApiException(500, 'boom')), isNull);
  });
}
