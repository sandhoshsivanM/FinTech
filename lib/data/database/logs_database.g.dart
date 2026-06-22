// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'logs_database.dart';

// ignore_for_file: type=lint
class $LogsTable extends Logs with TableInfo<$LogsTable, LogRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LogsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      hasAutoIncrement: true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
  static const VerificationMeta _levelMeta = const VerificationMeta('level');
  @override
  late final GeneratedColumn<String> level = GeneratedColumn<String>(
      'level', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _tagMeta = const VerificationMeta('tag');
  @override
  late final GeneratedColumn<String> tag = GeneratedColumn<String>(
      'tag', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _messageMeta =
      const VerificationMeta('message');
  @override
  late final GeneratedColumn<String> message = GeneratedColumn<String>(
      'message', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _stackTraceMeta =
      const VerificationMeta('stackTrace');
  @override
  late final GeneratedColumn<String> stackTrace = GeneratedColumn<String>(
      'stack_trace', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _appVersionMeta =
      const VerificationMeta('appVersion');
  @override
  late final GeneratedColumn<String> appVersion = GeneratedColumn<String>(
      'app_version', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _deviceModelMeta =
      const VerificationMeta('deviceModel');
  @override
  late final GeneratedColumn<String> deviceModel = GeneratedColumn<String>(
      'device_model', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _osVersionMeta =
      const VerificationMeta('osVersion');
  @override
  late final GeneratedColumn<String> osVersion = GeneratedColumn<String>(
      'os_version', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _timestampMeta =
      const VerificationMeta('timestamp');
  @override
  late final GeneratedColumn<int> timestamp = GeneratedColumn<int>(
      'timestamp', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        level,
        tag,
        message,
        stackTrace,
        vaultId,
        appVersion,
        deviceModel,
        osVersion,
        timestamp
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'logs';
  @override
  VerificationContext validateIntegrity(Insertable<LogRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('level')) {
      context.handle(
          _levelMeta, level.isAcceptableOrUnknown(data['level']!, _levelMeta));
    } else if (isInserting) {
      context.missing(_levelMeta);
    }
    if (data.containsKey('tag')) {
      context.handle(
          _tagMeta, tag.isAcceptableOrUnknown(data['tag']!, _tagMeta));
    } else if (isInserting) {
      context.missing(_tagMeta);
    }
    if (data.containsKey('message')) {
      context.handle(_messageMeta,
          message.isAcceptableOrUnknown(data['message']!, _messageMeta));
    } else if (isInserting) {
      context.missing(_messageMeta);
    }
    if (data.containsKey('stack_trace')) {
      context.handle(
          _stackTraceMeta,
          stackTrace.isAcceptableOrUnknown(
              data['stack_trace']!, _stackTraceMeta));
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    }
    if (data.containsKey('app_version')) {
      context.handle(
          _appVersionMeta,
          appVersion.isAcceptableOrUnknown(
              data['app_version']!, _appVersionMeta));
    } else if (isInserting) {
      context.missing(_appVersionMeta);
    }
    if (data.containsKey('device_model')) {
      context.handle(
          _deviceModelMeta,
          deviceModel.isAcceptableOrUnknown(
              data['device_model']!, _deviceModelMeta));
    } else if (isInserting) {
      context.missing(_deviceModelMeta);
    }
    if (data.containsKey('os_version')) {
      context.handle(_osVersionMeta,
          osVersion.isAcceptableOrUnknown(data['os_version']!, _osVersionMeta));
    } else if (isInserting) {
      context.missing(_osVersionMeta);
    }
    if (data.containsKey('timestamp')) {
      context.handle(_timestampMeta,
          timestamp.isAcceptableOrUnknown(data['timestamp']!, _timestampMeta));
    } else if (isInserting) {
      context.missing(_timestampMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LogRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LogRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      level: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}level'])!,
      tag: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}tag'])!,
      message: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}message'])!,
      stackTrace: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}stack_trace']),
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id']),
      appVersion: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}app_version'])!,
      deviceModel: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}device_model'])!,
      osVersion: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}os_version'])!,
      timestamp: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}timestamp'])!,
    );
  }

  @override
  $LogsTable createAlias(String alias) {
    return $LogsTable(attachedDatabase, alias);
  }
}

class LogRow extends DataClass implements Insertable<LogRow> {
  final int id;

  /// ENUM: debug | info | warn | error | fatal.
  final String level;
  final String tag;
  final String message;
  final String? stackTrace;
  final String? vaultId;
  final String appVersion;
  final String deviceModel;
  final String osVersion;
  final int timestamp;
  const LogRow(
      {required this.id,
      required this.level,
      required this.tag,
      required this.message,
      this.stackTrace,
      this.vaultId,
      required this.appVersion,
      required this.deviceModel,
      required this.osVersion,
      required this.timestamp});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['level'] = Variable<String>(level);
    map['tag'] = Variable<String>(tag);
    map['message'] = Variable<String>(message);
    if (!nullToAbsent || stackTrace != null) {
      map['stack_trace'] = Variable<String>(stackTrace);
    }
    if (!nullToAbsent || vaultId != null) {
      map['vault_id'] = Variable<String>(vaultId);
    }
    map['app_version'] = Variable<String>(appVersion);
    map['device_model'] = Variable<String>(deviceModel);
    map['os_version'] = Variable<String>(osVersion);
    map['timestamp'] = Variable<int>(timestamp);
    return map;
  }

  LogsCompanion toCompanion(bool nullToAbsent) {
    return LogsCompanion(
      id: Value(id),
      level: Value(level),
      tag: Value(tag),
      message: Value(message),
      stackTrace: stackTrace == null && nullToAbsent
          ? const Value.absent()
          : Value(stackTrace),
      vaultId: vaultId == null && nullToAbsent
          ? const Value.absent()
          : Value(vaultId),
      appVersion: Value(appVersion),
      deviceModel: Value(deviceModel),
      osVersion: Value(osVersion),
      timestamp: Value(timestamp),
    );
  }

  factory LogRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LogRow(
      id: serializer.fromJson<int>(json['id']),
      level: serializer.fromJson<String>(json['level']),
      tag: serializer.fromJson<String>(json['tag']),
      message: serializer.fromJson<String>(json['message']),
      stackTrace: serializer.fromJson<String?>(json['stackTrace']),
      vaultId: serializer.fromJson<String?>(json['vaultId']),
      appVersion: serializer.fromJson<String>(json['appVersion']),
      deviceModel: serializer.fromJson<String>(json['deviceModel']),
      osVersion: serializer.fromJson<String>(json['osVersion']),
      timestamp: serializer.fromJson<int>(json['timestamp']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'level': serializer.toJson<String>(level),
      'tag': serializer.toJson<String>(tag),
      'message': serializer.toJson<String>(message),
      'stackTrace': serializer.toJson<String?>(stackTrace),
      'vaultId': serializer.toJson<String?>(vaultId),
      'appVersion': serializer.toJson<String>(appVersion),
      'deviceModel': serializer.toJson<String>(deviceModel),
      'osVersion': serializer.toJson<String>(osVersion),
      'timestamp': serializer.toJson<int>(timestamp),
    };
  }

  LogRow copyWith(
          {int? id,
          String? level,
          String? tag,
          String? message,
          Value<String?> stackTrace = const Value.absent(),
          Value<String?> vaultId = const Value.absent(),
          String? appVersion,
          String? deviceModel,
          String? osVersion,
          int? timestamp}) =>
      LogRow(
        id: id ?? this.id,
        level: level ?? this.level,
        tag: tag ?? this.tag,
        message: message ?? this.message,
        stackTrace: stackTrace.present ? stackTrace.value : this.stackTrace,
        vaultId: vaultId.present ? vaultId.value : this.vaultId,
        appVersion: appVersion ?? this.appVersion,
        deviceModel: deviceModel ?? this.deviceModel,
        osVersion: osVersion ?? this.osVersion,
        timestamp: timestamp ?? this.timestamp,
      );
  LogRow copyWithCompanion(LogsCompanion data) {
    return LogRow(
      id: data.id.present ? data.id.value : this.id,
      level: data.level.present ? data.level.value : this.level,
      tag: data.tag.present ? data.tag.value : this.tag,
      message: data.message.present ? data.message.value : this.message,
      stackTrace:
          data.stackTrace.present ? data.stackTrace.value : this.stackTrace,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      appVersion:
          data.appVersion.present ? data.appVersion.value : this.appVersion,
      deviceModel:
          data.deviceModel.present ? data.deviceModel.value : this.deviceModel,
      osVersion: data.osVersion.present ? data.osVersion.value : this.osVersion,
      timestamp: data.timestamp.present ? data.timestamp.value : this.timestamp,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LogRow(')
          ..write('id: $id, ')
          ..write('level: $level, ')
          ..write('tag: $tag, ')
          ..write('message: $message, ')
          ..write('stackTrace: $stackTrace, ')
          ..write('vaultId: $vaultId, ')
          ..write('appVersion: $appVersion, ')
          ..write('deviceModel: $deviceModel, ')
          ..write('osVersion: $osVersion, ')
          ..write('timestamp: $timestamp')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, level, tag, message, stackTrace, vaultId,
      appVersion, deviceModel, osVersion, timestamp);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LogRow &&
          other.id == this.id &&
          other.level == this.level &&
          other.tag == this.tag &&
          other.message == this.message &&
          other.stackTrace == this.stackTrace &&
          other.vaultId == this.vaultId &&
          other.appVersion == this.appVersion &&
          other.deviceModel == this.deviceModel &&
          other.osVersion == this.osVersion &&
          other.timestamp == this.timestamp);
}

class LogsCompanion extends UpdateCompanion<LogRow> {
  final Value<int> id;
  final Value<String> level;
  final Value<String> tag;
  final Value<String> message;
  final Value<String?> stackTrace;
  final Value<String?> vaultId;
  final Value<String> appVersion;
  final Value<String> deviceModel;
  final Value<String> osVersion;
  final Value<int> timestamp;
  const LogsCompanion({
    this.id = const Value.absent(),
    this.level = const Value.absent(),
    this.tag = const Value.absent(),
    this.message = const Value.absent(),
    this.stackTrace = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.appVersion = const Value.absent(),
    this.deviceModel = const Value.absent(),
    this.osVersion = const Value.absent(),
    this.timestamp = const Value.absent(),
  });
  LogsCompanion.insert({
    this.id = const Value.absent(),
    required String level,
    required String tag,
    required String message,
    this.stackTrace = const Value.absent(),
    this.vaultId = const Value.absent(),
    required String appVersion,
    required String deviceModel,
    required String osVersion,
    required int timestamp,
  })  : level = Value(level),
        tag = Value(tag),
        message = Value(message),
        appVersion = Value(appVersion),
        deviceModel = Value(deviceModel),
        osVersion = Value(osVersion),
        timestamp = Value(timestamp);
  static Insertable<LogRow> custom({
    Expression<int>? id,
    Expression<String>? level,
    Expression<String>? tag,
    Expression<String>? message,
    Expression<String>? stackTrace,
    Expression<String>? vaultId,
    Expression<String>? appVersion,
    Expression<String>? deviceModel,
    Expression<String>? osVersion,
    Expression<int>? timestamp,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (level != null) 'level': level,
      if (tag != null) 'tag': tag,
      if (message != null) 'message': message,
      if (stackTrace != null) 'stack_trace': stackTrace,
      if (vaultId != null) 'vault_id': vaultId,
      if (appVersion != null) 'app_version': appVersion,
      if (deviceModel != null) 'device_model': deviceModel,
      if (osVersion != null) 'os_version': osVersion,
      if (timestamp != null) 'timestamp': timestamp,
    });
  }

  LogsCompanion copyWith(
      {Value<int>? id,
      Value<String>? level,
      Value<String>? tag,
      Value<String>? message,
      Value<String?>? stackTrace,
      Value<String?>? vaultId,
      Value<String>? appVersion,
      Value<String>? deviceModel,
      Value<String>? osVersion,
      Value<int>? timestamp}) {
    return LogsCompanion(
      id: id ?? this.id,
      level: level ?? this.level,
      tag: tag ?? this.tag,
      message: message ?? this.message,
      stackTrace: stackTrace ?? this.stackTrace,
      vaultId: vaultId ?? this.vaultId,
      appVersion: appVersion ?? this.appVersion,
      deviceModel: deviceModel ?? this.deviceModel,
      osVersion: osVersion ?? this.osVersion,
      timestamp: timestamp ?? this.timestamp,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (level.present) {
      map['level'] = Variable<String>(level.value);
    }
    if (tag.present) {
      map['tag'] = Variable<String>(tag.value);
    }
    if (message.present) {
      map['message'] = Variable<String>(message.value);
    }
    if (stackTrace.present) {
      map['stack_trace'] = Variable<String>(stackTrace.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (appVersion.present) {
      map['app_version'] = Variable<String>(appVersion.value);
    }
    if (deviceModel.present) {
      map['device_model'] = Variable<String>(deviceModel.value);
    }
    if (osVersion.present) {
      map['os_version'] = Variable<String>(osVersion.value);
    }
    if (timestamp.present) {
      map['timestamp'] = Variable<int>(timestamp.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LogsCompanion(')
          ..write('id: $id, ')
          ..write('level: $level, ')
          ..write('tag: $tag, ')
          ..write('message: $message, ')
          ..write('stackTrace: $stackTrace, ')
          ..write('vaultId: $vaultId, ')
          ..write('appVersion: $appVersion, ')
          ..write('deviceModel: $deviceModel, ')
          ..write('osVersion: $osVersion, ')
          ..write('timestamp: $timestamp')
          ..write(')'))
        .toString();
  }
}

abstract class _$LogsDatabase extends GeneratedDatabase {
  _$LogsDatabase(QueryExecutor e) : super(e);
  $LogsDatabaseManager get managers => $LogsDatabaseManager(this);
  late final $LogsTable logs = $LogsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [logs];
}

typedef $$LogsTableCreateCompanionBuilder = LogsCompanion Function({
  Value<int> id,
  required String level,
  required String tag,
  required String message,
  Value<String?> stackTrace,
  Value<String?> vaultId,
  required String appVersion,
  required String deviceModel,
  required String osVersion,
  required int timestamp,
});
typedef $$LogsTableUpdateCompanionBuilder = LogsCompanion Function({
  Value<int> id,
  Value<String> level,
  Value<String> tag,
  Value<String> message,
  Value<String?> stackTrace,
  Value<String?> vaultId,
  Value<String> appVersion,
  Value<String> deviceModel,
  Value<String> osVersion,
  Value<int> timestamp,
});

class $$LogsTableFilterComposer extends Composer<_$LogsDatabase, $LogsTable> {
  $$LogsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get level => $composableBuilder(
      column: $table.level, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get tag => $composableBuilder(
      column: $table.tag, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get message => $composableBuilder(
      column: $table.message, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get stackTrace => $composableBuilder(
      column: $table.stackTrace, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get appVersion => $composableBuilder(
      column: $table.appVersion, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get deviceModel => $composableBuilder(
      column: $table.deviceModel, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get osVersion => $composableBuilder(
      column: $table.osVersion, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get timestamp => $composableBuilder(
      column: $table.timestamp, builder: (column) => ColumnFilters(column));
}

class $$LogsTableOrderingComposer extends Composer<_$LogsDatabase, $LogsTable> {
  $$LogsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get level => $composableBuilder(
      column: $table.level, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get tag => $composableBuilder(
      column: $table.tag, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get message => $composableBuilder(
      column: $table.message, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get stackTrace => $composableBuilder(
      column: $table.stackTrace, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get appVersion => $composableBuilder(
      column: $table.appVersion, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get deviceModel => $composableBuilder(
      column: $table.deviceModel, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get osVersion => $composableBuilder(
      column: $table.osVersion, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get timestamp => $composableBuilder(
      column: $table.timestamp, builder: (column) => ColumnOrderings(column));
}

class $$LogsTableAnnotationComposer
    extends Composer<_$LogsDatabase, $LogsTable> {
  $$LogsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get level =>
      $composableBuilder(column: $table.level, builder: (column) => column);

  GeneratedColumn<String> get tag =>
      $composableBuilder(column: $table.tag, builder: (column) => column);

  GeneratedColumn<String> get message =>
      $composableBuilder(column: $table.message, builder: (column) => column);

  GeneratedColumn<String> get stackTrace => $composableBuilder(
      column: $table.stackTrace, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get appVersion => $composableBuilder(
      column: $table.appVersion, builder: (column) => column);

  GeneratedColumn<String> get deviceModel => $composableBuilder(
      column: $table.deviceModel, builder: (column) => column);

  GeneratedColumn<String> get osVersion =>
      $composableBuilder(column: $table.osVersion, builder: (column) => column);

  GeneratedColumn<int> get timestamp =>
      $composableBuilder(column: $table.timestamp, builder: (column) => column);
}

class $$LogsTableTableManager extends RootTableManager<
    _$LogsDatabase,
    $LogsTable,
    LogRow,
    $$LogsTableFilterComposer,
    $$LogsTableOrderingComposer,
    $$LogsTableAnnotationComposer,
    $$LogsTableCreateCompanionBuilder,
    $$LogsTableUpdateCompanionBuilder,
    (LogRow, BaseReferences<_$LogsDatabase, $LogsTable, LogRow>),
    LogRow,
    PrefetchHooks Function()> {
  $$LogsTableTableManager(_$LogsDatabase db, $LogsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LogsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LogsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LogsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<String> level = const Value.absent(),
            Value<String> tag = const Value.absent(),
            Value<String> message = const Value.absent(),
            Value<String?> stackTrace = const Value.absent(),
            Value<String?> vaultId = const Value.absent(),
            Value<String> appVersion = const Value.absent(),
            Value<String> deviceModel = const Value.absent(),
            Value<String> osVersion = const Value.absent(),
            Value<int> timestamp = const Value.absent(),
          }) =>
              LogsCompanion(
            id: id,
            level: level,
            tag: tag,
            message: message,
            stackTrace: stackTrace,
            vaultId: vaultId,
            appVersion: appVersion,
            deviceModel: deviceModel,
            osVersion: osVersion,
            timestamp: timestamp,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required String level,
            required String tag,
            required String message,
            Value<String?> stackTrace = const Value.absent(),
            Value<String?> vaultId = const Value.absent(),
            required String appVersion,
            required String deviceModel,
            required String osVersion,
            required int timestamp,
          }) =>
              LogsCompanion.insert(
            id: id,
            level: level,
            tag: tag,
            message: message,
            stackTrace: stackTrace,
            vaultId: vaultId,
            appVersion: appVersion,
            deviceModel: deviceModel,
            osVersion: osVersion,
            timestamp: timestamp,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$LogsTableProcessedTableManager = ProcessedTableManager<
    _$LogsDatabase,
    $LogsTable,
    LogRow,
    $$LogsTableFilterComposer,
    $$LogsTableOrderingComposer,
    $$LogsTableAnnotationComposer,
    $$LogsTableCreateCompanionBuilder,
    $$LogsTableUpdateCompanionBuilder,
    (LogRow, BaseReferences<_$LogsDatabase, $LogsTable, LogRow>),
    LogRow,
    PrefetchHooks Function()>;

class $LogsDatabaseManager {
  final _$LogsDatabase _db;
  $LogsDatabaseManager(this._db);
  $$LogsTableTableManager get logs => $$LogsTableTableManager(_db, _db.logs);
}
