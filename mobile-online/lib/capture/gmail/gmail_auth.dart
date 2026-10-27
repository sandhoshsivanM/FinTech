// Google sign-in for Gmail, read-only. Scope: gmail.readonly, the narrowest
// scope that returns a message body (gmail.metadata cannot). The app is in
// Google's Testing mode (up to 100 listed test users, no CASA assessment), so
// Google expires the refresh token after 7 days: the reader reports
// [GmailAuthException] and the user taps Reconnect.
import 'dart:convert';

import 'package:flutter_appauth/flutter_appauth.dart';

import '../capture_config.dart';
import '../secret_store.dart';

const gmailReadonlyScope = 'https://www.googleapis.com/auth/gmail.readonly';

class GmailAuthException implements Exception {
  GmailAuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

abstract class GmailAuth {
  Future<bool> isConnected();

  /// Interactive consent. Throws [GmailAuthException] when cancelled or refused.
  Future<void> connect();

  /// A valid access token, refreshing if needed. Throws [GmailAuthException]
  /// when the user has to connect again.
  Future<String> accessToken({bool forceRefresh = false});

  /// Forgets the tokens on this device. Does not revoke at Google.
  Future<void> disconnect();
}

class AppAuthGmailAuth implements GmailAuth {
  AppAuthGmailAuth({FlutterAppAuth? appAuth, SecretStore? store, String? clientId, DateTime Function()? clock})
      : _appAuth = appAuth ?? const FlutterAppAuth(),
        _store = store ?? KeychainSecretStore(),
        _clientId = clientId ?? googleClientId,
        _clock = clock ?? DateTime.now;

  final FlutterAppAuth _appAuth;
  final SecretStore _store;
  final String _clientId;
  final DateTime Function() _clock;

  static const _tokensKey = 'khazana_online.gmail_tokens';
  static const _config = AuthorizationServiceConfiguration(
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  );

  String get _redirect => '${googleRedirectScheme(_clientId)}:/oauth2redirect';

  @override
  Future<bool> isConnected() async => (await _readTokens())?['refresh'] != null;

  @override
  Future<void> connect() async {
    if (_clientId.isEmpty) throw GmailAuthException('Gmail is not configured in this build.');
    try {
      final r = await _appAuth.authorizeAndExchangeCode(AuthorizationTokenRequest(
        _clientId,
        _redirect,
        serviceConfiguration: _config,
        scopes: const [gmailReadonlyScope],
        // Ask for a refresh token; "consent" makes Google re-issue it.
        additionalParameters: const {'access_type': 'offline', 'prompt': 'consent'},
      ));
      if (r.refreshToken == null || r.accessToken == null) {
        throw GmailAuthException('Google did not return a token. Try again.');
      }
      await _writeTokens(r.accessToken!, r.refreshToken!, r.accessTokenExpirationDateTime);
    } on GmailAuthException {
      rethrow;
    } catch (_) {
      throw GmailAuthException('Gmail connection was cancelled or failed.');
    }
  }

  @override
  Future<String> accessToken({bool forceRefresh = false}) async {
    final t = await _readTokens();
    final refresh = t?['refresh'] as String?;
    if (refresh == null) throw GmailAuthException('Connect Gmail first.');
    final expiry = DateTime.tryParse('${t?['expiry']}');
    final access = t?['access'] as String?;
    if (!forceRefresh && access != null && expiry != null && expiry.isAfter(_clock().add(const Duration(minutes: 1)))) {
      return access;
    }
    try {
      final r = await _appAuth.token(TokenRequest(
        _clientId,
        _redirect,
        serviceConfiguration: _config,
        refreshToken: refresh,
        scopes: const [gmailReadonlyScope],
      ));
      if (r.accessToken == null) throw GmailAuthException('Reconnect Gmail.');
      await _writeTokens(r.accessToken!, r.refreshToken ?? refresh, r.accessTokenExpirationDateTime);
      return r.accessToken!;
    } on GmailAuthException {
      rethrow;
    } catch (_) {
      // invalid_grant: revoked, or the 7-day Testing-mode expiry.
      await disconnect();
      throw GmailAuthException('Gmail access expired. Reconnect Gmail.');
    }
  }

  @override
  Future<void> disconnect() => _store.delete(_tokensKey);

  Future<Map<String, dynamic>?> _readTokens() async {
    final raw = await _store.read(_tokensKey);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeTokens(String access, String refresh, DateTime? expiry) => _store.write(
        _tokensKey,
        jsonEncode({
          'access': access,
          'refresh': refresh,
          'expiry': (expiry ?? _clock().add(const Duration(minutes: 30))).toUtc().toIso8601String(),
        }),
      );
}
