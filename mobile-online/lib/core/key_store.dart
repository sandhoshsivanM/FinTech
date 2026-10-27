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

  /// This device's X25519 seed (the sealed-box key pair, ADR 0005). Never leaves the keystore.
  Future<String?> readBoxSeed();
  Future<void> writeBoxSeed(String seedBase64);

  /// The data key sealed to this device's X25519 key (base64). Useless without that key.
  Future<String?> readEnvelope();
  Future<void> writeEnvelope(String sealedBase64);

  /// Forgets the encryption keys on this device (sign-out).
  Future<void> clearEncryptionKeys();
}

class SecureKeyStore implements KeyStore {
  SecureKeyStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;

  static const _key = 'khazana_online.device_key';
  static const _refresh = 'khazana_online.refresh_token';
  static const _user = 'khazana_online.user_id';
  static const _device = 'khazana_online.device_id';
  static const _box = 'khazana_online.box_seed';
  static const _envelope = 'khazana_online.envelope';

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

  @override
  Future<String?> readBoxSeed() => _s.read(key: _box);
  @override
  Future<void> writeBoxSeed(String seedBase64) => _s.write(key: _box, value: seedBase64);
  @override
  Future<String?> readEnvelope() => _s.read(key: _envelope);
  @override
  Future<void> writeEnvelope(String sealedBase64) => _s.write(key: _envelope, value: sealedBase64);
  @override
  Future<void> clearEncryptionKeys() async {
    await _s.delete(key: _box);
    await _s.delete(key: _envelope);
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

  String? boxSeed;
  String? envelope;
  @override
  Future<String?> readBoxSeed() async => boxSeed;
  @override
  Future<void> writeBoxSeed(String seedBase64) async => boxSeed = seedBase64;
  @override
  Future<String?> readEnvelope() async => envelope;
  @override
  Future<void> writeEnvelope(String sealedBase64) async => envelope = sealedBase64;
  @override
  Future<void> clearEncryptionKeys() async {
    boxSeed = null;
    envelope = null;
  }
}
