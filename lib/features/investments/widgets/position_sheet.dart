import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:khazana_domain/entities/portfolio.dart';
import 'package:khazana_domain/services/portfolio_analytics.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../providers/portfolio_providers.dart';

/// Opens the lots behind one holding, where each trade can be corrected or
/// removed and the whole holding deleted.
Future<void> showPositionSheet(BuildContext context, Position position) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => PositionSheet(position: position),
  );
}

/// Trades of a single instrument, newest first, with edit and delete.
///
/// Mirrors the web holdings editor: a wrong quantity or price is fixed in
/// place, and a holding added by mistake can be removed with its trades.
class PositionSheet extends ConsumerWidget {
  const PositionSheet({required this.position, super.key});

  final Position position;

  Future<bool> _confirm(BuildContext context, String title, String body) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final trades = [
      ...(ref.watch(tradesProvider).valueOrNull ?? const <Trade>[]).where(
        (t) => t.instrumentId == position.instrument.id,
      ),
    ]..sort((a, b) => b.tradeDate.compareTo(a.tradeDate));

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.8,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Text(
                position.instrument.name,
                style: text.titleMedium?.copyWith(fontWeight: FontWeight.w500),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (trades.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Text(
                        'No trades left for this holding.',
                        style: text.bodyMedium?.copyWith(color: muted),
                      ),
                    ),
                  for (final t in trades)
                    ListTile(
                      key: ValueKey('trade-${t.id}'),
                      title: Text(
                        '${t.side == TradeSide.buy ? 'Bought' : 'Sold'} '
                        '${t.quantity} @ ${Money.format(t.pricePerUnit)}',
                      ),
                      subtitle: Text(DateFormat('d MMM yyyy').format(t.tradeDate)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: 'Edit trade',
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () async {
                              final edited = await showDialog<Trade>(
                                context: context,
                                builder: (_) => _EditTradeDialog(trade: t),
                              );
                              if (edited != null) {
                                await ref
                                    .read(portfolioActionsProvider)
                                    .addTrade(edited);
                              }
                            },
                          ),
                          IconButton(
                            tooltip: 'Delete trade',
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              if (await _confirm(
                                context,
                                'Delete this trade?',
                                'Your position and cost basis will be '
                                'recalculated without it.',
                              )) {
                                await ref
                                    .read(portfolioActionsProvider)
                                    .deleteTrade(t.id);
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: OutlinedButton.icon(
                icon: const Icon(Icons.delete_forever_outlined),
                label: const Text('Delete holding'),
                onPressed: () async {
                  final nav = Navigator.of(context);
                  if (await _confirm(
                    context,
                    'Delete ${position.instrument.name}?',
                    'The holding and all of its trades, prices and dividends '
                    'are removed. This cannot be undone.',
                  )) {
                    await ref
                        .read(portfolioActionsProvider)
                        .deleteInstrument(position.instrument.id);
                    nav.pop();
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Quantity, price and date of a trade. Charges and side are kept as recorded.
class _EditTradeDialog extends StatefulWidget {
  const _EditTradeDialog({required this.trade});
  final Trade trade;

  @override
  State<_EditTradeDialog> createState() => _EditTradeDialogState();
}

class _EditTradeDialogState extends State<_EditTradeDialog> {
  late final _qty = TextEditingController(text: '${widget.trade.quantity}');
  late final _price =
      TextEditingController(text: '${widget.trade.pricePerUnit}');
  late DateTime _date = widget.trade.tradeDate;
  String? _error;

  @override
  void dispose() {
    _qty.dispose();
    _price.dispose();
    super.dispose();
  }

  Decimal? _positive(String s) {
    final d = Decimal.tryParse(s.trim());
    return (d == null || d <= Decimal.zero) ? null : d;
  }

  void _save() {
    final q = _positive(_qty.text);
    final p = _positive(_price.text);
    if (q == null || p == null) {
      setState(() => _error = 'Enter a quantity and price above zero.');
      return;
    }
    final t = widget.trade;
    Navigator.pop(
      context,
      Trade(
        id: t.id,
        vaultId: t.vaultId,
        instrumentId: t.instrumentId,
        side: t.side,
        quantity: q,
        pricePerUnit: p,
        tradeDate: _date,
        accountId: t.accountId,
        brokerage: t.brokerage,
        stt: t.stt,
        stampDuty: t.stampDuty,
        gst: t.gst,
        otherCharges: t.otherCharges,
        folioNumber: t.folioNumber,
        source: t.source,
        confidence: t.confidence,
        isReviewed: t.isReviewed,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit trade'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _qty,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Quantity'),
          ),
          TextField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Price per unit'),
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            icon: const Icon(Icons.event, size: 16),
            label: Text(DateFormat('d MMM yyyy').format(_date)),
            onPressed: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _date,
                firstDate: DateTime(1990),
                lastDate: DateTime.now(),
              );
              if (d != null) setState(() => _date = d);
            },
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}
