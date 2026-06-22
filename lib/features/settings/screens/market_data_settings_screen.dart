import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_tokens.dart';
import '../providers/market_keys_providers.dart';

/// Settings > Market Data (PRD §9B): user provides API keys for the fallback
/// providers. Keys live in the OS keychain. Yahoo (primary) needs no key.
class MarketDataSettingsScreen extends ConsumerStatefulWidget {
  const MarketDataSettingsScreen({super.key});
  @override
  ConsumerState<MarketDataSettingsScreen> createState() => _State();
}

class _State extends ConsumerState<MarketDataSettingsScreen> {
  final _av = TextEditingController();
  final _td = TextEditingController();
  bool _loaded = false;

  @override
  void dispose() {
    _av.dispose();
    _td.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keys = ref.watch(marketKeysProvider);
    keys.whenData((k) {
      if (!_loaded) {
        _av.text = k.alphaVantage ?? '';
        _td.text = k.twelveData ?? '';
        _loaded = true;
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Market Data')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          const Text(
            'Live prices use Yahoo Finance first (no key). Add keys below to '
            'enable the AlphaVantage and TwelveData fallbacks. Keys are stored '
            'in your device keychain and only sent to those providers.',
          ),
          const SizedBox(height: AppSpacing.lg),
          TextField(
            controller: _av,
            decoration: const InputDecoration(
              labelText: 'AlphaVantage API key',
              border: OutlineInputBorder(),
              helperText: '25 requests/day (free)',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _td,
            decoration: const InputDecoration(
              labelText: 'TwelveData API key',
              border: OutlineInputBorder(),
              helperText: '8 requests/min (free)',
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          FilledButton.icon(
            icon: const Icon(Icons.save),
            label: const Text('Save keys'),
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              await ref
                  .read(marketKeysActionsProvider)
                  .save(alphaVantage: _av.text, twelveData: _td.text);
              messenger
                  .showSnackBar(const SnackBar(content: Text('Keys saved.')));
            },
          ),
        ],
      ),
    );
  }
}
