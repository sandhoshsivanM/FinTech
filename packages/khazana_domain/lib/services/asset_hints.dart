import '../entities/holding.dart';

/// Asset-type hints: gold, silver and SGB holdings that arrive under a generic
/// type. Mirrors `packages/domain-ts/src/assetHints.ts`; both suites run
/// `test/fixtures/asset_hint_cases.json`.
///
/// Import and Add lot start every row as Equity / ETF. A gold ETF left there
/// counts as equity in Target vs Actual and is taxed as equity. A hint never
/// changes a holding on its own: callers pre-select it for new rows or offer a
/// one-tap Fix. Table-driven and offline; no lookup leaves the device.

const _goldSymbols = {
  'GOLDBEES', 'GOLDIETF', 'SETFGOLD', 'HDFCGOLD', 'AXISGOLD', 'KOTAKGOLD', //
  'GOLD1', 'LICMFGOLD', 'BSLGOLDETF', 'QGOLDHALF', 'GOLDCASE', 'IVZINGOLD',
  'TATAGOLD', 'EGOLD', 'GOLDETF', 'GOLDSHARE',
};

const _silverSymbols = {
  'SILVERBEES', 'SILVERIETF', 'SILVER1', 'HDFCSILVER', 'AXISILVER', //
  'SBISILVER', 'TATSILV', 'SILVERETF', 'KOTAKSILVE', 'SILVERCASE', 'SILVERADD',
};

/// Types a hint may override: the defaults import and Add lot start from.
const kGenericAssetTypes = {AssetType.equityEtf, AssetType.equityMf};

final _fundWord = RegExp(
  r'\b(etf|bees|fof|fund|fund of funds?)\b',
  caseSensitive: false,
);
final _gold = RegExp(r'\bgold\b', caseSensitive: false);
final _silver = RegExp(r'\bsilver\b', caseSensitive: false);
final _sgbName = RegExp(r'\bsovereign gold bond', caseSensitive: false);
final _sgbSymbol = RegExp(r'^SGB[A-Z]{3}\d{2}');
final _exchangeSuffix = RegExp(r'\.(NS|BO|NSE|BSE)$');

/// "NSE:GOLDBEES", "goldbees.ns" → "GOLDBEES".
String normaliseSymbol(String symbol) {
  final s = symbol.trim().toUpperCase();
  final i = s.lastIndexOf(':');
  return (i >= 0 ? s.substring(i + 1) : s).replaceFirst(_exchangeSuffix, '');
}

AssetType? suggestAssetType(String symbol, String title) {
  final sym = normaliseSymbol(symbol);
  if (_goldSymbols.contains(sym)) return AssetType.goldEtf;
  if (_silverSymbols.contains(sym)) return AssetType.silver;
  if (_sgbSymbol.hasMatch(sym)) return AssetType.sgb;

  final t = title.trim();
  if (_sgbName.hasMatch(t)) return AssetType.sgb;
  if (!_fundWord.hasMatch(t)) return null;
  if (_gold.hasMatch(t)) return AssetType.goldEtf;
  if (_silver.hasMatch(t)) return AssetType.silver;
  return null;
}

/// The type a holding should probably have, when it is filed under a generic
/// type but looks like gold, silver or an SGB. Null when it looks right, or the
/// user chose a specific type themselves.
AssetType? misfiledAs(AssetType type, String symbol, String title) {
  if (!kGenericAssetTypes.contains(type)) return null;
  final hint = suggestAssetType(symbol, title);
  return hint != null && hint != type ? hint : null;
}
