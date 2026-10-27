import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../app_services.dart';
import '../crypto/sealed_box.dart' show KeyError;
import '../keys/account_keys.dart';

/// On a device that has the data key: scan the QR code a new device shows. The
/// new device's key is checked against the fingerprint in the code (which never
/// reached the server) before anything is sealed to it.
class ApproveScreen extends StatefulWidget {
  const ApproveScreen({super.key, required this.services, this.initialCode});
  final AppServices services;

  /// For tests and manual entry: skips the camera.
  final String? initialCode;

  @override
  State<ApproveScreen> createState() => _ApproveScreenState();
}

class _ApproveScreenState extends State<ApproveScreen> {
  PairingLink? _link;
  PairingTarget? _target;
  bool _done = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initialCode != null) _onCode(widget.initialCode!);
  }

  Future<void> _onCode(String text) async {
    if (_link != null || _busy) return;
    final link = PairingLink.tryParse(text);
    if (link == null) {
      setState(() => _error = 'That isn’t a Khazana pairing code.');
      return;
    }
    setState(() {
      _link = link;
      _busy = true;
      _error = null;
    });
    try {
      final target = await widget.services.keys.inspectPairing(link);
      if (mounted) setState(() => _target = target);
    } on KeyError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Couldn’t look up that device. The code may have expired.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve() async {
    setState(() => _busy = true);
    try {
      await widget.services.keys.approvePairing(_link!, _target!);
      if (mounted) setState(() => _done = true);
    } catch (_) {
      if (mounted) setState(() => _error = 'Couldn’t approve. The code may have expired; start again on the new device.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _target;
    return Scaffold(
      appBar: AppBar(title: const Text('Approve a new device')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: _done
            ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Done. The new device is opening your data now.', key: Key('approved')),
                const SizedBox(height: 12),
                FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back')),
              ])
            : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (t == null && _link == null && widget.initialCode == null)
                  Expanded(child: MobileScanner(onDetect: (c) {
                    final v = c.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
                    if (v != null) _onCode(v);
                  })),
                if (t != null) ...[
                  Text('${t.name} (${t.platform}) is asking for your data key.', key: const Key('target')),
                  const SizedBox(height: 8),
                  const Text('Its key matches the code. Approve only if you just started pairing on that device yourself.'),
                  const SizedBox(height: 12),
                  Row(children: [
                    TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
                    const Spacer(),
                    FilledButton(key: const Key('approve'), onPressed: _busy ? null : _approve, child: Text(_busy ? 'Approving…' : 'Approve')),
                  ]),
                ],
                if (t == null && _link != null && _error == null) const Center(child: CircularProgressIndicator()),
                if (_error != null) Text(_error!, key: const Key('approve-error'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ]),
      ),
    );
  }
}
