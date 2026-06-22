import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _storage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);

const _avKey = 'mkt_alphavantage_key';
const _tdKey = 'mkt_twelvedata_key';

/// Market-data API keys, stored in the OS keychain, never in plaintext
/// (PRD §9B: "Keys stored in OS secure keychain").
class MarketKeys {
  const MarketKeys({this.alphaVantage, this.twelveData});
  final String? alphaVantage;
  final String? twelveData;
}

final marketKeysProvider = FutureProvider<MarketKeys>((ref) async {
  return MarketKeys(
    alphaVantage: await _storage.read(key: _avKey),
    twelveData: await _storage.read(key: _tdKey),
  );
});

final marketKeysActionsProvider =
    Provider<MarketKeysActions>((ref) => MarketKeysActions(ref));

class MarketKeysActions {
  MarketKeysActions(this._ref);
  final Ref _ref;

  Future<void> save({String? alphaVantage, String? twelveData}) async {
    await _storage.write(
        key: _avKey,
        value: (alphaVantage?.trim().isEmpty ?? true) ? null : alphaVantage!.trim());
    await _storage.write(
        key: _tdKey,
        value: (twelveData?.trim().isEmpty ?? true) ? null : twelveData!.trim());
    _ref.invalidate(marketKeysProvider);
  }
}
