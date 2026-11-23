import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/data/database/app_database.dart';
import 'package:khazana/data/repositories/drift_sip_repository.dart';
import 'package:khazana_domain/entities/asset_group.dart';
import 'package:sqlite3/sqlite3.dart' as sql;

/// The v8 → v9 upgrade on a real file. As in migration_v7_test, a v8 file is
/// built by opening a current database, writing data, then dropping what v9
/// added and winding `user_version` back.
void main() {
  late Directory dir;
  late File file;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('khazana_mig9_');
    file = File('${dir.path}/vault.db');
  });
  tearDown(() => dir.deleteSync(recursive: true));

  const v9Tables = ['allocation_targets', 'sip_plans', 'sip_instalments'];

  Set<String> tables(sql.Database db) => db
      .select("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r['name'] as String)
      .toSet();

  test('upgrading adds the SIP tables and keeps existing rows', () async {
    final seed = AppDatabase(NativeDatabase(file));
    await seed.customStatement(
        "INSERT INTO instruments (id, vault_id, kind, name, created_at) "
        "VALUES ('i1', 'v1', 'equity_mf', 'PPFAS', 1)");
    await seed.close();

    final raw = sql.sqlite3.open(file.path);
    for (final t in v9Tables.reversed) {
      raw.execute('DROP TABLE $t');
    }
    raw.execute('PRAGMA user_version = 8');
    expect(tables(raw).intersection(v9Tables.toSet()), isEmpty,
        reason: 'the seed must really look like v8');
    raw.dispose();

    final db = AppDatabase(NativeDatabase(file));
    final repo = DriftSipRepository(db.sipDao);
    await repo.saveTargets('v1', {AssetGroup.equity: 70, AssetGroup.debt: 30});
    expect(await repo.targets('v1'),
        {AssetGroup.equity: 70, AssetGroup.debt: 30});
    final instruments = await db.select(db.instruments).get();
    expect(instruments.single.name, 'PPFAS');
    await db.close();

    final after = sql.sqlite3.open(file.path);
    expect(tables(after), containsAll(v9Tables));
    expect(after.select('PRAGMA user_version').single.values.single, 9);
    after.dispose();
  });
}
