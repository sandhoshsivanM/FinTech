import 'package:decimal/decimal.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/di/data_providers.dart';
import '../../../core/services/notification_sync_service.dart';
import '../../../data/repositories/drift_sip_repository.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:khazana_domain/entities/sip.dart';
import 'package:khazana_domain/services/allocation_targets.dart';
import '../../settings/providers/fx_providers.dart';
import 'portfolio_providers.dart';

const _uuid = Uuid();

final sipRepositoryProvider = Provider<DriftSipRepository>((ref) {
  return DriftSipRepository(ref.watch(databaseProvider).sipDao);
});

/// Today as a calendar date. A provider so tests can pin it.
final sipTodayProvider = Provider<CalendarDate>(
  (ref) => CalendarDate.of(DateTime.now()),
);

final allocationTargetsProvider = StreamProvider<Map<AssetGroup, int>>((ref) {
  return ref
      .watch(sipRepositoryProvider)
      .watchTargets(ref.watch(currentVaultIdProvider));
});

final sipPlansProvider = StreamProvider<List<SipPlan>>((ref) {
  return ref
      .watch(sipRepositoryProvider)
      .watchPlans(ref.watch(currentVaultIdProvider));
});

final sipInstalmentsProvider = StreamProvider<List<SipInstalment>>((ref) {
  return ref
      .watch(sipRepositoryProvider)
      .watchInstalments(ref.watch(currentVaultIdProvider));
});

/// Target vs actual over the live portfolio.
///
/// Values are converted to the base currency first; a holding with no stored
/// rate is left out rather than counted at parity (the same rule as
/// [investmentTotalsProvider]), and its currency named in
/// [AllocationView.unconverted].
final allocationViewProvider = Provider<AsyncValue<AllocationView>>((ref) {
  final snap = ref.watch(portfolioSnapshotProvider);
  final targets = ref.watch(allocationTargetsProvider);
  final rateFor = ref.watch(fxLookupProvider);
  if (snap.hasError) return AsyncValue.error(snap.error!, snap.stackTrace!);
  if (targets.hasError) {
    return AsyncValue.error(targets.error!, targets.stackTrace!);
  }
  final s = snap.valueOrNull;
  final t = targets.valueOrNull;
  if (s == null || t == null) return const AsyncValue.loading();

  final inputs = <AllocationInput>[];
  final unconverted = <String>{};
  for (final p in s.positions) {
    final rate = rateFor(p.instrument.currency);
    if (rate == null) {
      unconverted.add(p.instrument.currency);
      continue;
    }
    inputs.add(AllocationInput(p.instrument.kind, p.marketValue * rate));
  }
  return AsyncValue.data(
    AllocationView(
      report: targetVsActual(inputs, t),
      targets: t,
      unconverted: unconverted,
    ),
  );
});

class AllocationView {
  const AllocationView({
    required this.report,
    required this.targets,
    required this.unconverted,
  });

  final AllocationReport report;
  final Map<AssetGroup, int> targets;
  final Set<String> unconverted;
}

/// Mutations. Every write re-plans reminders, since a due date may have
/// appeared, moved or been answered.
class SipActions {
  SipActions(this._ref);

  final Ref _ref;

  DriftSipRepository get _repo => _ref.read(sipRepositoryProvider);
  String get _vaultId => _ref.read(currentVaultIdProvider);

  Future<void> saveTargets(Map<AssetGroup, int> targets) async {
    final why = validateTargets(targets);
    if (why != null) throw ArgumentError(why);
    await _repo.saveTargets(_vaultId, targets);
  }

  Future<void> savePlan(SipPlan plan) async {
    await _repo.savePlan(plan);
    _ref.reconcileNotifications();
  }

  Future<void> deletePlan(String id) async {
    await _repo.deletePlan(id);
    _ref.reconcileNotifications();
  }

  Future<SipInstalment> markDone(
    SipPlan plan,
    CalendarDate due, {
    required Decimal amount,
    required Decimal nav,
  }) async {
    final i = await _repo.markDone(
      plan: plan,
      dueDate: due,
      amount: amount,
      nav: nav,
      instalmentId: _uuid.v4(),
      tradeId: _uuid.v4(),
    );
    _ref.reconcileNotifications();
    return i;
  }

  Future<void> markSkipped(SipPlan plan, CalendarDate due) async {
    await _repo.markSkipped(plan: plan, dueDate: due, instalmentId: _uuid.v4());
    _ref.reconcileNotifications();
  }

  Future<void> undo(String instalmentId) async {
    await _repo.undo(instalmentId);
    _ref.reconcileNotifications();
  }

  /// The latest known price for the plan's instrument, to prefill Mark done.
  Future<Decimal?> latestNav(String instrumentId) async {
    final prices = await _ref
        .read(portfolioRepositoryProvider)
        .latestPrices(_vaultId);
    return prices[instrumentId]?.price;
  }
}

final sipActionsProvider = Provider<SipActions>(SipActions.new);
