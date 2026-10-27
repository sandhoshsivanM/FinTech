// Where cards are kept. Cards are user data, so the real implementation is
// the encrypted sync record layer (a `cards` collection, as in webapp-online).
// mobile-online has no record/sync store on trunk yet, so for now cards live
// in this device's secure storage (Keychain / Android Keystore), which is
// encrypted at rest and never leaves the device. When feat/mobile-online-sync
// lands, add a CardStore backed by the sync engine; the screen does not change.
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'card_maths.dart';

abstract class CardStore {
  Future<List<CreditCard>> all();
  Future<void> save(CreditCard card);
  Future<void> delete(String id);
}

/// Transactions to match cards against. Empty until the sync-backed ledger exists.
typedef TxnSource = Future<List<CardTxn>> Function();
Future<List<CardTxn>> noTxns() async => const [];

class SecureCardStore implements CardStore {
  SecureCardStore([FlutterSecureStorage? storage])
    : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _key = 'khazana_online.cards';

  Future<void> _write(List<CreditCard> cards) => _s.write(
    key: _key,
    value: jsonEncode([for (final c in cards) c.toJson()]),
  );

  @override
  Future<List<CreditCard>> all() async {
    final raw = await _s.read(key: _key);
    if (raw == null) return [];
    return [
      for (final j in jsonDecode(raw) as List)
        CreditCard.fromJson(j as Map<String, dynamic>),
    ];
  }

  @override
  Future<void> save(CreditCard card) async {
    final cards = await all();
    final i = cards.indexWhere((c) => c.id == card.id);
    i < 0 ? cards.add(card) : cards[i] = card;
    await _write(cards);
  }

  @override
  Future<void> delete(String id) async =>
      _write((await all()).where((c) => c.id != id).toList());
}

/// For tests.
class MemoryCardStore implements CardStore {
  final Map<String, CreditCard> cards = {};
  @override
  Future<List<CreditCard>> all() async => cards.values.toList();
  @override
  Future<void> save(CreditCard card) async => cards[card.id] = card;
  @override
  Future<void> delete(String id) async => cards.remove(id);
}
