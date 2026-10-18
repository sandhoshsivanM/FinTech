import 'package:decimal/decimal.dart';
import 'package:uuid/uuid.dart';

import '../../../domain/entities/pending_capture.dart';
import '../../../domain/entities/transaction.dart';
import '../../../domain/repositories/merchant_alias_repository.dart';
import '../../../domain/repositories/pending_capture_repository.dart';
import '../../../domain/repositories/transaction_repository.dart';
import '../../../domain/services/capture_account_matcher.dart';
import '../../../domain/services/capture_router.dart';
import '../../../domain/services/notification_parser.dart';
import 'capture_channel.dart';

/// Writes and removes ledger entries on the pipeline's behalf. A port, so the
/// pipeline stays testable without Riverpod: the app implements it with
/// `TransactionNotifier`, tests with a fake that records calls.
abstract interface class CapturePoster {
  /// Records the entry and its postings; returns the new transaction id.
  Future<String> post({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required DateTime date,
    String? merchant,
    String? accountId,
    required String source,
    required String captureId,
  });

  Future<void> remove(String txnId);
}

enum IngestResult { ignored, duplicate, queued, autoPosted }

class IngestOutcome {
  const IngestOutcome(this.result, [this.capture]);
  final IngestResult result;
  final PendingCapture? capture;
}

/// Turns raw captured messages into ledger entries or review-inbox items.
///
/// Per message: parse in memory and drop the raw text, skip anything already
/// seen (any status — a decided capture is still the record that this alert
/// was handled), gather the routing facts, let [CaptureRouter] decide, then
/// either post or queue.
class CapturePipeline {
  CapturePipeline({
    required IPendingCaptureRepository repo,
    required ICaptureAccountLinkRepository links,
    required IMerchantAliasRepository aliases,
    required ITransactionRepository transactions,
    required CapturePoster poster,
    required String vaultId,
    bool Function()? alwaysReview,
    this.parser = const NotificationParser(),
    this.router = const CaptureRouter(),
    Uuid uuid = const Uuid(),
    DateTime Function()? clock,
  })  : _repo = repo,
        _links = links,
        _aliases = aliases,
        _transactions = transactions,
        _poster = poster,
        _vaultId = vaultId,
        _alwaysReview = alwaysReview ?? (() => false),
        _uuid = uuid,
        _clock = clock ?? DateTime.now;

  final IPendingCaptureRepository _repo;
  final ICaptureAccountLinkRepository _links;
  final IMerchantAliasRepository _aliases;
  final ITransactionRepository _transactions;
  final CapturePoster _poster;
  final String _vaultId;
  final bool Function() _alwaysReview;
  final NotificationParser parser;
  final CaptureRouter router;
  final Uuid _uuid;
  final DateTime Function() _clock;

  static const _history = Duration(days: 90);
  static const _nearby = Duration(days: 2);

  Future<IngestOutcome> ingest(CapturedMessage msg) async =>
      (await ingestAll([msg])).single;

  /// Processes a batch — one live message or a whole history import. Links
  /// and the ledger window are loaded once for the batch, not once per
  /// message: for a 90-day import that turns thousands of queries into two.
  Future<List<IngestOutcome>> ingestAll(List<CapturedMessage> messages) async {
    final parsed = [
      for (final m in messages)
        (m, parser.parse(m.text, now: m.postedAt, sender: m.sender)),
    ];
    final dates = [
      for (final (m, p) in parsed)
        if (p != null) _occurredAt(m, p),
    ];
    if (dates.isEmpty) {
      return [for (final _ in messages) const IngestOutcome(IngestResult.ignored)];
    }

    final matcher = CaptureAccountMatcher(await _links.getAll(_vaultId));
    dates.sort();
    final ledger = await _transactions.getInRange(
        _vaultId, dates.first.subtract(_history), dates.last.add(_nearby));

    final outcomes = <IngestOutcome>[];
    for (final (m, p) in parsed) {
      outcomes.add(p == null
          ? const IngestOutcome(IngestResult.ignored)
          : await _process(m, p, matcher, ledger));
    }
    return outcomes;
  }

  DateTime _occurredAt(CapturedMessage m, ParsedNotification p) =>
      DateTime.tryParse(p.timestamp) ?? m.postedAt;

  Future<IngestOutcome> _process(
    CapturedMessage msg,
    ParsedNotification p,
    CaptureAccountMatcher matcher,
    List<Txn> ledger,
  ) async {
    final fingerprint = p.fingerprintInput;
    if (await _repo.exists(_vaultId, fingerprint)) {
      return const IngestOutcome(IngestResult.duplicate);
    }

    final occurredAt = _occurredAt(msg, p);
    final merchant = p.merchant.isEmpty ? null : p.merchant;
    final accountId = matcher.match(
        profileId: p.profileId, last4: p.accountLast4, instrument: p.instrument);
    final categoryId = merchant == null
        ? null
        : await _aliases.categoryForMerchant(_vaultId, merchant);
    final previousBalance =
        accountId == null ? null : await _repo.latestBalanceFor(_vaultId, accountId);
    final oppositeLeg = p.utr != null &&
        (await _repo.findByUtr(_vaultId, p.utr!)).any((c) => c.type != p.type);

    final decision = router.decide(RoutingFacts(
      amount: p.amount,
      type: p.type,
      kind: p.kind,
      occurredAt: occurredAt,
      profileId: p.profileId,
      merchant: merchant,
      utr: p.utr,
      availableBalance: p.availableBalance,
      accountId: accountId,
      categoryId: categoryId,
      previousBalance: previousBalance,
      recentAmounts: [
        for (final t in ledger)
          if (accountId != null &&
              t.accountId == accountId &&
              t.type == p.type &&
              t.date.isBefore(occurredAt) &&
              occurredAt.difference(t.date) <= _history)
            t.amount,
      ],
      nearbyTransactions: [
        for (final t in ledger)
          if (t.date.difference(occurredAt).abs() <= _nearby) t,
      ],
      oppositeLegExists: oppositeLeg,
      alwaysReview: _alwaysReview(),
    ));

    var capture = PendingCapture(
      id: _uuid.v4(),
      vaultId: _vaultId,
      amount: p.amount,
      type: p.type,
      merchant: merchant,
      occurredAt: occurredAt,
      source: msg.source,
      uncategorized: categoryId == null,
      fingerprint: fingerprint,
      capturedAt: _clock(),
      confidence: decision.confidence,
      reasons: decision.reasons,
      accountId: accountId,
      categoryId: categoryId,
      utr: p.utr,
      accountLast4: p.accountLast4,
      availableBalance: p.availableBalance,
      instrument: p.instrument,
      kind: p.kind,
      profileId: p.profileId,
    );
    // Saved before posting: if the post fails, the alert is still recorded as
    // seen (no double post on redelivery) and waits in the inbox instead.
    await _repo.save(capture);
    if (!decision.autoPost) return IngestOutcome(IngestResult.queued, capture);

    final txnId = await _poster.post(
      amount: p.amount,
      type: p.type,
      categoryId: categoryId!,
      date: occurredAt,
      merchant: merchant,
      accountId: accountId,
      source: msg.source.key,
      captureId: capture.id,
    );
    capture = capture.copyWith(
        status: CaptureStatus.autoPosted, decidedAt: _clock(), postedTxnId: txnId);
    await _repo.save(capture);
    return IngestOutcome(IngestResult.autoPosted, capture);
  }

  /// Drops decided captures older than [age]. Pending ones are kept.
  Future<int> purgeOld({Duration age = const Duration(days: 90)}) =>
      _repo.purgeDecidedBefore(_vaultId, _clock().subtract(age));
}

/// The user's decisions on captures: approve (optionally with corrections),
/// reject, undo — and what the app learns from each.
class CaptureReviewService {
  CaptureReviewService({
    required IPendingCaptureRepository repo,
    required ICaptureAccountLinkRepository links,
    required IMerchantAliasRepository aliases,
    required CapturePoster poster,
    required String vaultId,
    Uuid uuid = const Uuid(),
    DateTime Function()? clock,
  })  : _repo = repo,
        _links = links,
        _aliases = aliases,
        _poster = poster,
        _vaultId = vaultId,
        _uuid = uuid,
        _clock = clock ?? DateTime.now;

  final IPendingCaptureRepository _repo;
  final ICaptureAccountLinkRepository _links;
  final IMerchantAliasRepository _aliases;
  final CapturePoster _poster;
  final String _vaultId;
  final Uuid _uuid;
  final DateTime Function() _clock;

  /// Posts the capture. [amount] / [type] are the user's corrections — e.g. the
  /// alert was read as ₹1,000 but the spend was ₹10,000. A corrected capture is
  /// marked [CaptureStatus.editedApproved] and keeps the parsed amount beside
  /// the final one, so a misreading parser shows up in the data.
  ///
  /// Learns twice: merchant → category (next time this merchant needs no
  /// category pick), and suffix → account when [rememberAccount] (next time
  /// this account needs no pick at all). Both are what let later captures
  /// clear the router's bar and post automatically.
  Future<PendingCapture> approve(
    PendingCapture c, {
    required String categoryId,
    String? accountId,
    Decimal? amount,
    TxnType? type,
    bool rememberAccount = true,
  }) async {
    // Idempotent: a double tap must not write two entries.
    if (c.postedTxnId != null) return c;

    final account = accountId ?? c.accountId;
    final finalAmount = amount ?? c.amount;
    final finalType = type ?? c.type;
    final edited = finalAmount != c.amount || finalType != c.type;

    final txnId = await _poster.post(
      amount: finalAmount,
      type: finalType,
      categoryId: categoryId,
      date: c.occurredAt,
      merchant: c.merchant,
      accountId: account,
      source: c.source.key,
      captureId: c.id,
    );
    final decided = c.copyWith(
      status: edited ? CaptureStatus.editedApproved : CaptureStatus.approved,
      type: finalType,
      finalAmount: edited ? finalAmount : null,
      categoryId: categoryId,
      accountId: account,
      decidedAt: _clock(),
      postedTxnId: txnId,
    );
    await _repo.save(decided);

    final merchant = c.merchant;
    if (merchant != null && merchant.isNotEmpty) {
      await _aliases.learn(_vaultId, merchant, categoryId);
    }
    if (rememberAccount && account != null && c.accountLast4 != null) {
      await linkSuffix(c, account);
    }
    return decided;
  }

  /// Remembers "this suffix is that account", and fills it in on every capture
  /// already waiting with the same digits and account family.
  Future<void> linkSuffix(PendingCapture c, String accountId) async {
    final last4 = c.accountLast4;
    if (last4 == null) return;
    await _links.save(CaptureAccountLink(
      id: _uuid.v4(),
      vaultId: _vaultId,
      profileId: c.profileId ?? '',
      last4: last4,
      instrument: c.instrument,
      accountId: accountId,
      createdAt: _clock(),
    ));
    final matcher = CaptureAccountMatcher(await _links.getAll(_vaultId));
    for (final other in await _repo.pendingForSuffix(_vaultId, last4)) {
      if (other.id == c.id || other.accountId != null) continue;
      final match = matcher.match(
          profileId: other.profileId, last4: last4, instrument: other.instrument);
      if (match == null) continue;
      await _repo.save(other.copyWith(
        accountId: match,
        reasons: other.reasons.where((r) => r != ReviewReason.unknownAccount).toList(),
      ));
    }
  }

  /// Not a real transaction (or not one to record). Removes any entry it had.
  Future<PendingCapture> reject(PendingCapture c) async {
    if (c.postedTxnId != null) await _poster.remove(c.postedTxnId!);
    final decided = c.copyWith(
        status: CaptureStatus.rejected, decidedAt: _clock(), clearPostedTxnId: true);
    await _repo.save(decided);
    return decided;
  }

  /// Takes back an automatic (or approved) add: the entry leaves the ledger and
  /// the capture returns to the inbox, where it can be fixed and approved or
  /// rejected. Nothing is lost — the capture row is the history.
  Future<PendingCapture> undo(PendingCapture c) async {
    if (c.postedTxnId != null) await _poster.remove(c.postedTxnId!);
    final reopened = c.copyWith(
      status: CaptureStatus.pending,
      reasons: [ReviewReason.undone, ...c.reasons.where((r) => r != ReviewReason.undone)],
      clearPostedTxnId: true,
      clearDecidedAt: true,
      clearFinalAmount: true,
    );
    await _repo.save(reopened);
    return reopened;
  }
}
