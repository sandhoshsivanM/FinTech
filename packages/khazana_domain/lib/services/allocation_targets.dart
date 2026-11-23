import 'package:decimal/decimal.dart';

import '../entities/asset_group.dart';
import '../entities/holding.dart';

/// Target vs actual asset allocation.
///
/// Mirrors `packages/domain-ts/src/allocation.ts`. Both suites assert against
/// `test/fixtures/allocation_cases.json`; change one twin, change the other.
///
/// The output only ever *suggests* where new money should go. "Over by ₹X" is
/// deliberately not "Sell ₹X": selling has tax and exit-load consequences this
/// screen cannot see, and nudging someone into a taxable sale to tidy a chart
/// is the wrong default for a personal-finance app.

/// Default band, in percentage points, inside which a group reads "On track".
final kDefaultAllocationTolerance = Decimal.fromInt(2);

/// One holding's contribution: its type and current market value.
class AllocationInput {
  const AllocationInput(this.type, this.value);
  final AssetType type;
  final Decimal value;
}

enum AllocationStatus {
  under('under'),
  over('over'),
  onTrack('on_track');

  const AllocationStatus(this.key);
  final String key;
}

/// One asset type inside a group.
class AllocationChild {
  const AllocationChild({
    required this.type,
    required this.value,
    required this.actualPct,
    required this.count,
  });

  final AssetType type;
  final Decimal value;

  /// Share of the whole portfolio, 1 dp.
  final Decimal actualPct;

  /// Holdings of this type.
  final int count;
}

class AllocationRow {
  const AllocationRow({
    required this.group,
    required this.value,
    required this.actualPct,
    required this.targetPct,
    required this.targetValue,
    required this.gapPct,
    required this.status,
    required this.amount,
    required this.children,
  });

  final AssetGroup group;

  /// Current market value of the group.
  final Decimal value;

  /// Share of the portfolio, 1 dp.
  final Decimal actualPct;

  /// The user's target, whole percent. 0 when they set none for this group.
  final int targetPct;

  /// [targetPct] of the total, rounded to the rupee.
  final Decimal targetValue;

  /// actual − target in percentage points, 1 dp. Negative = under target.
  final Decimal gapPct;

  final AllocationStatus status;

  /// Rupees needed to reach the target (under) or above it (over), rounded to
  /// the rupee. Zero when on track.
  final Decimal amount;

  /// Asset types in the group, largest first.
  final List<AllocationChild> children;
}

class AllocationReport {
  const AllocationReport({
    required this.total,
    required this.rows,
    required this.targetsTotal,
  });

  final Decimal total;

  /// Groups that hold money or carry a target, in [kAssetGroupOrder].
  final List<AllocationRow> rows;

  /// Sum of the targets as stored. Anything but 100 means the targets are
  /// incomplete and the UI should ask the user to finish them.
  final int targetsTotal;

  bool get hasTargets => targetsTotal == 100;

  Iterable<AllocationRow> get under =>
      rows.where((r) => r.status == AllocationStatus.under);

  Iterable<AllocationRow> get over =>
      rows.where((r) => r.status == AllocationStatus.over);
}

final _hundred = Decimal.fromInt(100);

Decimal _pct(Decimal part, Decimal total) => total == Decimal.zero
    ? Decimal.zero
    : (part * _hundred / total).toDecimal(scaleOnInfinitePrecision: 12);

/// Half-up (away from zero) to [scale] places — matches decimal.js
/// `ROUND_HALF_UP`, which the TypeScript twin uses.
Decimal roundHalfUp(Decimal v, [int scale = 0]) => v.round(scale: scale);

/// Builds the target-vs-actual table.
///
/// [targets] maps [AssetGroup] to a whole-percent target. Groups missing from
/// it count as a 0% target, so money there reads as "over".
AllocationReport targetVsActual(
  List<AllocationInput> holdings,
  Map<AssetGroup, int> targets, {
  Decimal? tolerance,
}) {
  final tol = tolerance ?? kDefaultAllocationTolerance;
  var total = Decimal.zero;
  final byGroup = <AssetGroup, Map<AssetType, (Decimal, int)>>{};
  for (final h in holdings) {
    if (h.value <= Decimal.zero) continue;
    total += h.value;
    final types = byGroup[AssetGroup.of(h.type)] ??= {};
    final prev = types[h.type] ?? (Decimal.zero, 0);
    types[h.type] = (prev.$1 + h.value, prev.$2 + 1);
  }

  final rows = <AllocationRow>[];
  for (final g in kAssetGroupOrder) {
    final types = byGroup[g] ?? const {};
    final target = targets[g] ?? 0;
    if (types.isEmpty && target == 0) continue;

    var value = Decimal.zero;
    for (final t in types.values) {
      value += t.$1;
    }
    final exactPct = _pct(value, total);
    final gap = exactPct - Decimal.fromInt(target);
    final targetValue = roundHalfUp(
        (total * Decimal.fromInt(target) / _hundred)
            .toDecimal(scaleOnInfinitePrecision: 12));
    final status = gap < -tol
        ? AllocationStatus.under
        : gap > tol
            ? AllocationStatus.over
            : AllocationStatus.onTrack;

    final children = [
      for (final e in types.entries)
        AllocationChild(
          type: e.key,
          value: e.value.$1,
          actualPct: roundHalfUp(_pct(e.value.$1, total), 1),
          count: e.value.$2,
        ),
    ]..sort((a, b) {
        final c = b.value.compareTo(a.value);
        return c != 0 ? c : a.type.index.compareTo(b.type.index);
      });

    rows.add(AllocationRow(
      group: g,
      value: value,
      actualPct: roundHalfUp(exactPct, 1),
      targetPct: target,
      targetValue: targetValue,
      gapPct: roundHalfUp(gap, 1),
      status: status,
      amount: status == AllocationStatus.onTrack
          ? Decimal.zero
          : roundHalfUp((targetValue - value).abs()),
      children: children,
    ));
  }

  return AllocationReport(
    total: total,
    rows: rows,
    targetsTotal: targets.values.fold<int>(0, (a, b) => a + b),
  );
}

/// Why a set of targets cannot be saved, or null when it can.
String? validateTargets(Map<AssetGroup, int> targets) {
  for (final e in targets.entries) {
    if (e.value < 0 || e.value > 100) {
      return '${e.key.label} must be between 0% and 100%';
    }
  }
  final sum = targets.values.fold<int>(0, (a, b) => a + b);
  if (sum != 100) return 'Targets add up to $sum%. They must total 100%.';
  return null;
}

/// A starting point for a first-time user: today's allocation, in whole
/// percents that total exactly 100. The rounding remainder goes to the largest
/// group, where a point matters least.
Map<AssetGroup, int> suggestTargets(AllocationReport report) {
  if (report.total == Decimal.zero) return const {};
  final out = <AssetGroup, int>{};
  AllocationRow? largest;
  for (final r in report.rows) {
    if (r.value == Decimal.zero) continue;
    out[r.group] = roundHalfUp(_pct(r.value, report.total)).toBigInt().toInt();
    if (largest == null || r.value > largest.value) largest = r;
  }
  final diff = 100 - out.values.fold<int>(0, (a, b) => a + b);
  if (largest != null && diff != 0) {
    out[largest.group] = out[largest.group]! + diff;
  }
  return out;
}
