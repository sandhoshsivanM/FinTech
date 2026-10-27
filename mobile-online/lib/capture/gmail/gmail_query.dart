// Builds the Gmail search that finds bank and UPI alert emails. Only mail from
// these senders is ever fetched; nothing else in the mailbox is read.

/// Sender domains of bank and UPI alert mail. A domain, not a full address, so
/// "alerts@", "credit_cards@" and "noreply@" variants all match.
const defaultAlertSenders = <String>[
  'hdfcbank.net',
  'hdfcbank.com',
  'icicibank.com',
  'sbi.co.in',
  'axisbank.com',
  'kotak.com',
  'yesbank.in',
  'idfcfirstbank.com',
  'indusind.com',
  'paytm.com',
  'phonepe.com',
];

final _domain = RegExp(r'^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$');

/// `(from:a OR from:b) after:<epoch seconds>`. [after] is exclusive and in UTC
/// seconds, the form Gmail accepts. Entries that are not plain domains are
/// dropped, so a config mistake cannot widen the search or inject operators.
String buildAlertQuery({required DateTime after, List<String> senders = defaultAlertSenders}) {
  final clean = [for (final s in senders) if (_domain.hasMatch(s.trim().toLowerCase())) s.trim().toLowerCase()];
  if (clean.isEmpty) throw ArgumentError('No valid sender domains');
  final from = clean.map((d) => 'from:$d').join(' OR ');
  return '($from) after:${after.toUtc().millisecondsSinceEpoch ~/ 1000}';
}
