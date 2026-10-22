import 'package:decimal/decimal.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_merchant_alias_repository.dart';
import 'package:khazana/data/repositories/drift_pending_capture_repository.dart';
import 'package:khazana/data/repositories/drift_transaction_repository.dart';
import 'package:khazana_domain/entities/pending_capture.dart';
import 'package:khazana_domain/entities/transaction.dart';
import 'package:khazana/features/capture/services/capture_channel.dart';
import 'package:khazana/features/capture/services/capture_pipeline.dart';

/// Writes real ledger rows, so the pipeline's own reads (nearby entries,
/// account history) see what it posted — the same loop the app runs.
class _RecordingPoster implements CapturePoster {
  _RecordingPoster(this._txns);
  final DriftTransactionRepository _txns;
  final posted = <String>[];
  final removed = <String>[];
  var _seq = 0;

  @override
  Future<String> post({
    required Decimal amount,
    required TxnType type,
    required String categoryId,
    required DateTime date,
    String? merchant,
    String? accountId,
    required String source,
    required String captureId,
  }) async {
    final id = 'txn${++_seq}';
    await _txns.save(Txn(
      id: id, vaultId: 'v1', amount: amount, type: type, categoryId: categoryId,
      date: date, merchant: merchant, createdAt: date, accountId: accountId,
      source: source, captureId: captureId,
    ));
    posted.add(id);
    return id;
  }

  @override
  Future<void> remove(String txnId) async {
    await _txns.delete(txnId);
    removed.add(txnId);
  }
}

void main() {
  late AppDatabase db;
  late DriftPendingCaptureRepository captures;
  late DriftCaptureAccountLinkRepository links;
  late DriftMerchantAliasRepository aliases;
  late DriftTransactionRepository txns;
  late _RecordingPoster poster;
  late CapturePipeline pipeline;
  late CaptureReviewService review;
  var alwaysReview = false;
  final now = DateTime(2026, 1, 20, 12);

  CapturedMessage sms(String text, {String sender = 'VM-HDFCBK'}) => CapturedMessage(
      text: text, sender: sender, source: CaptureSource.notification, postedAt: now);

  // Two alerts from the same linked account, the second continuing the first's
  // balance chain (10,000 − 250 = 9,750).
  const upiSwiggy =
      'Sent Rs.250.00 from HDFC Bank A/C *1234 to swiggy@icici on 15/01/26. Ref 412345678901. Avl Bal Rs 10,000.00';
  const upiSwiggyAgain =
      'Sent Rs.250.00 from HDFC Bank A/C *1234 to swiggy@icici on 16/01/26. Ref 412345678902. Avl Bal Rs 9,750.00';

  setUp(() async {
    db = AppDatabase(NativeDatabase.memory());
    await db.customStatement(
        "INSERT INTO categories (id, vault_id, name) VALUES ('cat-food', 'v1', 'Food')");
    captures = DriftPendingCaptureRepository(db.pendingCaptureDao);
    links = DriftCaptureAccountLinkRepository(db.pendingCaptureDao);
    aliases = DriftMerchantAliasRepository(db.merchantAliasDao);
    txns = DriftTransactionRepository(db.transactionDao);
    poster = _RecordingPoster(txns);
    alwaysReview = false;
    pipeline = CapturePipeline(
      repo: captures, links: links, aliases: aliases, transactions: txns,
      poster: poster, vaultId: 'v1', alwaysReview: () => alwaysReview, clock: () => now,
    );
    review = CaptureReviewService(
      repo: captures, links: links, aliases: aliases, poster: poster, vaultId: 'v1',
      clock: () => now,
    );
  });

  tearDown(() => db.close());

  test('a first alert from an unknown account waits for review', () async {
    final out = await pipeline.ingest(sms(upiSwiggy));
    expect(out.result, IngestResult.queued);
    expect(out.capture!.reasons,
        containsAll([ReviewReason.unknownAccount, ReviewReason.noCategory]));
    expect(poster.posted, isEmpty, reason: 'nothing reaches the ledger unasked');
  });

  test('approving teaches the account and category, so the next alert posts itself', () async {
    final first = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    await review.approve(first, categoryId: 'cat-food', accountId: 'acct-hdfc');
    expect(poster.posted, hasLength(1));

    final second = await pipeline.ingest(sms(upiSwiggyAgain));
    expect(second.result, IngestResult.autoPosted);
    expect(second.capture!.accountId, 'acct-hdfc');
    expect(second.capture!.categoryId, 'cat-food');
    expect(second.capture!.confidence, 100,
        reason: 'bank, account, category, merchant, reference and a consistent balance');
    final entry = await txns.getById(second.capture!.postedTxnId!);
    expect(entry!.accountId, 'acct-hdfc');
    expect(entry.captureId, second.capture!.id);
  });

  test('"always review" keeps even a perfect capture out of the ledger', () async {
    final first = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    await review.approve(first, categoryId: 'cat-food', accountId: 'acct-hdfc');
    alwaysReview = true;
    final second = await pipeline.ingest(sms(upiSwiggyAgain));
    expect(second.result, IngestResult.queued);
    expect(second.capture!.reasons.first, ReviewReason.alwaysReview);
  });

  test('editing the amount before approving records both values', () async {
    final c = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    final decided = await review.approve(c,
        categoryId: 'cat-food', accountId: 'acct-hdfc', amount: Decimal.parse('2500'));
    expect(decided.status, CaptureStatus.editedApproved);
    expect(decided.amount.toString(), '250', reason: 'what the parser read');
    expect(decided.finalAmount.toString(), '2500', reason: 'what the user confirmed');
    final entry = await txns.getById(decided.postedTxnId!);
    expect(entry!.amount.toString(), '2500');
  });

  test('a double tap on approve writes one entry, not two', () async {
    final c = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    final once = await review.approve(c, categoryId: 'cat-food', accountId: 'acct-hdfc');
    await review.approve(once, categoryId: 'cat-food', accountId: 'acct-hdfc');
    expect(poster.posted, hasLength(1));
  });

  test('undo takes the entry out of the ledger and puts the capture back in the inbox', () async {
    final first = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    await review.approve(first, categoryId: 'cat-food', accountId: 'acct-hdfc');
    final auto = (await pipeline.ingest(sms(upiSwiggyAgain))).capture!;

    final reopened = await review.undo(auto);
    expect(poster.removed, [auto.postedTxnId]);
    expect(await txns.getById(auto.postedTxnId!), isNull);
    expect(reopened.status, CaptureStatus.pending);
    expect(reopened.reasons.first, ReviewReason.undone);
    expect(reopened.postedTxnId, isNull);
  });

  test('reject records the decision and posts nothing', () async {
    final c = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    final decided = await review.reject(c);
    expect(decided.status, CaptureStatus.rejected);
    expect(poster.posted, isEmpty);
  });

  test('a re-delivered alert is not queued again — even after it was decided', () async {
    final c = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    await review.reject(c);
    final again = await pipeline.ingest(sms(upiSwiggy));
    expect(again.result, IngestResult.duplicate,
        reason: 'v1 deleted decided captures, so this came back as a new draft');
  });

  test('linking one capture fills in the others waiting with the same digits', () async {
    final a = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    final b = (await pipeline.ingest(sms(upiSwiggyAgain))).capture!;
    expect(b.reasons, contains(ReviewReason.unknownAccount));

    await review.approve(a, categoryId: 'cat-food', accountId: 'acct-hdfc');
    final updated = await captures.getById(b.id);
    expect(updated!.accountId, 'acct-hdfc');
    expect(updated.reasons, isNot(contains(ReviewReason.unknownAccount)));
  });

  test('both legs of a transfer between own accounts are kept, and flagged', () async {
    final out = await pipeline.ingest(sms(
        'Rs 5,000.00 debited from A/c XX1234 on 17-01-26 to A/c XX9999. IMPS Ref 512345678901'));
    final inLeg = await pipeline.ingest(sms(
        'Rs 5,000.00 credited to A/c XX9999 on 17-01-26 from A/c XX1234. IMPS Ref 512345678901'));
    expect(out.result, IngestResult.queued);
    expect(inLeg.result, IngestResult.queued, reason: 'same reference, other direction: not a duplicate');
    expect(inLeg.capture!.reasons, contains(ReviewReason.possibleTransfer));
  });

  test('a history import loads the ledger window once and handles every message', () async {
    final batch = [
      sms(upiSwiggy),
      sms('OTP 123456 for your login'),
      sms(upiSwiggy), // repeated inside the same batch
      sms(upiSwiggyAgain),
    ];
    final outcomes = await pipeline.ingestAll(batch);
    expect(outcomes.map((o) => o.result), [
      IngestResult.queued, IngestResult.ignored, IngestResult.duplicate, IngestResult.queued,
    ]);
  });

  test('old decided captures are purged; pending ones are never purged', () async {
    final pending = (await pipeline.ingest(sms(upiSwiggy))).capture!;
    final rejected = await review.reject((await pipeline.ingest(sms(upiSwiggyAgain))).capture!);
    final later = CapturePipeline(
      repo: captures, links: links, aliases: aliases, transactions: txns,
      poster: poster, vaultId: 'v1', clock: () => now.add(const Duration(days: 91)),
    );
    expect(await later.purgeOld(), 1);
    expect(await captures.getById(pending.id), isNotNull);
    expect(await captures.getById(rejected.id), isNull);
  });
}
