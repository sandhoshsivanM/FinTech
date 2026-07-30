import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../domain/entities/holding.dart';
import '../../../domain/entities/portfolio.dart';
import '../../../presentation/data_gate.dart';
import '../../../presentation/glass_card.dart';
import '../providers/portfolio_providers.dart';

const _uuid = Uuid();

/// Manual lot entry — a buy or a sell with its date, price and charges.
///
/// This is the entry path everything else depends on: it is how a portfolio gets
/// started, and how any bad import row gets corrected. Charges are captured
/// because cost basis includes them; leaving them out makes P&L read better than
/// reality.
class AddLotScreen extends ConsumerStatefulWidget {
  const AddLotScreen({super.key});

  @override
  ConsumerState<AddLotScreen> createState() => _AddLotScreenState();
}

class _AddLotScreenState extends ConsumerState<AddLotScreen> {
  final _form = GlobalKey<FormState>();

  final _name = TextEditingController();
  final _symbol = TextEditingController();
  final _isin = TextEditingController();
  final _schemeCode = TextEditingController();
  final _qty = TextEditingController();
  final _price = TextEditingController();
  final _charges = TextEditingController();
  final _currentPrice = TextEditingController();

  TradeSide _side = TradeSide.buy;
  AssetType _kind = AssetType.equityEtf;
  String _exchange = 'NSE';
  DateTime _date = DateTime.now();
  bool _saving = false;

  @override
  void dispose() {
    for (final c in [
      _name, _symbol, _isin, _schemeCode,
      _qty, _price, _charges, _currentPrice,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _isFund =>
      _kind == AssetType.equityMf || _kind == AssetType.debtMf;

  Decimal? _parse(String s) {
    final t = s.trim();
    if (t.isEmpty) return null;
    try {
      return Decimal.parse(t);
    } on FormatException {
      return null;
    }
  }

  String? _requiredPositive(String? v) {
    final d = _parse(v ?? '');
    if (d == null) return 'Required';
    if (d <= Decimal.zero) return 'Must be greater than zero';
    return null;
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;

    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final actions = ref.read(portfolioActionsProvider);
    final vaultId = ref.read(currentVaultIdProvider);

    try {
      final symbol = _symbol.text.trim().toUpperCase();
      final instrument = await actions.ensureInstrument(
        name: _name.text.trim().isEmpty ? symbol : _name.text.trim(),
        kind: _kind,
        symbol: symbol.isEmpty ? null : symbol,
        isin: _isin.text.trim().isEmpty ? null : _isin.text.trim().toUpperCase(),
        exchange: _isFund ? null : _exchange,
        schemeCode:
            _schemeCode.text.trim().isEmpty ? null : _schemeCode.text.trim(),
      );

      await actions.addTrade(Trade(
        id: _uuid.v4(),
        vaultId: vaultId,
        instrumentId: instrument.id,
        side: _side,
        quantity: _parse(_qty.text)!,
        pricePerUnit: _parse(_price.text)!,
        tradeDate: _date,
        otherCharges: _parse(_charges.text),
        source: TradeSource.manual,
        // Hand-entered, so it is confirmed by definition — unlike an import.
        isReviewed: true,
      ));

      final current = _parse(_currentPrice.text);
      if (current != null) {
        await actions.recordManualPrice(
          instrumentId: instrument.id,
          price: current,
        );
      }

      if (!mounted) return;
      messenger.showSnackBar(SnackBar(
        content: Text('${_side == TradeSide.buy ? 'Buy' : 'Sell'} recorded'
            '${current == null ? ' — add a price to see profit and loss' : ''}'),
      ));
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      messenger.showSnackBar(
          SnackBar(content: Text('Could not save: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final classified = ref
        .watch(instrumentMasterProvider)
        .valueOrNull
        ?.lookup(symbol: _symbol.text.trim().toUpperCase());

    return Scaffold(
      appBar: AppBar(title: const Text('Add lot')),
      body: DataGate(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SegmentedButton<TradeSide>(
                      segments: const [
                        ButtonSegment(value: TradeSide.buy, label: Text('Buy')),
                        ButtonSegment(
                            value: TradeSide.sell, label: Text('Sell')),
                      ],
                      selected: {_side},
                      onSelectionChanged: (s) =>
                          setState(() => _side = s.first),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    DropdownButtonFormField<AssetType>(
                      initialValue: _kind,
                      decoration:
                          const InputDecoration(labelText: 'Asset type'),
                      items: [
                        for (final t in AssetType.values)
                          DropdownMenuItem(value: t, child: Text(t.label)),
                      ],
                      onChanged: (t) =>
                          setState(() => _kind = t ?? AssetType.equityEtf),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: _symbol,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: _isFund ? 'Symbol (optional)' : 'Symbol',
                        hintText: 'INFY',
                        helperText: classified == null
                            ? null
                            : 'Recognised: ${classified.sector}'
                                ' · ${classified.industry}',
                      ),
                      onChanged: (_) => setState(() {}),
                      validator: (v) {
                        if (_isFund) return null;
                        return (v == null || v.trim().isEmpty)
                            ? 'Required for listed instruments'
                            : null;
                      },
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: _name,
                      decoration: InputDecoration(
                        labelText: _isFund ? 'Scheme name' : 'Name (optional)',
                      ),
                      validator: (v) {
                        if (!_isFund) return null;
                        return (v == null || v.trim().isEmpty)
                            ? 'Required for funds'
                            : null;
                      },
                    ),
                    if (!_isFund) ...[
                      const SizedBox(height: AppSpacing.md),
                      DropdownButtonFormField<String>(
                        initialValue: _exchange,
                        decoration:
                            const InputDecoration(labelText: 'Exchange'),
                        items: const [
                          DropdownMenuItem(value: 'NSE', child: Text('NSE')),
                          DropdownMenuItem(value: 'BSE', child: Text('BSE')),
                        ],
                        onChanged: (v) =>
                            setState(() => _exchange = v ?? 'NSE'),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: _isin,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'ISIN (optional)',
                        helperText:
                            'Preferred identifier — it never collides, unlike a symbol',
                      ),
                    ),
                    if (_isFund) ...[
                      const SizedBox(height: AppSpacing.md),
                      TextFormField(
                        controller: _schemeCode,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'AMFI scheme code (optional)',
                          helperText: 'Enables NAV lookup and fund look-through',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('The lot',
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: _qty,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                            RegExp(r'[0-9.]')),
                      ],
                      decoration: InputDecoration(
                        labelText: _isFund ? 'Units' : 'Quantity',
                      ),
                      validator: _requiredPositive,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: _price,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                      ],
                      decoration: InputDecoration(
                        labelText: _isFund
                            ? 'NAV per unit'
                            : 'Price per share',
                        prefixText: '₹ ',
                      ),
                      validator: _requiredPositive,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextFormField(
                      controller: _charges,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Charges (optional)',
                        prefixText: '₹ ',
                        helperText:
                            'Brokerage, STT, stamp duty, GST. Included in cost '
                            'basis so your P&L matches your broker.',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _date,
                          firstDate: DateTime(1990),
                          lastDate: DateTime.now(),
                        );
                        if (picked != null) setState(() => _date = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          labelText: 'Trade date',
                          helperText:
                              'Drives the holding period, so it decides '
                              'short-term versus long-term tax',
                        ),
                        child: Text(DateFormat('d MMM y').format(_date)),
                      ),
                    ),
                  ],
                ),
              ),
              if (_side == TradeSide.buy) ...[
                const SizedBox(height: AppSpacing.md),
                GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Current price',
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        'Optional. Without a price this holding counts at cost '
                        'and shows no profit or loss — a value with no date '
                        'would be worse than none.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      TextFormField(
                        controller: _currentPrice,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                        ],
                        decoration: const InputDecoration(
                          labelText: 'Price today (optional)',
                          prefixText: '₹ ',
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save lot'),
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
