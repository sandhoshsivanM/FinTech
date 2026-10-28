import 'dart:async';

import 'package:flutter/material.dart';

import '../app_services.dart';
import '../core/config.dart' as config;
import '../core/gateway_client.dart';
import '../core/phone.dart';
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
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _codeFocus = FocusNode();
  String? _error;
  String? _busy;

  // After a code was asked for: its challenge, any demo code, and the resend countdown.
  PhoneChallenge? _challenge;
  int _resendIn = 0;
  Timer? _ticker;

  @override
  void dispose() {
    _ticker?.cancel();
    _subject.dispose();
    _phone.dispose();
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  String get _digits => nationalNumber(_phone.text);

  Future<void> _sendCode() async {
    if (!isValidIndianMobile(_digits)) {
      setState(() => _error = 'Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setState(() {
      _busy = 'phone-send';
      _error = null;
    });
    try {
      final c = await widget.services.gateway.startPhoneSignIn(toE164(_digits));
      if (!mounted) return;
      _ticker?.cancel();
      setState(() {
        _challenge = c;
        _code.clear();
        _resendIn = c.resendAfter;
      });
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted && _resendIn > 0) setState(() => _resendIn--);
      });
      WidgetsBinding.instance.addPostFrameCallback((_) => _codeFocus.requestFocus());
    } on ApiException catch (e) {
      setState(() => _error = phoneProblem(e) ?? 'Couldn’t send the code (${e.status}${e.code == null ? '' : ' ${e.code}'}).');
    } catch (_) {
      setState(() => _error = 'The server could not be reached. Check your connection.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _changeNumber() {
    _ticker?.cancel();
    setState(() {
      _challenge = null;
      _error = null;
    });
  }

  Future<void> _verifyCode() async {
    final c = _challenge!;
    if (!isCode(_code.text)) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }
    await _run('phone-verify', () => widget.services.gateway.signInWithPhone(c.challengeId, _code.text), phone: true);
  }

  Future<void> _run(String what, Future<Object?> Function() signIn, {bool phone = false}) async {
    setState(() {
      _busy = what;
      _error = null;
    });
    try {
      await signIn();
      if (!mounted) return;
      // A passkey is offered on the home screen while the server still allows adding one.
      if (phone) widget.services.passkeyOfferUntil = DateTime.now().add(const Duration(minutes: 9));
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => GateScreen(services: widget.services)));
    } on PasskeyCancelled {
      // The user closed the prompt: nothing to report.
    } on ApiException catch (e) {
      setState(() => _error = (phone ? phoneProblem(e) : null) ?? 'Sign-in refused (${e.status}${e.code == null ? '' : ' ${e.code}'}).');
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
            Text('Continue with mobile number', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (_challenge == null) ...[
              TextField(
                key: const Key('phone-field'),
                controller: _phone,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91  ', border: OutlineInputBorder()),
                onSubmitted: (_) => _busy == null ? _sendCode() : null,
              ),
              const SizedBox(height: 8),
              Text(
                'We text you a 6-digit code. Your money data is never opened by a text: that needs your recovery phrase or another device.',
                style: TextStyle(color: muted),
              ),
              const SizedBox(height: 8),
              FilledButton(
                key: const Key('send-code'),
                onPressed: _busy != null ? null : _sendCode,
                child: Text(_busy == 'phone-send' ? 'Sending the code…' : 'Send code'),
              ),
            ] else ...[
              Text('We sent a 6-digit code to +91 $_digits.'),
              if (_challenge!.demoCode != null) ...[
                const SizedBox(height: 8),
                Semantics(
                  container: true,
                  child: Text('Demo code: ${_challenge!.demoCode}', key: const Key('demo-code'), style: Theme.of(context).textTheme.titleMedium),
                ),
                Text('This demo shows the code here instead of texting it.', style: TextStyle(color: muted)),
              ],
              const SizedBox(height: 8),
              TextField(
                key: const Key('otp-field'),
                controller: _code,
                focusNode: _codeFocus,
                keyboardType: TextInputType.number,
                maxLength: 6,
                autofillHints: const [AutofillHints.oneTimeCode],
                decoration: const InputDecoration(labelText: '6-digit code', border: OutlineInputBorder(), counterText: ''),
                onSubmitted: (_) => _busy == null ? _verifyCode() : null,
              ),
              const SizedBox(height: 8),
              FilledButton(
                key: const Key('otp-sign-in'),
                onPressed: _busy != null ? null : _verifyCode,
                child: Text(_busy == 'phone-verify' ? 'Checking the code…' : 'Sign in'),
              ),
              const SizedBox(height: 8),
              Row(children: [
                TextButton(key: const Key('resend'), onPressed: _busy != null || _resendIn > 0 ? null : _sendCode, child: const Text('Resend code')),
                TextButton(key: const Key('change-number'), onPressed: _busy != null ? null : _changeNumber, child: const Text('Change number')),
              ]),
              if (_resendIn > 0) Text('You can ask for a new code in $_resendIn s.', key: const Key('resend-timer'), style: TextStyle(color: muted)),
            ],
            const SizedBox(height: 24),
            Text('Other ways to sign in', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            FilledButton.tonal(
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
            Text('A passkey is Face ID, your fingerprint or your device PIN. No password, no email, and it can’t be intercepted like a text message.', style: TextStyle(color: muted)),
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
