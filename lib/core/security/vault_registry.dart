import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// A known vault (id + display name).
class VaultInfo {
  const VaultInfo({required this.id, required this.name});
  final String id;
  final String name;

  Map<String, dynamic> toJson() => {'id': id, 'name': name};
  factory VaultInfo.fromJson(Map<String, dynamic> j) =>
      VaultInfo(id: j['id'] as String, name: j['name'] as String);
}

/// Tracks the set of vaults for the vault switcher (PRD §14).
///
/// Holds only ids and display names — no keys, no salts, nothing secret. It
/// used to live in the OS keychain anyway, which was both unnecessary and
/// actively harmful: `register()` runs at the end of vault creation, so
/// creating a vault triggered a keychain access prompt right after the user
/// entered their PIN, and the app sat on a spinner behind that dialog waiting
/// for an answer.
///
/// A list of vault names is not a secret. It lives in preferences, alongside
/// the salt and verifier, so the whole PIN flow can complete without the
/// keychain being involved at all.
class VaultRegistry {
  VaultRegistry({SharedPreferences? prefs}) : _injected = prefs;

  final SharedPreferences? _injected;
  static const _key = 'vault_registry';

  Future<SharedPreferences> get _prefs async =>
      _injected ?? await SharedPreferences.getInstance();

  Future<List<VaultInfo>> list() async {
    final raw = (await _prefs).getString(_key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => VaultInfo.fromJson(e as Map<String, dynamic>))
          .toList();
    } on Object {
      // A corrupt registry must not make the app unopenable. The vaults
      // themselves are unaffected: this list is only the switcher's menu.
      return const [];
    }
  }

  Future<void> register(VaultInfo vault) async {
    final current = await list();
    if (current.any((v) => v.id == vault.id)) return;
    await _write([...current, vault]);
  }

  Future<void> remove(String id) async {
    await _write((await list()).where((v) => v.id != id).toList());
  }

  Future<void> _write(List<VaultInfo> vaults) async {
    await (await _prefs)
        .setString(_key, jsonEncode(vaults.map((v) => v.toJson()).toList()));
  }
}
