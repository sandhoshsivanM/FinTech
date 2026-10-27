import 'package:khazana_online/capture/capture_ingestor.dart';
import 'package:khazana_online/capture/capture_sink.dart';
import 'package:khazana_online/capture/gmail/gmail_auth.dart';

const hdfcDebit =
    'Rs.1,250.00 debited from a/c XX1234 on 25-10-26 to VPA swiggy@icici (UPI Ref No 429876543210). Avl Bal Rs.8,000.00 - HDFC Bank';
const otpSms = 'Your OTP for HDFC Bank txn of Rs.500 is 482913. Do not share.';

final fixedNow = DateTime.utc(2026, 10, 27, 9);

CaptureIngestor newIngestor([CaptureSink? sink]) =>
    CaptureIngestor(sink: sink ?? InMemoryCaptureSink(), clock: () => fixedNow);

class FakeGmailAuth implements GmailAuth {
  int refreshes = 0;
  bool connected = true;
  @override
  Future<bool> isConnected() async => connected;
  @override
  Future<void> connect() async => connected = true;
  @override
  Future<String> accessToken({bool forceRefresh = false}) async {
    if (forceRefresh) refreshes++;
    return forceRefresh ? 'fresh' : 'stale';
  }

  @override
  Future<void> disconnect() async => connected = false;
}
