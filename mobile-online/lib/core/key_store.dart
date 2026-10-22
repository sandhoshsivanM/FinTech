// Khazana Online's own secure storage: the device key and the refresh token.
// Separate keys from the offline app's (`khazana_online.*`), in a separate app
// with its own sandbox (ADR 0007). The access token stays in memory.
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class Session {
  const Session({required this.refreshToken, required this.userId, required this.deviceId});
  final String refreshToken;
  final String userId;
  final String deviceId;
}

abstract class KeyStore {
  Future<String?> readKey();
  Future<void> writeKey(String exported);
  Future<Session?> readSession();
  Future<void> writeSession(Session session);
  Future<void> clearSession();
}

class SecureKeyStore implements KeyStore {
  SecureKeyStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;

  static const _key = 'khazana_online.device_key';
  static const _refresh = 'khazana_online.refresh_token';
  static const _user = 'khazana_online.user_id';
  static const _device = 'khazana_online.device_id';

  @override
  Future<String?> readKey() => _s.read(key: _key);
  @override
  Future<void> writeKey(String exported) => _s.write(key: _key, value: exported);

  @override
  Future<Session?> readSession() async {
    final refresh = await _s.read(key: _refresh);
    final user = await _s.read(key: _user);
    final device = await _s.read(key: _device);
    if (refresh == null || user == null || device == null) return null;
    return Session(refreshToken: refresh, userId: user, deviceId: device);
  }

  @override
  Future<void> writeSession(Session session) async {
    await _s.write(key: _refresh, value: session.refreshToken);
    await _s.write(key: _user, value: session.userId);
    await _s.write(key: _device, value: session.deviceId);
  }

  @override
  Future<void> clearSession() async {
    await _s.delete(key: _refresh);
    await _s.delete(key: _user);
    await _s.delete(key: _device);
  }
}

/// For tests.
class MemoryKeyStore implements KeyStore {
  String? key;
  Session? session;
  @override
  Future<String?> readKey() async => key;
  @override
  Future<void> writeKey(String exported) async => key = exported;
  @override
  Future<Session?> readSession() async => session;
  @override
  Future<void> writeSession(Session s) async => session = s;
  @override
  Future<void> clearSession() async => session = null;
}
