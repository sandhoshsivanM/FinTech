import 'dart:io' show Platform;

import 'package:flutter/material.dart';

import '../capture_config.dart';
import '../capture_draft.dart';
import '../capture_ingestor.dart';
import '../capture_services.dart';
import '../gmail/gmail_auth.dart';
import 'review_inbox_screen.dart';

/// Entry point for smart capture: the review inbox plus the ways to add to it.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key, CaptureServices? services}) : _services = services;
  final CaptureServices? _services;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  late final CaptureServices _s = widget._services ?? CaptureServices.instance;
  String? _note;
  bool _busy = false;
  bool _gmailOn = false;

  @override
  void initState() {
    super.initState();
    _s.gmailAuth.isConnected().then((v) {
      if (mounted) setState(() => _gmailOn = v);
    }).catchError((_) {});
  }

  Future<void> _run(Future<String> Function() job) async {
    setState(() {
      _busy = true;
      _note = null;
    });
    String note;
    try {
      note = await job();
    } on GmailAuthException catch (e) {
      note = e.message;
    } catch (_) {
      note = 'That did not work. Try again.';
    }
    if (mounted) {
      setState(() {
        _busy = false;
        _note = note;
      });
    }
  }

  String _ocrNote(IngestOutcome? o) => switch (o) {
        null => 'No image chosen.',
        IngestOutcome.added => 'Added to your review inbox.',
        IngestOutcome.duplicate => 'Already captured.',
        IngestOutcome.ignored => 'No payment found in that image.',
      };

  Future<void> _connectGmail() => _run(() async {
        await _s.gmailAuth.connect();
        if (mounted) setState(() => _gmailOn = true);
        return 'Gmail connected. Scan to look for bank alerts.';
      });

  Future<void> _scanGmail() => _run(() async {
        final r = await _s.gmail.scan();
        return 'Checked ${r.scanned} emails: ${r.added} new, ${r.duplicates} already captured.';
      });

  Future<void> _disconnectGmail() => _run(() async {
        await _s.gmailAuth.disconnect();
        if (mounted) setState(() => _gmailOn = false);
        return 'Gmail disconnected from this device.';
      });

  void _openInbox() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReviewInboxScreen(sink: _s.sink)));

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Smart capture')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Everything is read on this phone. Only the amount, date and merchant are kept, and nothing is added to your books until you approve it.',
            style: TextStyle(color: muted)),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            key: const Key('open-inbox'),
            leading: const Icon(Icons.inbox_outlined),
            title: const Text('Review inbox'),
            subtitle: const Text('Approve, edit or reject captured transactions'),
            onTap: _openInbox,
          ),
        ),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.document_scanner_outlined),
              title: const Text('Screenshot or receipt'),
              subtitle: const Text('Read a payment screenshot or a bill on this phone'),
            ),
            OverflowBar(children: [
              TextButton(
                  key: const Key('ocr-gallery'),
                  onPressed: _busy ? null : () => _run(() async => _ocrNote(await _s.ocr.captureFromPicker(camera: false))),
                  child: const Text('Choose photo')),
              TextButton(
                  key: const Key('ocr-camera'),
                  onPressed: _busy ? null : () => _run(() async => _ocrNote(await _s.ocr.captureFromPicker(camera: true))),
                  child: const Text('Take photo')),
            ]),
          ]),
        ),
        Card(
          child: Column(children: [
            const ListTile(
              leading: Icon(Icons.mail_outline),
              title: Text('Gmail bank alerts'),
              subtitle: Text('Read-only. Only mail from bank senders is read, and no email is stored.'),
            ),
            if (!gmailConfigured)
              const Padding(padding: EdgeInsets.all(12), child: Text('Gmail is not set up in this build.'))
            else
              OverflowBar(children: [
                if (!_gmailOn)
                  TextButton(key: const Key('gmail-connect'), onPressed: _busy ? null : _connectGmail, child: const Text('Connect Gmail'))
                else ...[
                  TextButton(key: const Key('gmail-scan'), onPressed: _busy ? null : _scanGmail, child: const Text('Scan now')),
                  TextButton(onPressed: _busy ? null : _disconnectGmail, child: const Text('Disconnect')),
                ],
              ]),
          ]),
        ),
        if (Platform.isIOS)
          const Card(
            child: ListTile(
              leading: Icon(Icons.sms_outlined),
              title: Text('Bank SMS on iPhone'),
              subtitle: Text('Open Shortcuts, create a Personal Automation for Message, and run "Add bank SMS to Khazana". Steps are in the app guide.'),
              isThreeLine: true,
            ),
          ),
        if (_busy) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
        if (_note != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_note!, key: const Key('capture-note'))),
      ]),
    );
  }
}

/// Used by tests and the drafts badge.
Future<int> pendingCount(CaptureServices s) async =>
    (await s.sink.all()).where((d) => d.status == DraftStatus.pending).length;
