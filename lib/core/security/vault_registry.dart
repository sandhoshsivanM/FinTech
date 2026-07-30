import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'secure_storage.dart';

/// A known vault (id + display name).
class VaultInfo {
  const VaultInfo({required this.id, required this.name});
  final String id;
  final String name;

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
  factory VaultInfo.fromJson(Map<String, dynamic> j) =>
      VaultInfo(id: j['id'] as String, name: j['name'] as String);
}

/// Tracks the set of vaults for the vault switcher (PRD §14). Stored in the OS
/// keychain alongside per-vault secrets. Holds only ids/names — no keys.
class VaultRegistry {
  VaultRegistry([FlutterSecureStorage? storage])
      : _storage = storage ??
            appSecureStorage;

  final FlutterSecureStorage _storage;
  static const _key = 'vault_registry';

  Future<List<VaultInfo>> list() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    final list = jsonDecode(raw) as List;
    return list
        .map((e) => VaultInfo.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> register(VaultInfo vault) async {
    final current = await list();
    if (current.any((v) => v.id == vault.id)) return;
    final updated = [...current, vault];
    await _storage.write(
      key: _key,
      value: jsonEncode(updated.map((v) => v.toJson()).toList()),
    );
  }

  Future<void> remove(String id) async {
    final updated = (await list()).where((v) => v.id != id).toList();
    await _storage.write(
      key: _key,
      value: jsonEncode(updated.map((v) => v.toJson()).toList()),
    );
  }
}
