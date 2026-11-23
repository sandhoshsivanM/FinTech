import 'package:decimal/decimal.dart';

import '../entities/transaction.dart';

/// What kind of regular credit a group of income entries is.
enum RecurringIncomeKind {
  salary('Salary'),
  regular('Regular');

  const RecurringIncomeKind(this.label);

  /// The chip text shown on each entry in the group.
  final String label;
}

/// Income that arrives about once a month from the same payer for about the
/// same amount: a salary, rent received, a pension.
class RecurringIncome {
  const RecurringIncome({
    required this.payerKey,
    required this.kind,
    required this.typicalAmount,
    required this.expectedDay,
    required this.txnIds,
  });

  /// The normalised payer name the entries were grouped by.
  final String payerKey;
  final RecurringIncomeKind kind;

  /// The median amount of the matching entries.
  final Decimal typicalAmount;

  /// The median day of the month it lands on.
  final int expectedDay;

  /// The entries that belong to the pattern.
  final Set<String> txnIds;
}

/// Finds regular monthly income in [txns], largest first.
///
/// The twin of `packages/domain-ts/src/recurringIncome.ts`. Computed on the fly
/// from the ledger, so nothing is stored and an edit is reflected at once.
///
/// A payer's entries form a pattern when at least [minOccurrences] of them are
/// within ±10% of their median amount and every gap between those is a month
/// (25–35 days), or two months (55–65) when one month was missed. Freelance
/// income that varies more than that is left alone on purpose: calling it
/// regular would make a quiet month look like a missed salary.
List<RecurringIncome> detectRecurringIncome(
  Iterable<Txn> txns, {
  int minOccurrences = 3,
}) {
  final byPayer = <String, List<Txn>>{};
  for (final t in txns) {
    if (t.type != TxnType.income) continue;
    final key = payerKey(t.merchant);
    if (key.isEmpty) continue;
    (byPayer[key] ??= []).add(t);
  }

  final out = <RecurringIncome>[];
  byPayer.forEach((key, group) {
    if (group.length < minOccurrences) return;
    final median = _median([for (final t in group) t.amount]);
    final tolerance = median * Decimal.parse('0.1');
    final matching = [
      for (final t in group)
        if ((t.amount - median).abs() <= tolerance) t,
    ]..sort((a, b) => a.date.compareTo(b.date));
    if (matching.length < minOccurrences) return;
    for (var i = 1; i < matching.length; i++) {
      if (!_isMonthlyGap(_daysBetween(matching[i - 1].date, matching[i].date))) {
        return;
      }
    }
    final days = [for (final t in matching) t.date.day]..sort();
    out.add(RecurringIncome(
      payerKey: key,
      kind: _isSalary(key) ? RecurringIncomeKind.salary : RecurringIncomeKind.regular,
      typicalAmount: _median([for (final t in matching) t.amount]),
      expectedDay: days[(days.length - 1) ~/ 2],
      txnIds: {for (final t in matching) t.id},
    ));
  });
  out.sort((a, b) => b.typicalAmount.compareTo(a.typicalAmount));
  return out;
}

/// Entry id → chip label, for the ledger rows.
Map<String, RecurringIncomeKind> recurringIncomeById(
    Iterable<RecurringIncome> patterns) => {
      for (final p in patterns)
        for (final id in p.txnIds) id: p.kind,
    };

const _months = {
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
  'nov', 'dec', 'january', 'february', 'march', 'april', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
};
const _noise = {'neft', 'imps', 'rtgs', 'upi', 'by', 'from', 'ref', 'for', 'cr'};
const _salaryWords = {'salary', 'sal', 'payroll', 'wages', 'stipend'};

/// A payer name with the parts that change every month removed, so
/// "ACME TECH SALARY JAN26" and "Acme Tech Salary Feb26" group together.
String payerKey(String? merchant) {
  if (merchant == null) return '';
  return merchant
      .toLowerCase()
      .split(RegExp(r'[^a-z@.]+'))
      .where((w) => w.isNotEmpty && !_months.contains(w) && !_noise.contains(w))
      .join(' ');
}

bool _isSalary(String key) => key.split(' ').any(_salaryWords.contains);

bool _isMonthlyGap(int days) =>
    (days >= 25 && days <= 35) || (days >= 55 && days <= 65);

/// Whole calendar days, counted in UTC so a DST change cannot shift it.
int _daysBetween(DateTime a, DateTime b) => DateTime.utc(b.year, b.month, b.day)
    .difference(DateTime.utc(a.year, a.month, a.day))
    .inDays;

/// The lower middle value, so the result is always one of the inputs.
Decimal _median(List<Decimal> values) {
  final sorted = [...values]..sort();
  return sorted[(sorted.length - 1) ~/ 2];
}
