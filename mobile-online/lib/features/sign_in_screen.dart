import 'package:flutter/material.dart';

import '../app_services.dart';
import '../core/config.dart' as config;
import '../core/gateway_client.dart';
import '../core/passkey.dart';
import 'gate_screen.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({
    super.key,
    required this.services,
    this.showDevSignIn = config.devSignIn,
    this.passkeysAvailable = true,
    this.googleAvailable = true,
  });
  final AppServices services;
  final bool showDevSignIn;
  final bool passkeysAvailable;
  final bool googleAvailable;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _subject = TextEditingController(text: 'dev:me');
  String? _error;
  String? _busy;

  @override
  void dispose() {
    _subject.dispose();
    super.dispose();
  }

  Future<void> _run(String what, Future<Object?> Function() signIn) async {
    setState(() {
      _busy = what;
      _error = null;
    });
    try {
      await signIn();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => GateScreen(services: widget.services)));
    } on PasskeyCancelled {
      // The user closed the prompt: nothing to report.
    } on ApiException catch (e) {
      setState(() => _error = 'Sign-in refused (${e.status}${e.code == null ? '' : ' ${e.code}'}).');
    } catch (e) {
      setState(() => _error = e is StateError ? e.message : 'Sign-in didn’t complete. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final g = widget.services.gateway;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text('Khazana Online', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              'Your money on every device, end-to-end encrypted. Want no account at all? '
              'Use the offline Khazana app instead.',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('passkey-create'),
              onPressed: _busy != null || !widget.passkeysAvailable ? null : () => _run('create', g.signUpWithPasskey),
              child: Text(_busy == 'create' ? 'Waiting for your passkey…' : 'Create account with a passkey'),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              key: const Key('passkey-sign-in'),
              onPressed: _busy != null || !widget.passkeysAvailable ? null : () => _run('sign-in', g.signInWithPasskey),
              child: Text(_busy == 'sign-in' ? 'Waiting for your passkey…' : 'Sign in with a passkey'),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              key: const Key('google'),
              onPressed: _busy != null || !widget.googleAvailable ? null : () => _run('google', g.signInWithGoogle),
              child: Text(_busy == 'google' ? 'Opening Google…' : 'Continue with Google'),
            ),
            const SizedBox(height: 8),
            Text('A passkey is Face ID, your fingerprint or your device PIN. No password, no email.', style: TextStyle(color: muted)),
            if (widget.showDevSignIn) ...[
              const SizedBox(height: 24),
              Text('Development sign-in', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              TextField(controller: _subject, decoration: const InputDecoration(border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _busy != null ? null : () => _run('dev', () => g.signIn('dev', _subject.text)),
                child: Text(_busy == 'dev' ? 'Signing in…' : 'Sign in'),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, key: const Key('sign-in-error'), style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
