import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/entities/capture_types.dart';
import 'package:khazana/domain/entities/transaction.dart';
import 'package:khazana/domain/repositories/pending_capture_repository.dart';
import 'package:khazana/domain/services/capture_account_matcher.dart';
import 'package:khazana/domain/services/capture_router.dart';

Decimal d(String s) => Decimal.parse(s);
final _at = DateTime(2026, 1, 15, 10);

/// A capture that clears every bar: recognised bank, linked account, learned
/// category, merchant, reference and a consistent balance chain.
RoutingFacts ideal({
  String amount = '150',
  TxnType type = TxnType.expense,
  CaptureKind kind = CaptureKind.spend,
  String? profileId = 'hdfc',
  String? merchant = 'cafe brew',
  String? utr = '412345678901',
  String? availableBalance = '9850',
  String? previousBalance = '10000',
  String? accountId = 'acct-hdfc',
  String? categoryId = 'cat-food',
  List<Decimal> recentAmounts = const [],
  List<Txn> nearby = const [],
  bool oppositeLeg = false,
  bool alwaysReview = false,
}) =>
    RoutingFacts(
      amount: d(amount),
      type: type,
      kind: kind,
      occurredAt: _at,
      profileId: profileId,
      merchant: merchant,
      utr: utr,
      availableBalance: availableBalance == null ? null : d(availableBalance),
      previousBalance: previousBalance == null ? null : d(previousBalance),
      accountId: accountId,
      categoryId: categoryId,
      recentAmounts: recentAmounts,
      nearbyTransactions: nearby,
      oppositeLegExists: oppositeLeg,
      alwaysReview: alwaysReview,
    );

Txn manualTxn(String amount, DateTime date, {String? captureId}) => Txn(
      id: 't-$amount-${date.day}',
      vaultId: 'v',
      amount: d(amount),
      type: TxnType.expense,
      categoryId: 'c',
      date: date,
      createdAt: date,
      captureId: captureId,
    );

void main() {
  const router = CaptureRouter();

  group('auto-post', () {
    test('a capture that clears every bar is posted at full confidence', () {
      final r = router.decide(ideal());
      expect(r.autoPost, isTrue);
      expect(r.confidence, 100);
      expect(r.reasons, isEmpty);
    });

    test('bank + account + category + merchant alone reach the threshold', () {
      final r = router.decide(ideal(utr: null, availableBalance: null));
      expect(r.confidence, CaptureRouter.autoPostThreshold);
      expect(r.autoPost, isTrue);
    });

    test('one point short of the threshold goes to review as low confidence', () {
      final r = router.decide(ideal(utr: null, availableBalance: null, merchant: null));
      expect(r.autoPost, isFalse);
      expect(r.reasons.first, ReviewReason.lowConfidence);
      expect(r.reasons, contains(ReviewReason.noMerchant));
    });
  });

  group('forced review — a perfect parse is still not enough', () {
    final cases = <String, (RoutingFacts, ReviewReason)>{
      'no linked account': (ideal(accountId: null), ReviewReason.unknownAccount),
      'no learned category': (ideal(categoryId: null), ReviewReason.noCategory),
      'refund': (ideal(type: TxnType.income, kind: CaptureKind.refund,
          previousBalance: '9700'), ReviewReason.refund),
      'card bill payment': (ideal(type: TxnType.income, kind: CaptureKind.cardBillPayment,
          previousBalance: '9700'), ReviewReason.cardBillPayment),
      'other leg of a transfer': (ideal(oppositeLeg: true), ReviewReason.possibleTransfer),
      'balance chain broken': (ideal(previousBalance: '12000'), ReviewReason.balanceMismatch),
      'user chose always-review': (ideal(alwaysReview: true), ReviewReason.alwaysReview),
    };
    for (final e in cases.entries) {
      test(e.key, () {
        final r = router.decide(e.value.$1);
        expect(r.autoPost, isFalse);
        expect(r.reasons, contains(e.value.$2));
        expect(r.reasons, isNot(contains(ReviewReason.lowConfidence)),
            reason: 'a forced reason explains itself; "low confidence" would mislead');
      });
    }

    test('always-review is listed first, so the inbox explains the real cause', () {
      final r = router.decide(ideal(alwaysReview: true, accountId: null));
      expect(r.reasons.first, ReviewReason.alwaysReview);
    });
  });

  group('balance chain', () {
    test('debit: previous minus amount', () {
      expect(CaptureRouter.balanceCheck(ideal()), isTrue);
    });
    test('credit: previous plus amount', () {
      expect(
          CaptureRouter.balanceCheck(
              ideal(type: TxnType.income, previousBalance: '9700', availableBalance: '9850')),
          isTrue);
    });
    test('unknown when either side is missing', () {
      expect(CaptureRouter.balanceCheck(ideal(previousBalance: null)), isNull);
      expect(CaptureRouter.balanceCheck(ideal(availableBalance: null)), isNull);
    });
    test('a misread amount breaks the chain', () {
      // Parsed ₹1,000 but the balance only fell by ₹10,000 — or the reverse.
      expect(CaptureRouter.balanceCheck(ideal(amount: '1000', availableBalance: '0')), isFalse);
    });
  });

  group('unusual amount', () {
    final usual = [for (var i = 1; i <= 20; i++) d('${i * 100}')]; // 100..2000

    test('needs enough history to know what "usual" is', () {
      expect(CaptureRouter.isUnusual(d('1000000'), [d('100'), d('200')]), isFalse);
    });
    test('within 3x of the 95th percentile is usual', () {
      expect(CaptureRouter.isUnusual(d('6000'), usual), isFalse);
    });
    test('beyond it is unusual and forces review', () {
      expect(CaptureRouter.isUnusual(d('6001'), usual), isTrue);
      final r = router.decide(ideal(amount: '6001', availableBalance: null, recentAmounts: usual));
      expect(r.reasons, contains(ReviewReason.unusualAmount));
    });
    test('the input list is not reordered as a side effect', () {
      final history = [d('300'), d('100'), d('200'), d('500'), d('400')];
      CaptureRouter.isUnusual(d('1'), history);
      expect(history.map((x) => x.toString()), ['300', '100', '200', '500', '400']);
    });
  });

  group('typed by hand', () {
    test('a manual entry of the same amount within two days is a likely duplicate', () {
      final r = router.decide(ideal(nearby: [manualTxn('150', _at.subtract(const Duration(days: 1)))]));
      expect(r.reasons, contains(ReviewReason.possibleDuplicate));
    });
    test('outside the window, or a different amount, is not', () {
      expect(CaptureRouter.looksTypedByHand(ideal(nearby: [manualTxn('150', _at.subtract(const Duration(days: 3)))])), isFalse);
      expect(CaptureRouter.looksTypedByHand(ideal(nearby: [manualTxn('151', _at)])), isFalse);
    });
    test('an entry auto-capture wrote itself does not count', () {
      expect(CaptureRouter.looksTypedByHand(ideal(nearby: [manualTxn('150', _at, captureId: 'p1')])), isFalse);
    });
  });

  group('account matcher', () {
    CaptureAccountLink link(String profile, String last4, CaptureInstrument i, String acct) =>
        CaptureAccountLink(id: '$profile$last4${i.key}', vaultId: 'v', profileId: profile,
            last4: last4, instrument: i, accountId: acct, createdAt: _at);

    final matcher = CaptureAccountMatcher([
      link('hdfc', '1234', CaptureInstrument.account, 'savings'),
      link('hdfc', '1234', CaptureInstrument.creditCard, 'card'),
      link('', '9999', CaptureInstrument.account, 'bankless'),
    ]);

    test('a UPI alert lands on the linked bank account', () {
      expect(matcher.match(profileId: 'hdfc', last4: '1234', instrument: CaptureInstrument.upi), 'savings');
    });
    test('the same digits on a credit card are a different account', () {
      expect(matcher.match(profileId: 'hdfc', last4: '1234', instrument: CaptureInstrument.creditCard), 'card');
    });
    test('a debit card is not assumed to be its bank account', () {
      expect(matcher.match(profileId: 'hdfc', last4: '1234', instrument: CaptureInstrument.debitCard), isNull);
    });
    test('a bank-less link answers for any bank with that suffix', () {
      expect(matcher.match(profileId: 'sbi', last4: '9999', instrument: CaptureInstrument.account), 'bankless');
    });
    test('no digits, no match', () {
      expect(matcher.match(profileId: 'hdfc', last4: null, instrument: CaptureInstrument.account), isNull);
    });
  });
}
