import 'package:flutter/material.dart';

import '../core/config.dart' as config;
import '../core/gateway_client.dart';
import 'home_screen.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.gateway, this.showDevSignIn = config.devSignIn});
  final GatewayClient gateway;
  final bool showDevSignIn;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _subject = TextEditingController(text: 'dev:me');
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _subject.dispose();
    super.dispose();
  }

  Future<void> _signInDev() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.gateway.signIn('dev', _subject.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(gateway: widget.gateway)));
    } on ApiException catch (e) {
      setState(() => _error = 'Sign-in refused (${e.status}${e.code == null ? '' : ' ${e.code}'}).');
    } catch (_) {
      setState(() => _error = 'The server could not be reached.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
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
            const FilledButton.tonal(onPressed: null, child: Text('Continue with Google (coming soon)')),
            const SizedBox(height: 8),
            const FilledButton.tonal(onPressed: null, child: Text('Sign in with a passkey (coming soon)')),
            if (widget.showDevSignIn) ...[
              const SizedBox(height: 24),
              Text('Development sign-in', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              TextField(controller: _subject, decoration: const InputDecoration(border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _busy ? null : _signInDev,
                child: Text(_busy ? 'Signing in…' : 'Sign in'),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
