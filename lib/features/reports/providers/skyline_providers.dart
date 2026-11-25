import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:khazana_domain/entities/net_worth_snapshot.dart';
import 'package:khazana_domain/services/skyline.dart';

import '../../transactions/providers/transaction_providers.dart';
import 'dashboard_providers.dart';

/// What a skyline panel draws: the grid and the figures read off it.
class SpendSkylineData {
  const SpendSkylineData(this.sky, this.stats);
  final Skyline sky;
  final SpendStats stats;
}

class PortfolioSkylineData {
  const PortfolioSkylineData(this.sky, this.stats);
  final Skyline sky;
  final ChangeStats stats;

  /// Days with a reading. Zero means there is nothing to draw yet.
  int get readings => sky.cells.where((c) => c.amount != null).length;
}

/// The range and the day it is drawn on. A record, so equal values share one
/// cached provider instance however many times a widget rebuilds.
typedef SkylineKey = ({DateTime start, DateTime end, DateTime today});

/// Spending per day.
///
/// Watches only the transaction list (selected, so a change in loading state
/// or anything else on the notifier does not count) and takes the day as an
/// argument, so it recomputes when a transaction changes or the day rolls over
/// and at no other time.
final spendSkylineProvider = Provider.autoDispose
    .family<SpendSkylineData?, SkylineKey>((ref, k) {
      final txns = ref.watch(
        transactionListProvider.select(
          (s) => s is TransactionData ? s.transactions : null,
        ),
      );
      if (txns == null) return null;
      final sky = spendSkyline(txns, SkyRange(k.start, k.end), k.today);
      return SpendSkylineData(sky, spendStats(sky));
    });

/// Daily change in portfolio value, from the net-worth snapshots.
final portfolioSkylineProvider = Provider.autoDispose
    .family<PortfolioSkylineData?, SkylineKey>((ref, k) {
      final List<NetWorthSnapshot>? snaps = ref.watch(
        netWorthSnapshotListProvider.select((s) => s.valueOrNull),
      );
      if (snaps == null) return null;
      final sky = portfolioSkyline(snaps, SkyRange(k.start, k.end), k.today);
      return PortfolioSkylineData(sky, changeStats(sky));
    });
