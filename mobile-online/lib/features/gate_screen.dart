import 'package:flutter/material.dart';

import '../app_services.dart';
import '../core/gateway_client.dart';
import 'home_screen.dart';
import 'link_screen.dart';
import 'recovery_phrase_screen.dart';
import 'sign_in_screen.dart';

/// Decides what this device needs after signing in: nothing (home), a new
/// account key (first device), or a link to the key the account already has
/// (pair or recovery phrase).
class GateScreen extends StatefulWidget {
  const GateScreen({super.key, required this.services});
  final AppServices services;

  @override
  State<GateScreen> createState() => _GateScreenState();
}

class _GateScreenState extends State<GateScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    _decide();
  }

  Future<void> _decide() async {
    try {
      final s = widget.services;
      final readiness = await s.ensureReady();
      if (!mounted) return;
      final Widget next;
      if (readiness == Readiness.signedOut) {
        next = SignInScreen(services: s);
      } else if (readiness == Readiness.ready) {
        next = HomeScreen(services: s);
      } else {
        next = (await s.keys.status()).accountHasKeys ? LinkScreen(services: s) : RecoveryPhraseScreen(services: s);
      }
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => next));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = 'The server refused the request (${e.status}).');
    } catch (_) {
      if (mounted) setState(() => _error = 'The server could not be reached.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: _error == null
            ? const Column(mainAxisSize: MainAxisSize.min, children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Registering this device and checking for your data key…'),
              ])
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!, key: const Key('gate-error'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () {
                      setState(() => _error = null);
                      _decide();
                    },
                    child: const Text('Try again'),
                  ),
                ]),
              ),
      ),
    );
  }
}
