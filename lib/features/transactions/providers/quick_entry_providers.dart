import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/data_providers.dart';
import '../../../domain/entities/category.dart';
import '../../../domain/services/nlp_parser.dart';

final nlpParserProvider = Provider<NlpParser>((ref) => const NlpParser());

/// Result of resolving a parsed quick entry against the vault's categories and
/// learned merchant aliases.
class ResolvedQuickEntry {
  const ResolvedQuickEntry({required this.parsed, this.categoryId});
  final ParsedQuickEntry parsed;
  final String? categoryId;
}

/// Parses free text, then resolves a category id from (a) a learned merchant
/// alias, else (b) the category hint matched by name (PRD §14).
final quickEntryResolverProvider = Provider<QuickEntryResolver>((ref) {
  return QuickEntryResolver(ref);
});

class QuickEntryResolver {
  QuickEntryResolver(this._ref);
  final Ref _ref;

  Future<ResolvedQuickEntry> resolve(String text,
      {List<Category> categories = const []}) async {
    final parsed = _ref.read(nlpParserProvider).parse(text);
    String? categoryId;

    // (a) learned merchant alias
    if (parsed.merchant != null) {
      categoryId = await _ref
          .read(merchantAliasRepositoryProvider)
          .categoryForMerchant(
              _ref.read(currentVaultIdProvider), parsed.merchant!);
    }
    // (b) category hint matched by name (case-insensitive contains)
    if (categoryId == null && parsed.categoryHint != null) {
      final hint = parsed.categoryHint!.toLowerCase();
      categoryId = categories
          .where((c) =>
              c.name.toLowerCase() == hint ||
              c.name.toLowerCase().contains(hint) ||
              hint.contains(c.name.toLowerCase()))
          .firstOrNull
          ?.id;
    }
    return ResolvedQuickEntry(parsed: parsed, categoryId: categoryId);
  }

  /// Learns the merchant→category association after the user confirms a save.
  Future<void> learn(String? merchant, String categoryId) async {
    if (merchant == null || merchant.isEmpty) return;
    await _ref.read(merchantAliasRepositoryProvider).learn(
          _ref.read(currentVaultIdProvider),
          merchant,
          categoryId,
        );
  }
}
