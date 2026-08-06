import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/utils/money_format.dart';
import '../../../domain/services/portfolio_analytics.dart';
import '../../../presentation/glass_card.dart';

/// What a column is sorted by.
enum _SortKey { name, quantity, avgCost, price, value, invested, pnl, ret, weight }

/// The full holdings grid: every column, sortable, searchable, exportable.
///
/// The Investments screen already listed holdings, but a list can only be read
/// in the order it was written. A table lets someone ask "which of these is my
/// worst performer by percentage" and get an answer by clicking once, which is
/// the entire reason brokers ship a grid rather than a list.
class HoldingsTable extends StatefulWidget {
  const HoldingsTable({required this.snap, super.key});

  final PortfolioSnapshot snap;

  @override
  State<HoldingsTable> createState() => _HoldingsTableState();
}

class _HoldingsTableState extends State<HoldingsTable> {
  final _search = TextEditingController();
  _SortKey _sort = _SortKey.value;
  bool _descending = true;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Return as a fraction, or null when there is no cost to measure against.
  static double? _ret(Position p) => p.costBasis <= Decimal.zero
      ? null
      : (p.unrealisedPnl / p.costBasis).toDouble();

  List<Position> get _rows {
    final q = _search.text.trim().toLowerCase();
    final rows = widget.snap.positions.where((p) {
      if (q.isEmpty) return true;
      return p.instrument.name.toLowerCase().contains(q) ||
          (p.instrument.symbol ?? '').toLowerCase().contains(q);
    }).toList();

    int cmp(Position a, Position b) => switch (_sort) {
          _SortKey.name => a.instrument.name.compareTo(b.instrument.name),
          _SortKey.quantity => a.quantity.compareTo(b.quantity),
          _SortKey.avgCost => a.avgCost.compareTo(b.avgCost),
          _SortKey.price =>
            (a.price ?? Decimal.zero).compareTo(b.price ?? Decimal.zero),
          _SortKey.value => a.marketValue.compareTo(b.marketValue),
          _SortKey.invested => a.costBasis.compareTo(b.costBasis),
          _SortKey.pnl => a.unrealisedPnl.compareTo(b.unrealisedPnl),
          // Unpriced rows sort to the bottom in either direction rather than
          // being treated as 0%: a holding with no cost basis has no return,
          // and letting it sit mid-table implies it does.
          _SortKey.ret => (_ret(a) ?? -1e9).compareTo(_ret(b) ?? -1e9),
          _SortKey.weight => a.marketValue.compareTo(b.marketValue),
        };

    rows.sort((a, b) => _descending ? cmp(b, a) : cmp(a, b));
    return rows;
  }

  void _toggle(_SortKey key) => setState(() {
        if (_sort == key) {
          _descending = !_descending;
        } else {
          _sort = key;
          // A newly picked column starts descending except for the name, where
          // A–Z is what anyone means by "sort by name".
          _descending = key != _SortKey.name;
        }
      });

  /// Copies the visible rows as CSV.
  ///
  /// Clipboard rather than a file: the export is meant for a spreadsheet, the
  /// app already has to ask for a save location it does not otherwise need, and
  /// a paste is one step where a file is three.
  Future<void> _export() async {
    final rows = _rows;
    final total =
        widget.snap.positions.fold(Decimal.zero, (s, p) => s + p.marketValue);
    final buffer = StringBuffer()
      ..writeln('Symbol,Name,Quantity,Average price,Last price,Current value,'
          'Invested,Unrealised P&L,Return %,Weight %');
    for (final p in rows) {
      final ret = _ret(p);
      buffer.writeln([
        p.instrument.symbol ?? '',
        // Quoted: instrument names routinely contain commas, and an unquoted
        // one silently shifts every later column in the pasted sheet.
        '"${p.instrument.name.replaceAll('"', '""')}"',
        p.quantity,
        p.avgCost,
        p.price ?? '',
        p.marketValue,
        p.costBasis,
        p.unrealisedPnl,
        ret == null ? '' : (ret * 100).toStringAsFixed(2),
        total <= Decimal.zero
            ? ''
            : ((p.marketValue / total).toDouble() * 100).toStringAsFixed(2),
      ].join(','));
    }
    await Clipboard.setData(ClipboardData(text: buffer.toString()));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${rows.length} holdings copied as CSV — paste into a '
            'spreadsheet.')));
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final total =
        widget.snap.positions.fold(Decimal.zero, (s, p) => s + p.marketValue);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Holdings (${rows.length})',
                    style:
                        text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              ),
              SizedBox(
                width: 220,
                child: TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    isDense: true,
                    hintText: 'Search holdings',
                    prefixIcon: Icon(Icons.search, size: 18),
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              OutlinedButton.icon(
                onPressed: rows.isEmpty ? null : _export,
                icon: const Icon(Icons.download, size: 16),
                label: const Text('Export'),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
              child: Center(
                child: Text(
                  _search.text.isEmpty
                      ? 'No holdings yet.'
                      : 'Nothing matches “${_search.text}”.',
                  style: text.bodyMedium?.copyWith(color: muted),
                ),
              ),
            )
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                sortColumnIndex: _SortKey.values.indexOf(_sort),
                sortAscending: !_descending,
                headingRowHeight: 38,
                dataRowMinHeight: 40,
                dataRowMaxHeight: 44,
                columnSpacing: 22,
                columns: [
                  DataColumn(
                      label: const Text('Holding'),
                      onSort: (_, _) => _toggle(_SortKey.name)),
                  DataColumn(
                      label: const Text('Qty'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.quantity)),
                  DataColumn(
                      label: const Text('Avg'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.avgCost)),
                  DataColumn(
                      label: const Text('LTP'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.price)),
                  DataColumn(
                      label: const Text('Value'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.value)),
                  DataColumn(
                      label: const Text('Invested'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.invested)),
                  DataColumn(
                      label: const Text('P&L'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.pnl)),
                  DataColumn(
                      label: const Text('Return'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.ret)),
                  DataColumn(
                      label: const Text('Weight'),
                      numeric: true,
                      onSort: (_, _) => _toggle(_SortKey.weight)),
                ],
                rows: [
                  for (final p in rows)
                    DataRow(cells: [
                      DataCell(ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 220),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(p.instrument.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: text.bodyMedium),
                            if (p.instrument.symbol != null)
                              Text(p.instrument.symbol!,
                                  style: text.labelSmall
                                      ?.copyWith(color: muted)),
                          ],
                        ),
                      )),
                      DataCell(Text('${p.quantity}')),
                      DataCell(Text(Money.format(p.avgCost))),
                      DataCell(Text(
                          p.price == null ? '—' : Money.format(p.price!))),
                      DataCell(Text(Money.format(p.marketValue),
                          style: const TextStyle(fontWeight: FontWeight.w700))),
                      DataCell(Text(Money.format(p.costBasis))),
                      DataCell(Text(
                        Money.formatSigned(p.unrealisedPnl,
                            isIncome: p.unrealisedPnl >= Decimal.zero),
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: p.unrealisedPnl >= Decimal.zero
                              ? AppColors.income
                              : AppColors.expense,
                        ),
                      )),
                      DataCell(Builder(builder: (context) {
                        final r = _ret(p);
                        if (r == null) {
                          return Text('—',
                              style: text.bodyMedium?.copyWith(color: muted));
                        }
                        return Text(
                          '${r >= 0 ? '+' : ''}${(r * 100).toStringAsFixed(2)}%',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: r >= 0
                                ? AppColors.income
                                : AppColors.expense,
                          ),
                        );
                      })),
                      DataCell(Text(total <= Decimal.zero
                          ? '—'
                          : '${((p.marketValue / total).toDouble() * 100).toStringAsFixed(2)}%')),
                    ]),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
