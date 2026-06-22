import 'package:decimal/decimal.dart';
import 'package:drift/drift.dart';

/// Stores monetary [Decimal] values as SQLite TEXT (PRD §2: double is banned;
/// PRD pitfall: never REAL). Numeric aggregation/sorting is done in Dart, not
/// lexicographically in SQL.
class DecimalConverter extends TypeConverter<Decimal, String> {
  const DecimalConverter();

  @override
  Decimal fromSql(String fromDb) => Decimal.parse(fromDb);

  @override
  String toSql(Decimal value) => value.toString();
}
