import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../app_services.dart';
import '../crypto/phrase.dart';
import '../crypto/sealed_box.dart' show KeyError;
import 'home_screen.dart';

/// A new device on an account that already has a key: get it by pairing with a
/// device that has it (show a QR code to scan there) or with the recovery phrase.
class LinkScreen extends StatefulWidget {
  const LinkScreen({super.key, required this.services});
  final AppServices services;

  @override
  State<LinkScreen> createState() => _LinkScreenState();
}

class _LinkScreenState extends State<LinkScreen> {
  String? _qr;
  DateTime? _expires;
  bool _cancelled = false;
  final _phrase = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _cancelled = true;
    _phrase.dispose();
    super.dispose();
  }

  void _home() => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(services: widget.services)));

  Future<void> _pair() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final start = await widget.services.keys.startPairing();
      if (!mounted) return;
      setState(() {
        _qr = start.link.text;
        _expires = start.expiresAt;
      });
      final approved = await widget.services.keys.waitForApproval(start.expiresAt, cancelled: () => _cancelled);
      if (!mounted) return;
      if (approved) return _home();
      setState(() {
        _qr = null;
        _error = 'The code expired before it was approved. Start again.';
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Pairing didn’t complete. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _recover() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.services.keys.recover(_phrase.text);
      if (mounted) _home();
    } on PhraseError catch (e) {
      setState(() => _error = e.message);
    } on KeyError catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Couldn’t reach the server. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Get your data on this device')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Your data is end-to-end encrypted, so this device needs your data key. Pair it from a device you already use, or enter your 24-word recovery phrase.',
              style: TextStyle(color: muted)),
          const SizedBox(height: 16),
          if (_qr == null) FilledButton(key: const Key('pair'), onPressed: _busy ? null : _pair, child: const Text('Pair with another device')),
          if (_qr != null) ...[
            Center(child: QrImageView(key: const Key('pair-qr'), data: _qr!, size: 240, backgroundColor: Colors.white)),
            const SizedBox(height: 8),
            Text('On a device that’s already signed in, open Khazana Online, choose “Approve a new device” and scan this code. It expires at ${_expires!.toLocal().toIso8601String().substring(11, 16)}.',
                style: TextStyle(color: muted)),
            const SizedBox(height: 8),
            const Center(child: CircularProgressIndicator()),
          ],
          const Divider(height: 40),
          Text('Recovery phrase', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            key: const Key('phrase'),
            controller: _phrase,
            minLines: 3,
            maxLines: 5,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'word1 word2 word3 …'),
          ),
          const SizedBox(height: 8),
          FilledButton.tonal(key: const Key('recover'), onPressed: _busy ? null : _recover, child: const Text('Unlock with recovery phrase')),
          if (_error != null)
            Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, key: const Key('link-error'), style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ],
      ),
    );
  }
}
