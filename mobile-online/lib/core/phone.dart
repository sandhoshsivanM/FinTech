// Mobile-number sign-in: the checks and wording the sign-in screen uses.
// Mirrors webapp-online/src/lib/phoneSignIn.ts.
import 'gateway_client.dart';

/// The 10 national digits of an Indian mobile typed any usual way.
String nationalNumber(String input) {
  final digits = input.replaceAll(RegExp(r'\D'), '');
  return digits.replaceFirst(RegExp(r'^(91|0)(?=\d{10}$)'), '');
}

/// Indian mobiles are 10 digits starting 6 to 9. The server checks again.
bool isValidIndianMobile(String digits) => RegExp(r'^[6-9]\d{9}$').hasMatch(digits);

String toE164(String digits) => '+91$digits';

bool isCode(String code) => RegExp(r'^\d{6}$').hasMatch(code);

/// Plain words for what the server can answer to "send a code" or "check this code".
String? phoneProblem(ApiException e) {
  switch (e.code) {
    case 'invalid_phone':
      return 'Enter a valid 10-digit Indian mobile number.';
    case 'too_many_requests':
      final wait = e.retryAfter;
      if (wait != null && wait <= 60) return 'Please wait $wait seconds before asking for another code.';
      if (wait == null) return 'Too many codes were asked for. Try again in a while.';
      final minutes = (wait / 60).ceil();
      return 'Too many codes were asked for. Try again in $minutes minute${minutes == 1 ? '' : 's'}.';
    case 'invalid_grant':
      return 'That code isn’t right, or it has expired. Check it, or ask for a new code.';
    case 'temporarily_unavailable':
      return 'The code could not be sent right now. Try again in a moment.';
    case 'unsupported_provider':
      return 'Signing in with a mobile number isn’t available here. Use a passkey or Google instead.';
    case 'account_deletion_pending':
      return 'This account is being deleted. Sign in again within 24 hours of asking to cancel the deletion.';
  }
  return null;
}
