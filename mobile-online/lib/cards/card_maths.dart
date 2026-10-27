// Credit-card maths for Khazana Online. Pure Dart, no clock and no storage, and
// the same rules (and tests) as webapp-online/src/lib/cards.ts. Money is whole
// paise so nothing rounds by accident.

enum Tone { ok, warn, bad, quiet }

const networks = ['Visa', 'Mastercard', 'RuPay', 'Amex'];
const goodUtilisation = 30;

/// A credit card. Never the full number, expiry or CVV: only the last 4
/// digits, to match bank alerts.
class CreditCard {
  const CreditCard({
    required this.id,
    required this.name,
    required this.network,
    required this.last4,
    required this.limitPaise,
    required this.statementDay,
    required this.dueDay,
  });
  final String id;
  final String name;
  final String network;
  final String last4;
  final int limitPaise;
  final int statementDay;
  final int dueDay;

  CreditCard copyWith({
    String? name,
    String? network,
    String? last4,
    int? limitPaise,
    int? statementDay,
    int? dueDay,
  }) => CreditCard(
    id: id,
    name: name ?? this.name,
    network: network ?? this.network,
    last4: last4 ?? this.last4,
    limitPaise: limitPaise ?? this.limitPaise,
    statementDay: statementDay ?? this.statementDay,
    dueDay: dueDay ?? this.dueDay,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'network': network,
    'last4': last4,
    'limitPaise': limitPaise,
    'statementDay': statementDay,
    'dueDay': dueDay,
  };

  factory CreditCard.fromJson(Map<String, dynamic> j) => CreditCard(
    id: j['id'] as String,
    name: j['name'] as String,
    network: j['network'] as String,
    last4: j['last4'] as String,
    limitPaise: j['limitPaise'] as int,
    statementDay: j['statementDay'] as int,
    dueDay: j['dueDay'] as int,
  );
}

/// A transaction as the cards screen needs it. [last4] is the card or account
/// the bank alert named; cards match on it, on this device.
class CardTxn {
  const CardTxn({
    required this.id,
    required this.date,
    required this.paise,
    required this.isExpense,
    required this.note,
    this.last4,
  });
  final String id;
  final DateTime date;
  final int paise;
  final bool isExpense;
  final String note;
  final String? last4;
}

Tone utilisationTone(int pct) =>
    pct <= 30 ? Tone.ok : (pct <= 60 ? Tone.warn : Tone.bad);

int utilisationPct(int owedPaise, int limitPaise) =>
    limitPaise <= 0 ? 0 : (owedPaise * 200 + limitPaise) ~/ (limitPaise * 2);

String inr(int paise) {
  final rupees = (paise / 100).round();
  final neg = rupees < 0;
  final s = rupees.abs().toString();
  var out = s;
  if (s.length > 3) {
    final head = s.substring(0, s.length - 3);
    final groups = <String>[];
    for (var i = head.length; i > 0; i -= 2) {
      groups.insert(0, head.substring(i - 2 < 0 ? 0 : i - 2, i));
    }
    out = '${groups.join(',')},${s.substring(s.length - 3)}';
  }
  return '${neg ? '−' : ''}₹$out';
}

String advice(int owedPaise, int limitPaise) {
  if (utilisationPct(owedPaise, limitPaise) <= goodUtilisation) {
    return 'Under 30% of the limit. This is the range that helps a credit score.';
  }
  final payRupees = (owedPaise * 10 - limitPaise * 3 + 500) ~/ 1000;
  return 'Above the 30% mark (the line). Paying ${inr(payRupees * 100)} before the bill date brings it under.';
}

DateTime _dayOf(int year, int month, int day) {
  final last = DateTime(
    year,
    month + 1,
    0,
  ).day; // month may be 0 or 13: Dart normalises.
  return DateTime(year, month, day < last ? day : last);
}

int _daysBetween(DateTime a, DateTime b) => DateTime.utc(
  b.year,
  b.month,
  b.day,
).difference(DateTime.utc(a.year, a.month, a.day)).inDays;

class Cycle {
  const Cycle(this.statement, this.due, this.daysToDue, this.cyclePct);
  final DateTime statement;
  final DateTime due;
  final int daysToDue;
  final int cyclePct;
}

/// The latest statement date on or before today and the first due date after
/// it. A statement day still ahead this month belongs to last month's cycle.
Cycle cycleFor(int statementDay, int dueDay, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  var statement = _dayOf(today.year, today.month, statementDay);
  if (statement.isAfter(today)) {
    statement = _dayOf(today.year, today.month - 1, statementDay);
  }
  var due = _dayOf(statement.year, statement.month, dueDay);
  if (!due.isAfter(statement)) {
    due = _dayOf(statement.year, statement.month + 1, dueDay);
  }
  final span = _daysBetween(statement, due);
  final pct = ((_daysBetween(statement, today) / span) * 100).round().clamp(
    0,
    100,
  );
  return Cycle(statement, due, _daysBetween(today, due), pct);
}

String dueText(int days) => days < 0
    ? 'Overdue'
    : (days == 0 ? 'Due today' : 'Due in $days ${days == 1 ? 'day' : 'days'}');

/// bad within 3 days (or overdue), warn within 7, otherwise quiet.
Tone dueTone(int days) =>
    days <= 3 ? Tone.bad : (days <= 7 ? Tone.warn : Tone.quiet);

List<CardTxn> cardTxns(CreditCard card, List<CardTxn> txns) => [
  for (final t in txns)
    if (t.last4 == card.last4) t,
];

int _net(Iterable<CardTxn> ts) =>
    ts.fold(0, (s, t) => t.isExpense ? s + t.paise : s - t.paise);

/// Spending minus payments and refunds on the card, never below zero.
int owedOn(CreditCard card, List<CardTxn> txns) {
  final v = _net(cardTxns(card, txns));
  return v < 0 ? 0 : v;
}

/// What the last statement billed: after the previous statement date, up to the statement date.
int billedOn(CreditCard card, List<CardTxn> txns, Cycle cycle) {
  final from = _dayOf(
    cycle.statement.year,
    cycle.statement.month - 1,
    card.statementDay,
  );
  final v = _net(
    cardTxns(card, txns).where((t) {
      final d = DateTime(t.date.year, t.date.month, t.date.day);
      return d.isAfter(from) && !d.isAfter(cycle.statement);
    }),
  );
  return v < 0 ? 0 : v;
}

class CardView {
  CardView(this.card, this.owed, this.billed, this.cycle, this.txns);
  final CreditCard card;
  final int owed;
  final int billed;
  final Cycle cycle;
  final List<CardTxn> txns;
  int get limit => card.limitPaise;
  int get available => limit - owed;
  int get pct => utilisationPct(owed, limit);
  Tone get tone => utilisationTone(pct);
}

CardView viewOf(CreditCard card, List<CardTxn> txns, DateTime now) {
  final cycle = cycleFor(card.statementDay, card.dueDay, now);
  final mine = cardTxns(card, txns)..sort((a, b) => b.date.compareTo(a.date));
  return CardView(
    card,
    owedOn(card, txns),
    billedOn(card, txns, cycle),
    cycle,
    mine.take(8).toList(),
  );
}

({int owed, int limit, int pct}) totals(List<CardView> views) {
  final owed = views.fold(0, (s, v) => s + v.owed);
  final limit = views.fold(0, (s, v) => s + v.limit);
  return (owed: owed, limit: limit, pct: utilisationPct(owed, limit));
}

class CardForm {
  const CardForm({
    this.name = '',
    this.network = 'Visa',
    this.last4 = '',
    this.limit = '',
    this.statementDay = '',
    this.dueDay = '',
  });
  final String name, network, last4, limit, statementDay, dueDay;
}

class CardInput {
  const CardInput(
    this.name,
    this.network,
    this.last4,
    this.limitPaise,
    this.statementDay,
    this.dueDay,
  );
  final String name, network, last4;
  final int limitPaise, statementDay, dueDay;
}

/// Field errors (empty when the form is fine) and the clean value.
({Map<String, String> errors, CardInput? value}) validateCard(CardForm f) {
  final errors = <String, String>{};
  final name = f.name.trim();
  if (name.isEmpty) {
    errors['name'] = 'Give the card a name.';
  }
  if (!networks.contains(f.network)) {
    errors['network'] = 'Pick a network.';
  }
  if (!RegExp(r'^\d{4}$').hasMatch(f.last4)) {
    errors['last4'] = 'Enter exactly 4 digits.';
  }
  final limit = parsePaise(f.limit);
  if (limit == null || limit <= 0) {
    errors['limit'] = 'Enter a limit above zero.';
  }
  int? day(String s) {
    final t = s.trim();
    if (!RegExp(r'^\d{1,2}$').hasMatch(t)) return null;
    final n = int.parse(t);
    return n >= 1 && n <= 31 ? n : null;
  }

  final st = day(f.statementDay), due = day(f.dueDay);
  if (st == null) {
    errors['statementDay'] = 'A day from 1 to 31.';
  }
  if (due == null) {
    errors['dueDay'] = 'A day from 1 to 31.';
  }
  if (errors.isNotEmpty) return (errors: errors, value: null);
  return (
    errors: errors,
    value: CardInput(name, f.network, f.last4, limit!, st!, due!),
  );
}

/// "₹1,00,000.50" to paise, or null when it isn't an amount.
int? parsePaise(String s) {
  final t = s.replaceAll(RegExp(r'[₹,\s]'), '');
  final m = RegExp(r'^(\d+)(?:\.(\d{1,2}))?$').firstMatch(t);
  if (m == null) return null;
  return int.parse(m.group(1)!) * 100 +
      int.parse((m.group(2) ?? '').padRight(2, '0'));
}
