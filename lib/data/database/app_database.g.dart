// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $CategoriesTable extends Categories
    with TableInfo<$CategoriesTable, CategoryRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CategoriesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _iconCodepointMeta =
      const VerificationMeta('iconCodepoint');
  @override
  late final GeneratedColumn<int> iconCodepoint = GeneratedColumn<int>(
      'icon_codepoint', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [id, vaultId, name, iconCodepoint];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'categories';
  @override
  VerificationContext validateIntegrity(Insertable<CategoryRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('icon_codepoint')) {
      context.handle(
          _iconCodepointMeta,
          iconCodepoint.isAcceptableOrUnknown(
              data['icon_codepoint']!, _iconCodepointMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CategoryRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CategoryRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      iconCodepoint: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}icon_codepoint']),
    );
  }

  @override
  $CategoriesTable createAlias(String alias) {
    return $CategoriesTable(attachedDatabase, alias);
  }
}

class CategoryRow extends DataClass implements Insertable<CategoryRow> {
  final String id;
  final String vaultId;
  final String name;
  final int? iconCodepoint;
  const CategoryRow(
      {required this.id,
      required this.vaultId,
      required this.name,
      this.iconCodepoint});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['name'] = Variable<String>(name);
    if (!nullToAbsent || iconCodepoint != null) {
      map['icon_codepoint'] = Variable<int>(iconCodepoint);
    }
    return map;
  }

  CategoriesCompanion toCompanion(bool nullToAbsent) {
    return CategoriesCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      name: Value(name),
      iconCodepoint: iconCodepoint == null && nullToAbsent
          ? const Value.absent()
          : Value(iconCodepoint),
    );
  }

  factory CategoryRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CategoryRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      name: serializer.fromJson<String>(json['name']),
      iconCodepoint: serializer.fromJson<int?>(json['iconCodepoint']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'name': serializer.toJson<String>(name),
      'iconCodepoint': serializer.toJson<int?>(iconCodepoint),
    };
  }

  CategoryRow copyWith(
          {String? id,
          String? vaultId,
          String? name,
          Value<int?> iconCodepoint = const Value.absent()}) =>
      CategoryRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        name: name ?? this.name,
        iconCodepoint:
            iconCodepoint.present ? iconCodepoint.value : this.iconCodepoint,
      );
  CategoryRow copyWithCompanion(CategoriesCompanion data) {
    return CategoryRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      name: data.name.present ? data.name.value : this.name,
      iconCodepoint: data.iconCodepoint.present
          ? data.iconCodepoint.value
          : this.iconCodepoint,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CategoryRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('iconCodepoint: $iconCodepoint')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, name, iconCodepoint);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CategoryRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.name == this.name &&
          other.iconCodepoint == this.iconCodepoint);
}

class CategoriesCompanion extends UpdateCompanion<CategoryRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> name;
  final Value<int?> iconCodepoint;
  final Value<int> rowid;
  const CategoriesCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.name = const Value.absent(),
    this.iconCodepoint = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CategoriesCompanion.insert({
    required String id,
    required String vaultId,
    required String name,
    this.iconCodepoint = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        name = Value(name);
  static Insertable<CategoryRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? name,
    Expression<int>? iconCodepoint,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (name != null) 'name': name,
      if (iconCodepoint != null) 'icon_codepoint': iconCodepoint,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CategoriesCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? name,
      Value<int?>? iconCodepoint,
      Value<int>? rowid}) {
    return CategoriesCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      name: name ?? this.name,
      iconCodepoint: iconCodepoint ?? this.iconCodepoint,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (iconCodepoint.present) {
      map['icon_codepoint'] = Variable<int>(iconCodepoint.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CategoriesCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('iconCodepoint: $iconCodepoint, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TransactionsTable extends Transactions
    with TableInfo<$TransactionsTable, TransactionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TransactionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _amountMeta = const VerificationMeta('amount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> amount =
      GeneratedColumn<String>('amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($TransactionsTable.$converteramount);
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
      'type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _categoryIdMeta =
      const VerificationMeta('categoryId');
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
      'category_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES categories (id)'));
  static const VerificationMeta _merchantMeta =
      const VerificationMeta('merchant');
  @override
  late final GeneratedColumn<String> merchant = GeneratedColumn<String>(
      'merchant', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
      'note', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _accountIdMeta =
      const VerificationMeta('accountId');
  @override
  late final GeneratedColumn<String> accountId = GeneratedColumn<String>(
      'account_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _attachmentRefMeta =
      const VerificationMeta('attachmentRef');
  @override
  late final GeneratedColumn<String> attachmentRef = GeneratedColumn<String>(
      'attachment_ref', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _dateMeta = const VerificationMeta('date');
  @override
  late final GeneratedColumn<int> date = GeneratedColumn<int>(
      'date', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
      'created_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        amount,
        type,
        categoryId,
        merchant,
        note,
        accountId,
        attachmentRef,
        date,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'transactions';
  @override
  VerificationContext validateIntegrity(Insertable<TransactionRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    context.handle(_amountMeta, const VerificationResult.success());
    if (data.containsKey('type')) {
      context.handle(
          _typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
          _categoryIdMeta,
          categoryId.isAcceptableOrUnknown(
              data['category_id']!, _categoryIdMeta));
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('merchant')) {
      context.handle(_merchantMeta,
          merchant.isAcceptableOrUnknown(data['merchant']!, _merchantMeta));
    }
    if (data.containsKey('note')) {
      context.handle(
          _noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));
    }
    if (data.containsKey('account_id')) {
      context.handle(_accountIdMeta,
          accountId.isAcceptableOrUnknown(data['account_id']!, _accountIdMeta));
    }
    if (data.containsKey('attachment_ref')) {
      context.handle(
          _attachmentRefMeta,
          attachmentRef.isAcceptableOrUnknown(
              data['attachment_ref']!, _attachmentRefMeta));
    }
    if (data.containsKey('date')) {
      context.handle(
          _dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));
    } else if (isInserting) {
      context.missing(_dateMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  TransactionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TransactionRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      amount: $TransactionsTable.$converteramount.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}amount'])!),
      type: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      categoryId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}category_id'])!,
      merchant: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}merchant']),
      note: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}note']),
      accountId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}account_id']),
      attachmentRef: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}attachment_ref']),
      date: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}date'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $TransactionsTable createAlias(String alias) {
    return $TransactionsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteramount =
      const DecimalConverter();
}

class TransactionRow extends DataClass implements Insertable<TransactionRow> {
  final String id;
  final String vaultId;

  /// Always positive; the [type] column carries the sign.
  final Decimal amount;

  /// 'expense' | 'income'.
  final String type;
  final String categoryId;
  final String? merchant;
  final String? note;

  /// Double-entry header (PRD §16): the money account (cash/bank/credit) this
  /// entry moves. Nullable for pre-v3 rows until the migration backfills them.
  final String? accountId;

  /// Receipt attachment — sandbox file path (PRD §11 local media).
  final String? attachmentRef;

  /// Transaction date and creation time (Unix ms).
  final int date;
  final int createdAt;
  const TransactionRow(
      {required this.id,
      required this.vaultId,
      required this.amount,
      required this.type,
      required this.categoryId,
      this.merchant,
      this.note,
      this.accountId,
      this.attachmentRef,
      required this.date,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    {
      map['amount'] =
          Variable<String>($TransactionsTable.$converteramount.toSql(amount));
    }
    map['type'] = Variable<String>(type);
    map['category_id'] = Variable<String>(categoryId);
    if (!nullToAbsent || merchant != null) {
      map['merchant'] = Variable<String>(merchant);
    }
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    if (!nullToAbsent || accountId != null) {
      map['account_id'] = Variable<String>(accountId);
    }
    if (!nullToAbsent || attachmentRef != null) {
      map['attachment_ref'] = Variable<String>(attachmentRef);
    }
    map['date'] = Variable<int>(date);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  TransactionsCompanion toCompanion(bool nullToAbsent) {
    return TransactionsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      amount: Value(amount),
      type: Value(type),
      categoryId: Value(categoryId),
      merchant: merchant == null && nullToAbsent
          ? const Value.absent()
          : Value(merchant),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      accountId: accountId == null && nullToAbsent
          ? const Value.absent()
          : Value(accountId),
      attachmentRef: attachmentRef == null && nullToAbsent
          ? const Value.absent()
          : Value(attachmentRef),
      date: Value(date),
      createdAt: Value(createdAt),
    );
  }

  factory TransactionRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TransactionRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      amount: serializer.fromJson<Decimal>(json['amount']),
      type: serializer.fromJson<String>(json['type']),
      categoryId: serializer.fromJson<String>(json['categoryId']),
      merchant: serializer.fromJson<String?>(json['merchant']),
      note: serializer.fromJson<String?>(json['note']),
      accountId: serializer.fromJson<String?>(json['accountId']),
      attachmentRef: serializer.fromJson<String?>(json['attachmentRef']),
      date: serializer.fromJson<int>(json['date']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'amount': serializer.toJson<Decimal>(amount),
      'type': serializer.toJson<String>(type),
      'categoryId': serializer.toJson<String>(categoryId),
      'merchant': serializer.toJson<String?>(merchant),
      'note': serializer.toJson<String?>(note),
      'accountId': serializer.toJson<String?>(accountId),
      'attachmentRef': serializer.toJson<String?>(attachmentRef),
      'date': serializer.toJson<int>(date),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  TransactionRow copyWith(
          {String? id,
          String? vaultId,
          Decimal? amount,
          String? type,
          String? categoryId,
          Value<String?> merchant = const Value.absent(),
          Value<String?> note = const Value.absent(),
          Value<String?> accountId = const Value.absent(),
          Value<String?> attachmentRef = const Value.absent(),
          int? date,
          int? createdAt}) =>
      TransactionRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        amount: amount ?? this.amount,
        type: type ?? this.type,
        categoryId: categoryId ?? this.categoryId,
        merchant: merchant.present ? merchant.value : this.merchant,
        note: note.present ? note.value : this.note,
        accountId: accountId.present ? accountId.value : this.accountId,
        attachmentRef:
            attachmentRef.present ? attachmentRef.value : this.attachmentRef,
        date: date ?? this.date,
        createdAt: createdAt ?? this.createdAt,
      );
  TransactionRow copyWithCompanion(TransactionsCompanion data) {
    return TransactionRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      amount: data.amount.present ? data.amount.value : this.amount,
      type: data.type.present ? data.type.value : this.type,
      categoryId:
          data.categoryId.present ? data.categoryId.value : this.categoryId,
      merchant: data.merchant.present ? data.merchant.value : this.merchant,
      note: data.note.present ? data.note.value : this.note,
      accountId: data.accountId.present ? data.accountId.value : this.accountId,
      attachmentRef: data.attachmentRef.present
          ? data.attachmentRef.value
          : this.attachmentRef,
      date: data.date.present ? data.date.value : this.date,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TransactionRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('amount: $amount, ')
          ..write('type: $type, ')
          ..write('categoryId: $categoryId, ')
          ..write('merchant: $merchant, ')
          ..write('note: $note, ')
          ..write('accountId: $accountId, ')
          ..write('attachmentRef: $attachmentRef, ')
          ..write('date: $date, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, amount, type, categoryId,
      merchant, note, accountId, attachmentRef, date, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TransactionRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.amount == this.amount &&
          other.type == this.type &&
          other.categoryId == this.categoryId &&
          other.merchant == this.merchant &&
          other.note == this.note &&
          other.accountId == this.accountId &&
          other.attachmentRef == this.attachmentRef &&
          other.date == this.date &&
          other.createdAt == this.createdAt);
}

class TransactionsCompanion extends UpdateCompanion<TransactionRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<Decimal> amount;
  final Value<String> type;
  final Value<String> categoryId;
  final Value<String?> merchant;
  final Value<String?> note;
  final Value<String?> accountId;
  final Value<String?> attachmentRef;
  final Value<int> date;
  final Value<int> createdAt;
  final Value<int> rowid;
  const TransactionsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.amount = const Value.absent(),
    this.type = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.merchant = const Value.absent(),
    this.note = const Value.absent(),
    this.accountId = const Value.absent(),
    this.attachmentRef = const Value.absent(),
    this.date = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TransactionsCompanion.insert({
    required String id,
    required String vaultId,
    required Decimal amount,
    required String type,
    required String categoryId,
    this.merchant = const Value.absent(),
    this.note = const Value.absent(),
    this.accountId = const Value.absent(),
    this.attachmentRef = const Value.absent(),
    required int date,
    required int createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        amount = Value(amount),
        type = Value(type),
        categoryId = Value(categoryId),
        date = Value(date),
        createdAt = Value(createdAt);
  static Insertable<TransactionRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? amount,
    Expression<String>? type,
    Expression<String>? categoryId,
    Expression<String>? merchant,
    Expression<String>? note,
    Expression<String>? accountId,
    Expression<String>? attachmentRef,
    Expression<int>? date,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (amount != null) 'amount': amount,
      if (type != null) 'type': type,
      if (categoryId != null) 'category_id': categoryId,
      if (merchant != null) 'merchant': merchant,
      if (note != null) 'note': note,
      if (accountId != null) 'account_id': accountId,
      if (attachmentRef != null) 'attachment_ref': attachmentRef,
      if (date != null) 'date': date,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TransactionsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<Decimal>? amount,
      Value<String>? type,
      Value<String>? categoryId,
      Value<String?>? merchant,
      Value<String?>? note,
      Value<String?>? accountId,
      Value<String?>? attachmentRef,
      Value<int>? date,
      Value<int>? createdAt,
      Value<int>? rowid}) {
    return TransactionsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      amount: amount ?? this.amount,
      type: type ?? this.type,
      categoryId: categoryId ?? this.categoryId,
      merchant: merchant ?? this.merchant,
      note: note ?? this.note,
      accountId: accountId ?? this.accountId,
      attachmentRef: attachmentRef ?? this.attachmentRef,
      date: date ?? this.date,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (amount.present) {
      map['amount'] = Variable<String>(
          $TransactionsTable.$converteramount.toSql(amount.value));
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (merchant.present) {
      map['merchant'] = Variable<String>(merchant.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (accountId.present) {
      map['account_id'] = Variable<String>(accountId.value);
    }
    if (attachmentRef.present) {
      map['attachment_ref'] = Variable<String>(attachmentRef.value);
    }
    if (date.present) {
      map['date'] = Variable<int>(date.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TransactionsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('amount: $amount, ')
          ..write('type: $type, ')
          ..write('categoryId: $categoryId, ')
          ..write('merchant: $merchant, ')
          ..write('note: $note, ')
          ..write('accountId: $accountId, ')
          ..write('attachmentRef: $attachmentRef, ')
          ..write('date: $date, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $BudgetsTable extends Budgets with TableInfo<$BudgetsTable, BudgetRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $BudgetsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _categoryIdMeta =
      const VerificationMeta('categoryId');
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
      'category_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES categories (id)'));
  static const VerificationMeta _periodTypeMeta =
      const VerificationMeta('periodType');
  @override
  late final GeneratedColumn<String> periodType = GeneratedColumn<String>(
      'period_type', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('monthly'));
  static const VerificationMeta _amountLimitMeta =
      const VerificationMeta('amountLimit');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> amountLimit =
      GeneratedColumn<String>('amount_limit', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($BudgetsTable.$converteramountLimit);
  static const VerificationMeta _rolloverEnabledMeta =
      const VerificationMeta('rolloverEnabled');
  @override
  late final GeneratedColumn<bool> rolloverEnabled = GeneratedColumn<bool>(
      'rollover_enabled', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("rollover_enabled" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _alertThresholdPctMeta =
      const VerificationMeta('alertThresholdPct');
  @override
  late final GeneratedColumn<int> alertThresholdPct = GeneratedColumn<int>(
      'alert_threshold_pct', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(90));
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
      'created_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        categoryId,
        periodType,
        amountLimit,
        rolloverEnabled,
        alertThresholdPct,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'budgets';
  @override
  VerificationContext validateIntegrity(Insertable<BudgetRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
          _categoryIdMeta,
          categoryId.isAcceptableOrUnknown(
              data['category_id']!, _categoryIdMeta));
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('period_type')) {
      context.handle(
          _periodTypeMeta,
          periodType.isAcceptableOrUnknown(
              data['period_type']!, _periodTypeMeta));
    }
    context.handle(_amountLimitMeta, const VerificationResult.success());
    if (data.containsKey('rollover_enabled')) {
      context.handle(
          _rolloverEnabledMeta,
          rolloverEnabled.isAcceptableOrUnknown(
              data['rollover_enabled']!, _rolloverEnabledMeta));
    }
    if (data.containsKey('alert_threshold_pct')) {
      context.handle(
          _alertThresholdPctMeta,
          alertThresholdPct.isAcceptableOrUnknown(
              data['alert_threshold_pct']!, _alertThresholdPctMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  BudgetRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return BudgetRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      categoryId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}category_id'])!,
      periodType: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}period_type'])!,
      amountLimit: $BudgetsTable.$converteramountLimit.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}amount_limit'])!),
      rolloverEnabled: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}rollover_enabled'])!,
      alertThresholdPct: attachedDatabase.typeMapping.read(
          DriftSqlType.int, data['${effectivePrefix}alert_threshold_pct'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $BudgetsTable createAlias(String alias) {
    return $BudgetsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteramountLimit =
      const DecimalConverter();
}

class BudgetRow extends DataClass implements Insertable<BudgetRow> {
  final String id;
  final String vaultId;
  final String categoryId;

  /// ENUM: monthly (only in v1 — PRD §7B).
  final String periodType;

  /// Monthly limit in vault currency, Decimal as TEXT.
  final Decimal amountLimit;
  final bool rolloverEnabled;

  /// Default 90 (PRD §7B). Range 1–100.
  final int alertThresholdPct;
  final int createdAt;
  const BudgetRow(
      {required this.id,
      required this.vaultId,
      required this.categoryId,
      required this.periodType,
      required this.amountLimit,
      required this.rolloverEnabled,
      required this.alertThresholdPct,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['category_id'] = Variable<String>(categoryId);
    map['period_type'] = Variable<String>(periodType);
    {
      map['amount_limit'] = Variable<String>(
          $BudgetsTable.$converteramountLimit.toSql(amountLimit));
    }
    map['rollover_enabled'] = Variable<bool>(rolloverEnabled);
    map['alert_threshold_pct'] = Variable<int>(alertThresholdPct);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  BudgetsCompanion toCompanion(bool nullToAbsent) {
    return BudgetsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      categoryId: Value(categoryId),
      periodType: Value(periodType),
      amountLimit: Value(amountLimit),
      rolloverEnabled: Value(rolloverEnabled),
      alertThresholdPct: Value(alertThresholdPct),
      createdAt: Value(createdAt),
    );
  }

  factory BudgetRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return BudgetRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      categoryId: serializer.fromJson<String>(json['categoryId']),
      periodType: serializer.fromJson<String>(json['periodType']),
      amountLimit: serializer.fromJson<Decimal>(json['amountLimit']),
      rolloverEnabled: serializer.fromJson<bool>(json['rolloverEnabled']),
      alertThresholdPct: serializer.fromJson<int>(json['alertThresholdPct']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'categoryId': serializer.toJson<String>(categoryId),
      'periodType': serializer.toJson<String>(periodType),
      'amountLimit': serializer.toJson<Decimal>(amountLimit),
      'rolloverEnabled': serializer.toJson<bool>(rolloverEnabled),
      'alertThresholdPct': serializer.toJson<int>(alertThresholdPct),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  BudgetRow copyWith(
          {String? id,
          String? vaultId,
          String? categoryId,
          String? periodType,
          Decimal? amountLimit,
          bool? rolloverEnabled,
          int? alertThresholdPct,
          int? createdAt}) =>
      BudgetRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        categoryId: categoryId ?? this.categoryId,
        periodType: periodType ?? this.periodType,
        amountLimit: amountLimit ?? this.amountLimit,
        rolloverEnabled: rolloverEnabled ?? this.rolloverEnabled,
        alertThresholdPct: alertThresholdPct ?? this.alertThresholdPct,
        createdAt: createdAt ?? this.createdAt,
      );
  BudgetRow copyWithCompanion(BudgetsCompanion data) {
    return BudgetRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      categoryId:
          data.categoryId.present ? data.categoryId.value : this.categoryId,
      periodType:
          data.periodType.present ? data.periodType.value : this.periodType,
      amountLimit:
          data.amountLimit.present ? data.amountLimit.value : this.amountLimit,
      rolloverEnabled: data.rolloverEnabled.present
          ? data.rolloverEnabled.value
          : this.rolloverEnabled,
      alertThresholdPct: data.alertThresholdPct.present
          ? data.alertThresholdPct.value
          : this.alertThresholdPct,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('BudgetRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('categoryId: $categoryId, ')
          ..write('periodType: $periodType, ')
          ..write('amountLimit: $amountLimit, ')
          ..write('rolloverEnabled: $rolloverEnabled, ')
          ..write('alertThresholdPct: $alertThresholdPct, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, categoryId, periodType,
      amountLimit, rolloverEnabled, alertThresholdPct, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is BudgetRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.categoryId == this.categoryId &&
          other.periodType == this.periodType &&
          other.amountLimit == this.amountLimit &&
          other.rolloverEnabled == this.rolloverEnabled &&
          other.alertThresholdPct == this.alertThresholdPct &&
          other.createdAt == this.createdAt);
}

class BudgetsCompanion extends UpdateCompanion<BudgetRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> categoryId;
  final Value<String> periodType;
  final Value<Decimal> amountLimit;
  final Value<bool> rolloverEnabled;
  final Value<int> alertThresholdPct;
  final Value<int> createdAt;
  final Value<int> rowid;
  const BudgetsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.periodType = const Value.absent(),
    this.amountLimit = const Value.absent(),
    this.rolloverEnabled = const Value.absent(),
    this.alertThresholdPct = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  BudgetsCompanion.insert({
    required String id,
    required String vaultId,
    required String categoryId,
    this.periodType = const Value.absent(),
    required Decimal amountLimit,
    this.rolloverEnabled = const Value.absent(),
    this.alertThresholdPct = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        categoryId = Value(categoryId),
        amountLimit = Value(amountLimit),
        createdAt = Value(createdAt);
  static Insertable<BudgetRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? categoryId,
    Expression<String>? periodType,
    Expression<String>? amountLimit,
    Expression<bool>? rolloverEnabled,
    Expression<int>? alertThresholdPct,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (categoryId != null) 'category_id': categoryId,
      if (periodType != null) 'period_type': periodType,
      if (amountLimit != null) 'amount_limit': amountLimit,
      if (rolloverEnabled != null) 'rollover_enabled': rolloverEnabled,
      if (alertThresholdPct != null) 'alert_threshold_pct': alertThresholdPct,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  BudgetsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? categoryId,
      Value<String>? periodType,
      Value<Decimal>? amountLimit,
      Value<bool>? rolloverEnabled,
      Value<int>? alertThresholdPct,
      Value<int>? createdAt,
      Value<int>? rowid}) {
    return BudgetsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      categoryId: categoryId ?? this.categoryId,
      periodType: periodType ?? this.periodType,
      amountLimit: amountLimit ?? this.amountLimit,
      rolloverEnabled: rolloverEnabled ?? this.rolloverEnabled,
      alertThresholdPct: alertThresholdPct ?? this.alertThresholdPct,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (periodType.present) {
      map['period_type'] = Variable<String>(periodType.value);
    }
    if (amountLimit.present) {
      map['amount_limit'] = Variable<String>(
          $BudgetsTable.$converteramountLimit.toSql(amountLimit.value));
    }
    if (rolloverEnabled.present) {
      map['rollover_enabled'] = Variable<bool>(rolloverEnabled.value);
    }
    if (alertThresholdPct.present) {
      map['alert_threshold_pct'] = Variable<int>(alertThresholdPct.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('BudgetsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('categoryId: $categoryId, ')
          ..write('periodType: $periodType, ')
          ..write('amountLimit: $amountLimit, ')
          ..write('rolloverEnabled: $rolloverEnabled, ')
          ..write('alertThresholdPct: $alertThresholdPct, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MerchantAliasesTable extends MerchantAliases
    with TableInfo<$MerchantAliasesTable, MerchantAliasRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MerchantAliasesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _merchantPatternMeta =
      const VerificationMeta('merchantPattern');
  @override
  late final GeneratedColumn<String> merchantPattern = GeneratedColumn<String>(
      'merchant_pattern', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _categoryIdMeta =
      const VerificationMeta('categoryId');
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
      'category_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES categories (id)'));
  static const VerificationMeta _hitCountMeta =
      const VerificationMeta('hitCount');
  @override
  late final GeneratedColumn<int> hitCount = GeneratedColumn<int>(
      'hit_count', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(1));
  @override
  List<GeneratedColumn> get $columns =>
      [id, vaultId, merchantPattern, categoryId, hitCount];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'merchant_aliases';
  @override
  VerificationContext validateIntegrity(Insertable<MerchantAliasRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('merchant_pattern')) {
      context.handle(
          _merchantPatternMeta,
          merchantPattern.isAcceptableOrUnknown(
              data['merchant_pattern']!, _merchantPatternMeta));
    } else if (isInserting) {
      context.missing(_merchantPatternMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
          _categoryIdMeta,
          categoryId.isAcceptableOrUnknown(
              data['category_id']!, _categoryIdMeta));
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('hit_count')) {
      context.handle(_hitCountMeta,
          hitCount.isAcceptableOrUnknown(data['hit_count']!, _hitCountMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MerchantAliasRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MerchantAliasRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      merchantPattern: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}merchant_pattern'])!,
      categoryId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}category_id'])!,
      hitCount: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}hit_count'])!,
    );
  }

  @override
  $MerchantAliasesTable createAlias(String alias) {
    return $MerchantAliasesTable(attachedDatabase, alias);
  }
}

class MerchantAliasRow extends DataClass
    implements Insertable<MerchantAliasRow> {
  final String id;
  final String vaultId;
  final String merchantPattern;
  final String categoryId;
  final int hitCount;
  const MerchantAliasRow(
      {required this.id,
      required this.vaultId,
      required this.merchantPattern,
      required this.categoryId,
      required this.hitCount});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['merchant_pattern'] = Variable<String>(merchantPattern);
    map['category_id'] = Variable<String>(categoryId);
    map['hit_count'] = Variable<int>(hitCount);
    return map;
  }

  MerchantAliasesCompanion toCompanion(bool nullToAbsent) {
    return MerchantAliasesCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      merchantPattern: Value(merchantPattern),
      categoryId: Value(categoryId),
      hitCount: Value(hitCount),
    );
  }

  factory MerchantAliasRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MerchantAliasRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      merchantPattern: serializer.fromJson<String>(json['merchantPattern']),
      categoryId: serializer.fromJson<String>(json['categoryId']),
      hitCount: serializer.fromJson<int>(json['hitCount']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'merchantPattern': serializer.toJson<String>(merchantPattern),
      'categoryId': serializer.toJson<String>(categoryId),
      'hitCount': serializer.toJson<int>(hitCount),
    };
  }

  MerchantAliasRow copyWith(
          {String? id,
          String? vaultId,
          String? merchantPattern,
          String? categoryId,
          int? hitCount}) =>
      MerchantAliasRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        merchantPattern: merchantPattern ?? this.merchantPattern,
        categoryId: categoryId ?? this.categoryId,
        hitCount: hitCount ?? this.hitCount,
      );
  MerchantAliasRow copyWithCompanion(MerchantAliasesCompanion data) {
    return MerchantAliasRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      merchantPattern: data.merchantPattern.present
          ? data.merchantPattern.value
          : this.merchantPattern,
      categoryId:
          data.categoryId.present ? data.categoryId.value : this.categoryId,
      hitCount: data.hitCount.present ? data.hitCount.value : this.hitCount,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MerchantAliasRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('merchantPattern: $merchantPattern, ')
          ..write('categoryId: $categoryId, ')
          ..write('hitCount: $hitCount')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, vaultId, merchantPattern, categoryId, hitCount);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MerchantAliasRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.merchantPattern == this.merchantPattern &&
          other.categoryId == this.categoryId &&
          other.hitCount == this.hitCount);
}

class MerchantAliasesCompanion extends UpdateCompanion<MerchantAliasRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> merchantPattern;
  final Value<String> categoryId;
  final Value<int> hitCount;
  final Value<int> rowid;
  const MerchantAliasesCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.merchantPattern = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.hitCount = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MerchantAliasesCompanion.insert({
    required String id,
    required String vaultId,
    required String merchantPattern,
    required String categoryId,
    this.hitCount = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        merchantPattern = Value(merchantPattern),
        categoryId = Value(categoryId);
  static Insertable<MerchantAliasRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? merchantPattern,
    Expression<String>? categoryId,
    Expression<int>? hitCount,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (merchantPattern != null) 'merchant_pattern': merchantPattern,
      if (categoryId != null) 'category_id': categoryId,
      if (hitCount != null) 'hit_count': hitCount,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MerchantAliasesCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? merchantPattern,
      Value<String>? categoryId,
      Value<int>? hitCount,
      Value<int>? rowid}) {
    return MerchantAliasesCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      merchantPattern: merchantPattern ?? this.merchantPattern,
      categoryId: categoryId ?? this.categoryId,
      hitCount: hitCount ?? this.hitCount,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (merchantPattern.present) {
      map['merchant_pattern'] = Variable<String>(merchantPattern.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (hitCount.present) {
      map['hit_count'] = Variable<int>(hitCount.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MerchantAliasesCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('merchantPattern: $merchantPattern, ')
          ..write('categoryId: $categoryId, ')
          ..write('hitCount: $hitCount, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $HoldingsTable extends Holdings
    with TableInfo<$HoldingsTable, HoldingRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $HoldingsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _symbolMeta = const VerificationMeta('symbol');
  @override
  late final GeneratedColumn<String> symbol = GeneratedColumn<String>(
      'symbol', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _exchangeMeta =
      const VerificationMeta('exchange');
  @override
  late final GeneratedColumn<String> exchange = GeneratedColumn<String>(
      'exchange', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('NSE'));
  static const VerificationMeta _quantityMeta =
      const VerificationMeta('quantity');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> quantity =
      GeneratedColumn<String>('quantity', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($HoldingsTable.$converterquantity);
  static const VerificationMeta _avgCostMeta =
      const VerificationMeta('avgCost');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> avgCost =
      GeneratedColumn<String>('avg_cost', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($HoldingsTable.$converteravgCost);
  static const VerificationMeta _firstPurchaseDateMeta =
      const VerificationMeta('firstPurchaseDate');
  @override
  late final GeneratedColumn<int> firstPurchaseDate = GeneratedColumn<int>(
      'first_purchase_date', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _assetTypeMeta =
      const VerificationMeta('assetType');
  @override
  late final GeneratedColumn<String> assetType = GeneratedColumn<String>(
      'asset_type', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('equity_etf'));
  static const VerificationMeta _currencyMeta =
      const VerificationMeta('currency');
  @override
  late final GeneratedColumn<String> currency = GeneratedColumn<String>(
      'currency', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('INR'));
  static const VerificationMeta _lastPriceMeta =
      const VerificationMeta('lastPrice');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal?, String> lastPrice =
      GeneratedColumn<String>('last_price', aliasedName, true,
              type: DriftSqlType.string, requiredDuringInsert: false)
          .withConverter<Decimal?>($HoldingsTable.$converterlastPricen);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        symbol,
        exchange,
        quantity,
        avgCost,
        firstPurchaseDate,
        assetType,
        currency,
        lastPrice
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'holdings';
  @override
  VerificationContext validateIntegrity(Insertable<HoldingRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('symbol')) {
      context.handle(_symbolMeta,
          symbol.isAcceptableOrUnknown(data['symbol']!, _symbolMeta));
    } else if (isInserting) {
      context.missing(_symbolMeta);
    }
    if (data.containsKey('exchange')) {
      context.handle(_exchangeMeta,
          exchange.isAcceptableOrUnknown(data['exchange']!, _exchangeMeta));
    }
    context.handle(_quantityMeta, const VerificationResult.success());
    context.handle(_avgCostMeta, const VerificationResult.success());
    if (data.containsKey('first_purchase_date')) {
      context.handle(
          _firstPurchaseDateMeta,
          firstPurchaseDate.isAcceptableOrUnknown(
              data['first_purchase_date']!, _firstPurchaseDateMeta));
    } else if (isInserting) {
      context.missing(_firstPurchaseDateMeta);
    }
    if (data.containsKey('asset_type')) {
      context.handle(_assetTypeMeta,
          assetType.isAcceptableOrUnknown(data['asset_type']!, _assetTypeMeta));
    }
    if (data.containsKey('currency')) {
      context.handle(_currencyMeta,
          currency.isAcceptableOrUnknown(data['currency']!, _currencyMeta));
    }
    context.handle(_lastPriceMeta, const VerificationResult.success());
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  HoldingRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return HoldingRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      symbol: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}symbol'])!,
      exchange: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}exchange'])!,
      quantity: $HoldingsTable.$converterquantity.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}quantity'])!),
      avgCost: $HoldingsTable.$converteravgCost.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}avg_cost'])!),
      firstPurchaseDate: attachedDatabase.typeMapping.read(
          DriftSqlType.int, data['${effectivePrefix}first_purchase_date'])!,
      assetType: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}asset_type'])!,
      currency: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}currency'])!,
      lastPrice: $HoldingsTable.$converterlastPricen.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}last_price'])),
    );
  }

  @override
  $HoldingsTable createAlias(String alias) {
    return $HoldingsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converterquantity =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $converteravgCost =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $converterlastPrice =
      const DecimalConverter();
  static TypeConverter<Decimal?, String?> $converterlastPricen =
      NullAwareTypeConverter.wrap($converterlastPrice);
}

class HoldingRow extends DataClass implements Insertable<HoldingRow> {
  final String id;
  final String vaultId;
  final String symbol;
  final String exchange;
  final Decimal quantity;
  final Decimal avgCost;
  final int firstPurchaseDate;
  final String assetType;
  final String currency;
  final Decimal? lastPrice;
  const HoldingRow(
      {required this.id,
      required this.vaultId,
      required this.symbol,
      required this.exchange,
      required this.quantity,
      required this.avgCost,
      required this.firstPurchaseDate,
      required this.assetType,
      required this.currency,
      this.lastPrice});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['symbol'] = Variable<String>(symbol);
    map['exchange'] = Variable<String>(exchange);
    {
      map['quantity'] =
          Variable<String>($HoldingsTable.$converterquantity.toSql(quantity));
    }
    {
      map['avg_cost'] =
          Variable<String>($HoldingsTable.$converteravgCost.toSql(avgCost));
    }
    map['first_purchase_date'] = Variable<int>(firstPurchaseDate);
    map['asset_type'] = Variable<String>(assetType);
    map['currency'] = Variable<String>(currency);
    if (!nullToAbsent || lastPrice != null) {
      map['last_price'] = Variable<String>(
          $HoldingsTable.$converterlastPricen.toSql(lastPrice));
    }
    return map;
  }

  HoldingsCompanion toCompanion(bool nullToAbsent) {
    return HoldingsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      symbol: Value(symbol),
      exchange: Value(exchange),
      quantity: Value(quantity),
      avgCost: Value(avgCost),
      firstPurchaseDate: Value(firstPurchaseDate),
      assetType: Value(assetType),
      currency: Value(currency),
      lastPrice: lastPrice == null && nullToAbsent
          ? const Value.absent()
          : Value(lastPrice),
    );
  }

  factory HoldingRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return HoldingRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      symbol: serializer.fromJson<String>(json['symbol']),
      exchange: serializer.fromJson<String>(json['exchange']),
      quantity: serializer.fromJson<Decimal>(json['quantity']),
      avgCost: serializer.fromJson<Decimal>(json['avgCost']),
      firstPurchaseDate: serializer.fromJson<int>(json['firstPurchaseDate']),
      assetType: serializer.fromJson<String>(json['assetType']),
      currency: serializer.fromJson<String>(json['currency']),
      lastPrice: serializer.fromJson<Decimal?>(json['lastPrice']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'symbol': serializer.toJson<String>(symbol),
      'exchange': serializer.toJson<String>(exchange),
      'quantity': serializer.toJson<Decimal>(quantity),
      'avgCost': serializer.toJson<Decimal>(avgCost),
      'firstPurchaseDate': serializer.toJson<int>(firstPurchaseDate),
      'assetType': serializer.toJson<String>(assetType),
      'currency': serializer.toJson<String>(currency),
      'lastPrice': serializer.toJson<Decimal?>(lastPrice),
    };
  }

  HoldingRow copyWith(
          {String? id,
          String? vaultId,
          String? symbol,
          String? exchange,
          Decimal? quantity,
          Decimal? avgCost,
          int? firstPurchaseDate,
          String? assetType,
          String? currency,
          Value<Decimal?> lastPrice = const Value.absent()}) =>
      HoldingRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        symbol: symbol ?? this.symbol,
        exchange: exchange ?? this.exchange,
        quantity: quantity ?? this.quantity,
        avgCost: avgCost ?? this.avgCost,
        firstPurchaseDate: firstPurchaseDate ?? this.firstPurchaseDate,
        assetType: assetType ?? this.assetType,
        currency: currency ?? this.currency,
        lastPrice: lastPrice.present ? lastPrice.value : this.lastPrice,
      );
  HoldingRow copyWithCompanion(HoldingsCompanion data) {
    return HoldingRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      symbol: data.symbol.present ? data.symbol.value : this.symbol,
      exchange: data.exchange.present ? data.exchange.value : this.exchange,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
      avgCost: data.avgCost.present ? data.avgCost.value : this.avgCost,
      firstPurchaseDate: data.firstPurchaseDate.present
          ? data.firstPurchaseDate.value
          : this.firstPurchaseDate,
      assetType: data.assetType.present ? data.assetType.value : this.assetType,
      currency: data.currency.present ? data.currency.value : this.currency,
      lastPrice: data.lastPrice.present ? data.lastPrice.value : this.lastPrice,
    );
  }

  @override
  String toString() {
    return (StringBuffer('HoldingRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('symbol: $symbol, ')
          ..write('exchange: $exchange, ')
          ..write('quantity: $quantity, ')
          ..write('avgCost: $avgCost, ')
          ..write('firstPurchaseDate: $firstPurchaseDate, ')
          ..write('assetType: $assetType, ')
          ..write('currency: $currency, ')
          ..write('lastPrice: $lastPrice')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, symbol, exchange, quantity,
      avgCost, firstPurchaseDate, assetType, currency, lastPrice);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is HoldingRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.symbol == this.symbol &&
          other.exchange == this.exchange &&
          other.quantity == this.quantity &&
          other.avgCost == this.avgCost &&
          other.firstPurchaseDate == this.firstPurchaseDate &&
          other.assetType == this.assetType &&
          other.currency == this.currency &&
          other.lastPrice == this.lastPrice);
}

class HoldingsCompanion extends UpdateCompanion<HoldingRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> symbol;
  final Value<String> exchange;
  final Value<Decimal> quantity;
  final Value<Decimal> avgCost;
  final Value<int> firstPurchaseDate;
  final Value<String> assetType;
  final Value<String> currency;
  final Value<Decimal?> lastPrice;
  final Value<int> rowid;
  const HoldingsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.symbol = const Value.absent(),
    this.exchange = const Value.absent(),
    this.quantity = const Value.absent(),
    this.avgCost = const Value.absent(),
    this.firstPurchaseDate = const Value.absent(),
    this.assetType = const Value.absent(),
    this.currency = const Value.absent(),
    this.lastPrice = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  HoldingsCompanion.insert({
    required String id,
    required String vaultId,
    required String symbol,
    this.exchange = const Value.absent(),
    required Decimal quantity,
    required Decimal avgCost,
    required int firstPurchaseDate,
    this.assetType = const Value.absent(),
    this.currency = const Value.absent(),
    this.lastPrice = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        symbol = Value(symbol),
        quantity = Value(quantity),
        avgCost = Value(avgCost),
        firstPurchaseDate = Value(firstPurchaseDate);
  static Insertable<HoldingRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? symbol,
    Expression<String>? exchange,
    Expression<String>? quantity,
    Expression<String>? avgCost,
    Expression<int>? firstPurchaseDate,
    Expression<String>? assetType,
    Expression<String>? currency,
    Expression<String>? lastPrice,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (symbol != null) 'symbol': symbol,
      if (exchange != null) 'exchange': exchange,
      if (quantity != null) 'quantity': quantity,
      if (avgCost != null) 'avg_cost': avgCost,
      if (firstPurchaseDate != null) 'first_purchase_date': firstPurchaseDate,
      if (assetType != null) 'asset_type': assetType,
      if (currency != null) 'currency': currency,
      if (lastPrice != null) 'last_price': lastPrice,
      if (rowid != null) 'rowid': rowid,
    });
  }

  HoldingsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? symbol,
      Value<String>? exchange,
      Value<Decimal>? quantity,
      Value<Decimal>? avgCost,
      Value<int>? firstPurchaseDate,
      Value<String>? assetType,
      Value<String>? currency,
      Value<Decimal?>? lastPrice,
      Value<int>? rowid}) {
    return HoldingsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      symbol: symbol ?? this.symbol,
      exchange: exchange ?? this.exchange,
      quantity: quantity ?? this.quantity,
      avgCost: avgCost ?? this.avgCost,
      firstPurchaseDate: firstPurchaseDate ?? this.firstPurchaseDate,
      assetType: assetType ?? this.assetType,
      currency: currency ?? this.currency,
      lastPrice: lastPrice ?? this.lastPrice,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (symbol.present) {
      map['symbol'] = Variable<String>(symbol.value);
    }
    if (exchange.present) {
      map['exchange'] = Variable<String>(exchange.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<String>(
          $HoldingsTable.$converterquantity.toSql(quantity.value));
    }
    if (avgCost.present) {
      map['avg_cost'] = Variable<String>(
          $HoldingsTable.$converteravgCost.toSql(avgCost.value));
    }
    if (firstPurchaseDate.present) {
      map['first_purchase_date'] = Variable<int>(firstPurchaseDate.value);
    }
    if (assetType.present) {
      map['asset_type'] = Variable<String>(assetType.value);
    }
    if (currency.present) {
      map['currency'] = Variable<String>(currency.value);
    }
    if (lastPrice.present) {
      map['last_price'] = Variable<String>(
          $HoldingsTable.$converterlastPricen.toSql(lastPrice.value));
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('HoldingsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('symbol: $symbol, ')
          ..write('exchange: $exchange, ')
          ..write('quantity: $quantity, ')
          ..write('avgCost: $avgCost, ')
          ..write('firstPurchaseDate: $firstPurchaseDate, ')
          ..write('assetType: $assetType, ')
          ..write('currency: $currency, ')
          ..write('lastPrice: $lastPrice, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $LiabilitiesTable extends Liabilities
    with TableInfo<$LiabilitiesTable, LiabilityRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LiabilitiesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
      'kind', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _principalMeta =
      const VerificationMeta('principal');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> principal =
      GeneratedColumn<String>('principal', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($LiabilitiesTable.$converterprincipal);
  static const VerificationMeta _aprPctMeta = const VerificationMeta('aprPct');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> aprPct =
      GeneratedColumn<String>('apr_pct', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($LiabilitiesTable.$converteraprPct);
  static const VerificationMeta _termMonthsMeta =
      const VerificationMeta('termMonths');
  @override
  late final GeneratedColumn<int> termMonths = GeneratedColumn<int>(
      'term_months', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
      'created_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [id, vaultId, name, kind, principal, aprPct, termMonths, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'liabilities';
  @override
  VerificationContext validateIntegrity(Insertable<LiabilityRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
          _kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    context.handle(_principalMeta, const VerificationResult.success());
    context.handle(_aprPctMeta, const VerificationResult.success());
    if (data.containsKey('term_months')) {
      context.handle(
          _termMonthsMeta,
          termMonths.isAcceptableOrUnknown(
              data['term_months']!, _termMonthsMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LiabilityRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LiabilityRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      kind: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      principal: $LiabilitiesTable.$converterprincipal.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}principal'])!),
      aprPct: $LiabilitiesTable.$converteraprPct.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}apr_pct'])!),
      termMonths: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}term_months']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $LiabilitiesTable createAlias(String alias) {
    return $LiabilitiesTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converterprincipal =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $converteraprPct =
      const DecimalConverter();
}

class LiabilityRow extends DataClass implements Insertable<LiabilityRow> {
  final String id;
  final String vaultId;
  final String name;
  final String kind;
  final Decimal principal;
  final Decimal aprPct;
  final int? termMonths;
  final int createdAt;
  const LiabilityRow(
      {required this.id,
      required this.vaultId,
      required this.name,
      required this.kind,
      required this.principal,
      required this.aprPct,
      this.termMonths,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['name'] = Variable<String>(name);
    map['kind'] = Variable<String>(kind);
    {
      map['principal'] = Variable<String>(
          $LiabilitiesTable.$converterprincipal.toSql(principal));
    }
    {
      map['apr_pct'] =
          Variable<String>($LiabilitiesTable.$converteraprPct.toSql(aprPct));
    }
    if (!nullToAbsent || termMonths != null) {
      map['term_months'] = Variable<int>(termMonths);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  LiabilitiesCompanion toCompanion(bool nullToAbsent) {
    return LiabilitiesCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      name: Value(name),
      kind: Value(kind),
      principal: Value(principal),
      aprPct: Value(aprPct),
      termMonths: termMonths == null && nullToAbsent
          ? const Value.absent()
          : Value(termMonths),
      createdAt: Value(createdAt),
    );
  }

  factory LiabilityRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LiabilityRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      name: serializer.fromJson<String>(json['name']),
      kind: serializer.fromJson<String>(json['kind']),
      principal: serializer.fromJson<Decimal>(json['principal']),
      aprPct: serializer.fromJson<Decimal>(json['aprPct']),
      termMonths: serializer.fromJson<int?>(json['termMonths']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'name': serializer.toJson<String>(name),
      'kind': serializer.toJson<String>(kind),
      'principal': serializer.toJson<Decimal>(principal),
      'aprPct': serializer.toJson<Decimal>(aprPct),
      'termMonths': serializer.toJson<int?>(termMonths),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  LiabilityRow copyWith(
          {String? id,
          String? vaultId,
          String? name,
          String? kind,
          Decimal? principal,
          Decimal? aprPct,
          Value<int?> termMonths = const Value.absent(),
          int? createdAt}) =>
      LiabilityRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        name: name ?? this.name,
        kind: kind ?? this.kind,
        principal: principal ?? this.principal,
        aprPct: aprPct ?? this.aprPct,
        termMonths: termMonths.present ? termMonths.value : this.termMonths,
        createdAt: createdAt ?? this.createdAt,
      );
  LiabilityRow copyWithCompanion(LiabilitiesCompanion data) {
    return LiabilityRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      name: data.name.present ? data.name.value : this.name,
      kind: data.kind.present ? data.kind.value : this.kind,
      principal: data.principal.present ? data.principal.value : this.principal,
      aprPct: data.aprPct.present ? data.aprPct.value : this.aprPct,
      termMonths:
          data.termMonths.present ? data.termMonths.value : this.termMonths,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LiabilityRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('kind: $kind, ')
          ..write('principal: $principal, ')
          ..write('aprPct: $aprPct, ')
          ..write('termMonths: $termMonths, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id, vaultId, name, kind, principal, aprPct, termMonths, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LiabilityRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.name == this.name &&
          other.kind == this.kind &&
          other.principal == this.principal &&
          other.aprPct == this.aprPct &&
          other.termMonths == this.termMonths &&
          other.createdAt == this.createdAt);
}

class LiabilitiesCompanion extends UpdateCompanion<LiabilityRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> name;
  final Value<String> kind;
  final Value<Decimal> principal;
  final Value<Decimal> aprPct;
  final Value<int?> termMonths;
  final Value<int> createdAt;
  final Value<int> rowid;
  const LiabilitiesCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.name = const Value.absent(),
    this.kind = const Value.absent(),
    this.principal = const Value.absent(),
    this.aprPct = const Value.absent(),
    this.termMonths = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LiabilitiesCompanion.insert({
    required String id,
    required String vaultId,
    required String name,
    required String kind,
    required Decimal principal,
    required Decimal aprPct,
    this.termMonths = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        name = Value(name),
        kind = Value(kind),
        principal = Value(principal),
        aprPct = Value(aprPct),
        createdAt = Value(createdAt);
  static Insertable<LiabilityRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? name,
    Expression<String>? kind,
    Expression<String>? principal,
    Expression<String>? aprPct,
    Expression<int>? termMonths,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (name != null) 'name': name,
      if (kind != null) 'kind': kind,
      if (principal != null) 'principal': principal,
      if (aprPct != null) 'apr_pct': aprPct,
      if (termMonths != null) 'term_months': termMonths,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LiabilitiesCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? name,
      Value<String>? kind,
      Value<Decimal>? principal,
      Value<Decimal>? aprPct,
      Value<int?>? termMonths,
      Value<int>? createdAt,
      Value<int>? rowid}) {
    return LiabilitiesCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      name: name ?? this.name,
      kind: kind ?? this.kind,
      principal: principal ?? this.principal,
      aprPct: aprPct ?? this.aprPct,
      termMonths: termMonths ?? this.termMonths,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (principal.present) {
      map['principal'] = Variable<String>(
          $LiabilitiesTable.$converterprincipal.toSql(principal.value));
    }
    if (aprPct.present) {
      map['apr_pct'] = Variable<String>(
          $LiabilitiesTable.$converteraprPct.toSql(aprPct.value));
    }
    if (termMonths.present) {
      map['term_months'] = Variable<int>(termMonths.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LiabilitiesCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('kind: $kind, ')
          ..write('principal: $principal, ')
          ..write('aprPct: $aprPct, ')
          ..write('termMonths: $termMonths, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $GoalsTable extends Goals with TableInfo<$GoalsTable, GoalRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $GoalsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _goalTypeMeta =
      const VerificationMeta('goalType');
  @override
  late final GeneratedColumn<String> goalType = GeneratedColumn<String>(
      'goal_type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _targetAmountMeta =
      const VerificationMeta('targetAmount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> targetAmount =
      GeneratedColumn<String>('target_amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($GoalsTable.$convertertargetAmount);
  static const VerificationMeta _currentAmountMeta =
      const VerificationMeta('currentAmount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> currentAmount =
      GeneratedColumn<String>('current_amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($GoalsTable.$convertercurrentAmount);
  static const VerificationMeta _targetDateMeta =
      const VerificationMeta('targetDate');
  @override
  late final GeneratedColumn<int> targetDate = GeneratedColumn<int>(
      'target_date', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
      'notes', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _isAchievedMeta =
      const VerificationMeta('isAchieved');
  @override
  late final GeneratedColumn<bool> isAchieved = GeneratedColumn<bool>(
      'is_achieved', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("is_achieved" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
      'created_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        name,
        goalType,
        targetAmount,
        currentAmount,
        targetDate,
        notes,
        isAchieved,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'goals';
  @override
  VerificationContext validateIntegrity(Insertable<GoalRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('goal_type')) {
      context.handle(_goalTypeMeta,
          goalType.isAcceptableOrUnknown(data['goal_type']!, _goalTypeMeta));
    } else if (isInserting) {
      context.missing(_goalTypeMeta);
    }
    context.handle(_targetAmountMeta, const VerificationResult.success());
    context.handle(_currentAmountMeta, const VerificationResult.success());
    if (data.containsKey('target_date')) {
      context.handle(
          _targetDateMeta,
          targetDate.isAcceptableOrUnknown(
              data['target_date']!, _targetDateMeta));
    }
    if (data.containsKey('notes')) {
      context.handle(
          _notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));
    }
    if (data.containsKey('is_achieved')) {
      context.handle(
          _isAchievedMeta,
          isAchieved.isAcceptableOrUnknown(
              data['is_achieved']!, _isAchievedMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  GoalRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return GoalRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      goalType: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}goal_type'])!,
      targetAmount: $GoalsTable.$convertertargetAmount.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}target_amount'])!),
      currentAmount: $GoalsTable.$convertercurrentAmount.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.string, data['${effectivePrefix}current_amount'])!),
      targetDate: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}target_date']),
      notes: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}notes']),
      isAchieved: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}is_achieved'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $GoalsTable createAlias(String alias) {
    return $GoalsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $convertertargetAmount =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $convertercurrentAmount =
      const DecimalConverter();
}

class GoalRow extends DataClass implements Insertable<GoalRow> {
  final String id;
  final String vaultId;
  final String name;
  final String goalType;
  final Decimal targetAmount;
  final Decimal currentAmount;
  final int? targetDate;
  final String? notes;
  final bool isAchieved;
  final int createdAt;
  const GoalRow(
      {required this.id,
      required this.vaultId,
      required this.name,
      required this.goalType,
      required this.targetAmount,
      required this.currentAmount,
      this.targetDate,
      this.notes,
      required this.isAchieved,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['name'] = Variable<String>(name);
    map['goal_type'] = Variable<String>(goalType);
    {
      map['target_amount'] = Variable<String>(
          $GoalsTable.$convertertargetAmount.toSql(targetAmount));
    }
    {
      map['current_amount'] = Variable<String>(
          $GoalsTable.$convertercurrentAmount.toSql(currentAmount));
    }
    if (!nullToAbsent || targetDate != null) {
      map['target_date'] = Variable<int>(targetDate);
    }
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    map['is_achieved'] = Variable<bool>(isAchieved);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  GoalsCompanion toCompanion(bool nullToAbsent) {
    return GoalsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      name: Value(name),
      goalType: Value(goalType),
      targetAmount: Value(targetAmount),
      currentAmount: Value(currentAmount),
      targetDate: targetDate == null && nullToAbsent
          ? const Value.absent()
          : Value(targetDate),
      notes:
          notes == null && nullToAbsent ? const Value.absent() : Value(notes),
      isAchieved: Value(isAchieved),
      createdAt: Value(createdAt),
    );
  }

  factory GoalRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return GoalRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      name: serializer.fromJson<String>(json['name']),
      goalType: serializer.fromJson<String>(json['goalType']),
      targetAmount: serializer.fromJson<Decimal>(json['targetAmount']),
      currentAmount: serializer.fromJson<Decimal>(json['currentAmount']),
      targetDate: serializer.fromJson<int?>(json['targetDate']),
      notes: serializer.fromJson<String?>(json['notes']),
      isAchieved: serializer.fromJson<bool>(json['isAchieved']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'name': serializer.toJson<String>(name),
      'goalType': serializer.toJson<String>(goalType),
      'targetAmount': serializer.toJson<Decimal>(targetAmount),
      'currentAmount': serializer.toJson<Decimal>(currentAmount),
      'targetDate': serializer.toJson<int?>(targetDate),
      'notes': serializer.toJson<String?>(notes),
      'isAchieved': serializer.toJson<bool>(isAchieved),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  GoalRow copyWith(
          {String? id,
          String? vaultId,
          String? name,
          String? goalType,
          Decimal? targetAmount,
          Decimal? currentAmount,
          Value<int?> targetDate = const Value.absent(),
          Value<String?> notes = const Value.absent(),
          bool? isAchieved,
          int? createdAt}) =>
      GoalRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        name: name ?? this.name,
        goalType: goalType ?? this.goalType,
        targetAmount: targetAmount ?? this.targetAmount,
        currentAmount: currentAmount ?? this.currentAmount,
        targetDate: targetDate.present ? targetDate.value : this.targetDate,
        notes: notes.present ? notes.value : this.notes,
        isAchieved: isAchieved ?? this.isAchieved,
        createdAt: createdAt ?? this.createdAt,
      );
  GoalRow copyWithCompanion(GoalsCompanion data) {
    return GoalRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      name: data.name.present ? data.name.value : this.name,
      goalType: data.goalType.present ? data.goalType.value : this.goalType,
      targetAmount: data.targetAmount.present
          ? data.targetAmount.value
          : this.targetAmount,
      currentAmount: data.currentAmount.present
          ? data.currentAmount.value
          : this.currentAmount,
      targetDate:
          data.targetDate.present ? data.targetDate.value : this.targetDate,
      notes: data.notes.present ? data.notes.value : this.notes,
      isAchieved:
          data.isAchieved.present ? data.isAchieved.value : this.isAchieved,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('GoalRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('goalType: $goalType, ')
          ..write('targetAmount: $targetAmount, ')
          ..write('currentAmount: $currentAmount, ')
          ..write('targetDate: $targetDate, ')
          ..write('notes: $notes, ')
          ..write('isAchieved: $isAchieved, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, name, goalType, targetAmount,
      currentAmount, targetDate, notes, isAchieved, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is GoalRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.name == this.name &&
          other.goalType == this.goalType &&
          other.targetAmount == this.targetAmount &&
          other.currentAmount == this.currentAmount &&
          other.targetDate == this.targetDate &&
          other.notes == this.notes &&
          other.isAchieved == this.isAchieved &&
          other.createdAt == this.createdAt);
}

class GoalsCompanion extends UpdateCompanion<GoalRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> name;
  final Value<String> goalType;
  final Value<Decimal> targetAmount;
  final Value<Decimal> currentAmount;
  final Value<int?> targetDate;
  final Value<String?> notes;
  final Value<bool> isAchieved;
  final Value<int> createdAt;
  final Value<int> rowid;
  const GoalsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.name = const Value.absent(),
    this.goalType = const Value.absent(),
    this.targetAmount = const Value.absent(),
    this.currentAmount = const Value.absent(),
    this.targetDate = const Value.absent(),
    this.notes = const Value.absent(),
    this.isAchieved = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  GoalsCompanion.insert({
    required String id,
    required String vaultId,
    required String name,
    required String goalType,
    required Decimal targetAmount,
    required Decimal currentAmount,
    this.targetDate = const Value.absent(),
    this.notes = const Value.absent(),
    this.isAchieved = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        name = Value(name),
        goalType = Value(goalType),
        targetAmount = Value(targetAmount),
        currentAmount = Value(currentAmount),
        createdAt = Value(createdAt);
  static Insertable<GoalRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? name,
    Expression<String>? goalType,
    Expression<String>? targetAmount,
    Expression<String>? currentAmount,
    Expression<int>? targetDate,
    Expression<String>? notes,
    Expression<bool>? isAchieved,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (name != null) 'name': name,
      if (goalType != null) 'goal_type': goalType,
      if (targetAmount != null) 'target_amount': targetAmount,
      if (currentAmount != null) 'current_amount': currentAmount,
      if (targetDate != null) 'target_date': targetDate,
      if (notes != null) 'notes': notes,
      if (isAchieved != null) 'is_achieved': isAchieved,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  GoalsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? name,
      Value<String>? goalType,
      Value<Decimal>? targetAmount,
      Value<Decimal>? currentAmount,
      Value<int?>? targetDate,
      Value<String?>? notes,
      Value<bool>? isAchieved,
      Value<int>? createdAt,
      Value<int>? rowid}) {
    return GoalsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      name: name ?? this.name,
      goalType: goalType ?? this.goalType,
      targetAmount: targetAmount ?? this.targetAmount,
      currentAmount: currentAmount ?? this.currentAmount,
      targetDate: targetDate ?? this.targetDate,
      notes: notes ?? this.notes,
      isAchieved: isAchieved ?? this.isAchieved,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (goalType.present) {
      map['goal_type'] = Variable<String>(goalType.value);
    }
    if (targetAmount.present) {
      map['target_amount'] = Variable<String>(
          $GoalsTable.$convertertargetAmount.toSql(targetAmount.value));
    }
    if (currentAmount.present) {
      map['current_amount'] = Variable<String>(
          $GoalsTable.$convertercurrentAmount.toSql(currentAmount.value));
    }
    if (targetDate.present) {
      map['target_date'] = Variable<int>(targetDate.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (isAchieved.present) {
      map['is_achieved'] = Variable<bool>(isAchieved.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('GoalsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('goalType: $goalType, ')
          ..write('targetAmount: $targetAmount, ')
          ..write('currentAmount: $currentAmount, ')
          ..write('targetDate: $targetDate, ')
          ..write('notes: $notes, ')
          ..write('isAchieved: $isAchieved, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $GoalContributionsTable extends GoalContributions
    with TableInfo<$GoalContributionsTable, GoalContributionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $GoalContributionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _goalIdMeta = const VerificationMeta('goalId');
  @override
  late final GeneratedColumn<String> goalId = GeneratedColumn<String>(
      'goal_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES goals (id)'));
  static const VerificationMeta _amountMeta = const VerificationMeta('amount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> amount =
      GeneratedColumn<String>('amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($GoalContributionsTable.$converteramount);
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
      'note', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _contributedAtMeta =
      const VerificationMeta('contributedAt');
  @override
  late final GeneratedColumn<int> contributedAt = GeneratedColumn<int>(
      'contributed_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [id, goalId, amount, note, contributedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'goal_contributions';
  @override
  VerificationContext validateIntegrity(
      Insertable<GoalContributionRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('goal_id')) {
      context.handle(_goalIdMeta,
          goalId.isAcceptableOrUnknown(data['goal_id']!, _goalIdMeta));
    } else if (isInserting) {
      context.missing(_goalIdMeta);
    }
    context.handle(_amountMeta, const VerificationResult.success());
    if (data.containsKey('note')) {
      context.handle(
          _noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));
    }
    if (data.containsKey('contributed_at')) {
      context.handle(
          _contributedAtMeta,
          contributedAt.isAcceptableOrUnknown(
              data['contributed_at']!, _contributedAtMeta));
    } else if (isInserting) {
      context.missing(_contributedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  GoalContributionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return GoalContributionRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      goalId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}goal_id'])!,
      amount: $GoalContributionsTable.$converteramount.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}amount'])!),
      note: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}note']),
      contributedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}contributed_at'])!,
    );
  }

  @override
  $GoalContributionsTable createAlias(String alias) {
    return $GoalContributionsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteramount =
      const DecimalConverter();
}

class GoalContributionRow extends DataClass
    implements Insertable<GoalContributionRow> {
  final String id;
  final String goalId;
  final Decimal amount;
  final String? note;
  final int contributedAt;
  const GoalContributionRow(
      {required this.id,
      required this.goalId,
      required this.amount,
      this.note,
      required this.contributedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['goal_id'] = Variable<String>(goalId);
    {
      map['amount'] = Variable<String>(
          $GoalContributionsTable.$converteramount.toSql(amount));
    }
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    map['contributed_at'] = Variable<int>(contributedAt);
    return map;
  }

  GoalContributionsCompanion toCompanion(bool nullToAbsent) {
    return GoalContributionsCompanion(
      id: Value(id),
      goalId: Value(goalId),
      amount: Value(amount),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      contributedAt: Value(contributedAt),
    );
  }

  factory GoalContributionRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return GoalContributionRow(
      id: serializer.fromJson<String>(json['id']),
      goalId: serializer.fromJson<String>(json['goalId']),
      amount: serializer.fromJson<Decimal>(json['amount']),
      note: serializer.fromJson<String?>(json['note']),
      contributedAt: serializer.fromJson<int>(json['contributedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'goalId': serializer.toJson<String>(goalId),
      'amount': serializer.toJson<Decimal>(amount),
      'note': serializer.toJson<String?>(note),
      'contributedAt': serializer.toJson<int>(contributedAt),
    };
  }

  GoalContributionRow copyWith(
          {String? id,
          String? goalId,
          Decimal? amount,
          Value<String?> note = const Value.absent(),
          int? contributedAt}) =>
      GoalContributionRow(
        id: id ?? this.id,
        goalId: goalId ?? this.goalId,
        amount: amount ?? this.amount,
        note: note.present ? note.value : this.note,
        contributedAt: contributedAt ?? this.contributedAt,
      );
  GoalContributionRow copyWithCompanion(GoalContributionsCompanion data) {
    return GoalContributionRow(
      id: data.id.present ? data.id.value : this.id,
      goalId: data.goalId.present ? data.goalId.value : this.goalId,
      amount: data.amount.present ? data.amount.value : this.amount,
      note: data.note.present ? data.note.value : this.note,
      contributedAt: data.contributedAt.present
          ? data.contributedAt.value
          : this.contributedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('GoalContributionRow(')
          ..write('id: $id, ')
          ..write('goalId: $goalId, ')
          ..write('amount: $amount, ')
          ..write('note: $note, ')
          ..write('contributedAt: $contributedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, goalId, amount, note, contributedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is GoalContributionRow &&
          other.id == this.id &&
          other.goalId == this.goalId &&
          other.amount == this.amount &&
          other.note == this.note &&
          other.contributedAt == this.contributedAt);
}

class GoalContributionsCompanion extends UpdateCompanion<GoalContributionRow> {
  final Value<String> id;
  final Value<String> goalId;
  final Value<Decimal> amount;
  final Value<String?> note;
  final Value<int> contributedAt;
  final Value<int> rowid;
  const GoalContributionsCompanion({
    this.id = const Value.absent(),
    this.goalId = const Value.absent(),
    this.amount = const Value.absent(),
    this.note = const Value.absent(),
    this.contributedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  GoalContributionsCompanion.insert({
    required String id,
    required String goalId,
    required Decimal amount,
    this.note = const Value.absent(),
    required int contributedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        goalId = Value(goalId),
        amount = Value(amount),
        contributedAt = Value(contributedAt);
  static Insertable<GoalContributionRow> custom({
    Expression<String>? id,
    Expression<String>? goalId,
    Expression<String>? amount,
    Expression<String>? note,
    Expression<int>? contributedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (goalId != null) 'goal_id': goalId,
      if (amount != null) 'amount': amount,
      if (note != null) 'note': note,
      if (contributedAt != null) 'contributed_at': contributedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  GoalContributionsCompanion copyWith(
      {Value<String>? id,
      Value<String>? goalId,
      Value<Decimal>? amount,
      Value<String?>? note,
      Value<int>? contributedAt,
      Value<int>? rowid}) {
    return GoalContributionsCompanion(
      id: id ?? this.id,
      goalId: goalId ?? this.goalId,
      amount: amount ?? this.amount,
      note: note ?? this.note,
      contributedAt: contributedAt ?? this.contributedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (goalId.present) {
      map['goal_id'] = Variable<String>(goalId.value);
    }
    if (amount.present) {
      map['amount'] = Variable<String>(
          $GoalContributionsTable.$converteramount.toSql(amount.value));
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (contributedAt.present) {
      map['contributed_at'] = Variable<int>(contributedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('GoalContributionsCompanion(')
          ..write('id: $id, ')
          ..write('goalId: $goalId, ')
          ..write('amount: $amount, ')
          ..write('note: $note, ')
          ..write('contributedAt: $contributedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RecurringRulesTable extends RecurringRules
    with TableInfo<$RecurringRulesTable, RecurringRuleRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RecurringRulesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _amountMeta = const VerificationMeta('amount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> amount =
      GeneratedColumn<String>('amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($RecurringRulesTable.$converteramount);
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
      'type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _categoryIdMeta =
      const VerificationMeta('categoryId');
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
      'category_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES categories (id)'));
  static const VerificationMeta _merchantMeta =
      const VerificationMeta('merchant');
  @override
  late final GeneratedColumn<String> merchant = GeneratedColumn<String>(
      'merchant', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
      'note', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _frequencyMeta =
      const VerificationMeta('frequency');
  @override
  late final GeneratedColumn<String> frequency = GeneratedColumn<String>(
      'frequency', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nextRunMeta =
      const VerificationMeta('nextRun');
  @override
  late final GeneratedColumn<int> nextRun = GeneratedColumn<int>(
      'next_run', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _activeMeta = const VerificationMeta('active');
  @override
  late final GeneratedColumn<bool> active = GeneratedColumn<bool>(
      'active', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("active" IN (0, 1))'),
      defaultValue: const Constant(true));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        amount,
        type,
        categoryId,
        merchant,
        note,
        frequency,
        nextRun,
        active
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'recurring_rules';
  @override
  VerificationContext validateIntegrity(Insertable<RecurringRuleRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    context.handle(_amountMeta, const VerificationResult.success());
    if (data.containsKey('type')) {
      context.handle(
          _typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('category_id')) {
      context.handle(
          _categoryIdMeta,
          categoryId.isAcceptableOrUnknown(
              data['category_id']!, _categoryIdMeta));
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('merchant')) {
      context.handle(_merchantMeta,
          merchant.isAcceptableOrUnknown(data['merchant']!, _merchantMeta));
    }
    if (data.containsKey('note')) {
      context.handle(
          _noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));
    }
    if (data.containsKey('frequency')) {
      context.handle(_frequencyMeta,
          frequency.isAcceptableOrUnknown(data['frequency']!, _frequencyMeta));
    } else if (isInserting) {
      context.missing(_frequencyMeta);
    }
    if (data.containsKey('next_run')) {
      context.handle(_nextRunMeta,
          nextRun.isAcceptableOrUnknown(data['next_run']!, _nextRunMeta));
    } else if (isInserting) {
      context.missing(_nextRunMeta);
    }
    if (data.containsKey('active')) {
      context.handle(_activeMeta,
          active.isAcceptableOrUnknown(data['active']!, _activeMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  RecurringRuleRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RecurringRuleRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      amount: $RecurringRulesTable.$converteramount.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}amount'])!),
      type: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      categoryId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}category_id'])!,
      merchant: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}merchant']),
      note: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}note']),
      frequency: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}frequency'])!,
      nextRun: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}next_run'])!,
      active: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}active'])!,
    );
  }

  @override
  $RecurringRulesTable createAlias(String alias) {
    return $RecurringRulesTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteramount =
      const DecimalConverter();
}

class RecurringRuleRow extends DataClass
    implements Insertable<RecurringRuleRow> {
  final String id;
  final String vaultId;
  final Decimal amount;
  final String type;
  final String categoryId;
  final String? merchant;
  final String? note;
  final String frequency;
  final int nextRun;
  final bool active;
  const RecurringRuleRow(
      {required this.id,
      required this.vaultId,
      required this.amount,
      required this.type,
      required this.categoryId,
      this.merchant,
      this.note,
      required this.frequency,
      required this.nextRun,
      required this.active});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    {
      map['amount'] =
          Variable<String>($RecurringRulesTable.$converteramount.toSql(amount));
    }
    map['type'] = Variable<String>(type);
    map['category_id'] = Variable<String>(categoryId);
    if (!nullToAbsent || merchant != null) {
      map['merchant'] = Variable<String>(merchant);
    }
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    map['frequency'] = Variable<String>(frequency);
    map['next_run'] = Variable<int>(nextRun);
    map['active'] = Variable<bool>(active);
    return map;
  }

  RecurringRulesCompanion toCompanion(bool nullToAbsent) {
    return RecurringRulesCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      amount: Value(amount),
      type: Value(type),
      categoryId: Value(categoryId),
      merchant: merchant == null && nullToAbsent
          ? const Value.absent()
          : Value(merchant),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      frequency: Value(frequency),
      nextRun: Value(nextRun),
      active: Value(active),
    );
  }

  factory RecurringRuleRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RecurringRuleRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      amount: serializer.fromJson<Decimal>(json['amount']),
      type: serializer.fromJson<String>(json['type']),
      categoryId: serializer.fromJson<String>(json['categoryId']),
      merchant: serializer.fromJson<String?>(json['merchant']),
      note: serializer.fromJson<String?>(json['note']),
      frequency: serializer.fromJson<String>(json['frequency']),
      nextRun: serializer.fromJson<int>(json['nextRun']),
      active: serializer.fromJson<bool>(json['active']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'amount': serializer.toJson<Decimal>(amount),
      'type': serializer.toJson<String>(type),
      'categoryId': serializer.toJson<String>(categoryId),
      'merchant': serializer.toJson<String?>(merchant),
      'note': serializer.toJson<String?>(note),
      'frequency': serializer.toJson<String>(frequency),
      'nextRun': serializer.toJson<int>(nextRun),
      'active': serializer.toJson<bool>(active),
    };
  }

  RecurringRuleRow copyWith(
          {String? id,
          String? vaultId,
          Decimal? amount,
          String? type,
          String? categoryId,
          Value<String?> merchant = const Value.absent(),
          Value<String?> note = const Value.absent(),
          String? frequency,
          int? nextRun,
          bool? active}) =>
      RecurringRuleRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        amount: amount ?? this.amount,
        type: type ?? this.type,
        categoryId: categoryId ?? this.categoryId,
        merchant: merchant.present ? merchant.value : this.merchant,
        note: note.present ? note.value : this.note,
        frequency: frequency ?? this.frequency,
        nextRun: nextRun ?? this.nextRun,
        active: active ?? this.active,
      );
  RecurringRuleRow copyWithCompanion(RecurringRulesCompanion data) {
    return RecurringRuleRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      amount: data.amount.present ? data.amount.value : this.amount,
      type: data.type.present ? data.type.value : this.type,
      categoryId:
          data.categoryId.present ? data.categoryId.value : this.categoryId,
      merchant: data.merchant.present ? data.merchant.value : this.merchant,
      note: data.note.present ? data.note.value : this.note,
      frequency: data.frequency.present ? data.frequency.value : this.frequency,
      nextRun: data.nextRun.present ? data.nextRun.value : this.nextRun,
      active: data.active.present ? data.active.value : this.active,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RecurringRuleRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('amount: $amount, ')
          ..write('type: $type, ')
          ..write('categoryId: $categoryId, ')
          ..write('merchant: $merchant, ')
          ..write('note: $note, ')
          ..write('frequency: $frequency, ')
          ..write('nextRun: $nextRun, ')
          ..write('active: $active')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, amount, type, categoryId,
      merchant, note, frequency, nextRun, active);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecurringRuleRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.amount == this.amount &&
          other.type == this.type &&
          other.categoryId == this.categoryId &&
          other.merchant == this.merchant &&
          other.note == this.note &&
          other.frequency == this.frequency &&
          other.nextRun == this.nextRun &&
          other.active == this.active);
}

class RecurringRulesCompanion extends UpdateCompanion<RecurringRuleRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<Decimal> amount;
  final Value<String> type;
  final Value<String> categoryId;
  final Value<String?> merchant;
  final Value<String?> note;
  final Value<String> frequency;
  final Value<int> nextRun;
  final Value<bool> active;
  final Value<int> rowid;
  const RecurringRulesCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.amount = const Value.absent(),
    this.type = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.merchant = const Value.absent(),
    this.note = const Value.absent(),
    this.frequency = const Value.absent(),
    this.nextRun = const Value.absent(),
    this.active = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RecurringRulesCompanion.insert({
    required String id,
    required String vaultId,
    required Decimal amount,
    required String type,
    required String categoryId,
    this.merchant = const Value.absent(),
    this.note = const Value.absent(),
    required String frequency,
    required int nextRun,
    this.active = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        amount = Value(amount),
        type = Value(type),
        categoryId = Value(categoryId),
        frequency = Value(frequency),
        nextRun = Value(nextRun);
  static Insertable<RecurringRuleRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? amount,
    Expression<String>? type,
    Expression<String>? categoryId,
    Expression<String>? merchant,
    Expression<String>? note,
    Expression<String>? frequency,
    Expression<int>? nextRun,
    Expression<bool>? active,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (amount != null) 'amount': amount,
      if (type != null) 'type': type,
      if (categoryId != null) 'category_id': categoryId,
      if (merchant != null) 'merchant': merchant,
      if (note != null) 'note': note,
      if (frequency != null) 'frequency': frequency,
      if (nextRun != null) 'next_run': nextRun,
      if (active != null) 'active': active,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RecurringRulesCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<Decimal>? amount,
      Value<String>? type,
      Value<String>? categoryId,
      Value<String?>? merchant,
      Value<String?>? note,
      Value<String>? frequency,
      Value<int>? nextRun,
      Value<bool>? active,
      Value<int>? rowid}) {
    return RecurringRulesCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      amount: amount ?? this.amount,
      type: type ?? this.type,
      categoryId: categoryId ?? this.categoryId,
      merchant: merchant ?? this.merchant,
      note: note ?? this.note,
      frequency: frequency ?? this.frequency,
      nextRun: nextRun ?? this.nextRun,
      active: active ?? this.active,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (amount.present) {
      map['amount'] = Variable<String>(
          $RecurringRulesTable.$converteramount.toSql(amount.value));
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (merchant.present) {
      map['merchant'] = Variable<String>(merchant.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (frequency.present) {
      map['frequency'] = Variable<String>(frequency.value);
    }
    if (nextRun.present) {
      map['next_run'] = Variable<int>(nextRun.value);
    }
    if (active.present) {
      map['active'] = Variable<bool>(active.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RecurringRulesCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('amount: $amount, ')
          ..write('type: $type, ')
          ..write('categoryId: $categoryId, ')
          ..write('merchant: $merchant, ')
          ..write('note: $note, ')
          ..write('frequency: $frequency, ')
          ..write('nextRun: $nextRun, ')
          ..write('active: $active, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FxRatesTable extends FxRates with TableInfo<$FxRatesTable, FxRateRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FxRatesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      hasAutoIncrement: true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
  static const VerificationMeta _baseCurrencyMeta =
      const VerificationMeta('baseCurrency');
  @override
  late final GeneratedColumn<String> baseCurrency = GeneratedColumn<String>(
      'base_currency', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _quoteCurrencyMeta =
      const VerificationMeta('quoteCurrency');
  @override
  late final GeneratedColumn<String> quoteCurrency = GeneratedColumn<String>(
      'quote_currency', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _rateMeta = const VerificationMeta('rate');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> rate =
      GeneratedColumn<String>('rate', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($FxRatesTable.$converterrate);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _fetchedAtMeta =
      const VerificationMeta('fetchedAt');
  @override
  late final GeneratedColumn<int> fetchedAt = GeneratedColumn<int>(
      'fetched_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [id, baseCurrency, quoteCurrency, rate, source, fetchedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'fx_rates';
  @override
  VerificationContext validateIntegrity(Insertable<FxRateRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('base_currency')) {
      context.handle(
          _baseCurrencyMeta,
          baseCurrency.isAcceptableOrUnknown(
              data['base_currency']!, _baseCurrencyMeta));
    } else if (isInserting) {
      context.missing(_baseCurrencyMeta);
    }
    if (data.containsKey('quote_currency')) {
      context.handle(
          _quoteCurrencyMeta,
          quoteCurrency.isAcceptableOrUnknown(
              data['quote_currency']!, _quoteCurrencyMeta));
    } else if (isInserting) {
      context.missing(_quoteCurrencyMeta);
    }
    context.handle(_rateMeta, const VerificationResult.success());
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    } else if (isInserting) {
      context.missing(_sourceMeta);
    }
    if (data.containsKey('fetched_at')) {
      context.handle(_fetchedAtMeta,
          fetchedAt.isAcceptableOrUnknown(data['fetched_at']!, _fetchedAtMeta));
    } else if (isInserting) {
      context.missing(_fetchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  FxRateRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FxRateRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      baseCurrency: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}base_currency'])!,
      quoteCurrency: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}quote_currency'])!,
      rate: $FxRatesTable.$converterrate.fromSql(attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}rate'])!),
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      fetchedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}fetched_at'])!,
    );
  }

  @override
  $FxRatesTable createAlias(String alias) {
    return $FxRatesTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converterrate =
      const DecimalConverter();
}

class FxRateRow extends DataClass implements Insertable<FxRateRow> {
  final int id;
  final String baseCurrency;
  final String quoteCurrency;
  final Decimal rate;
  final String source;
  final int fetchedAt;
  const FxRateRow(
      {required this.id,
      required this.baseCurrency,
      required this.quoteCurrency,
      required this.rate,
      required this.source,
      required this.fetchedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['base_currency'] = Variable<String>(baseCurrency);
    map['quote_currency'] = Variable<String>(quoteCurrency);
    {
      map['rate'] = Variable<String>($FxRatesTable.$converterrate.toSql(rate));
    }
    map['source'] = Variable<String>(source);
    map['fetched_at'] = Variable<int>(fetchedAt);
    return map;
  }

  FxRatesCompanion toCompanion(bool nullToAbsent) {
    return FxRatesCompanion(
      id: Value(id),
      baseCurrency: Value(baseCurrency),
      quoteCurrency: Value(quoteCurrency),
      rate: Value(rate),
      source: Value(source),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory FxRateRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FxRateRow(
      id: serializer.fromJson<int>(json['id']),
      baseCurrency: serializer.fromJson<String>(json['baseCurrency']),
      quoteCurrency: serializer.fromJson<String>(json['quoteCurrency']),
      rate: serializer.fromJson<Decimal>(json['rate']),
      source: serializer.fromJson<String>(json['source']),
      fetchedAt: serializer.fromJson<int>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'baseCurrency': serializer.toJson<String>(baseCurrency),
      'quoteCurrency': serializer.toJson<String>(quoteCurrency),
      'rate': serializer.toJson<Decimal>(rate),
      'source': serializer.toJson<String>(source),
      'fetchedAt': serializer.toJson<int>(fetchedAt),
    };
  }

  FxRateRow copyWith(
          {int? id,
          String? baseCurrency,
          String? quoteCurrency,
          Decimal? rate,
          String? source,
          int? fetchedAt}) =>
      FxRateRow(
        id: id ?? this.id,
        baseCurrency: baseCurrency ?? this.baseCurrency,
        quoteCurrency: quoteCurrency ?? this.quoteCurrency,
        rate: rate ?? this.rate,
        source: source ?? this.source,
        fetchedAt: fetchedAt ?? this.fetchedAt,
      );
  FxRateRow copyWithCompanion(FxRatesCompanion data) {
    return FxRateRow(
      id: data.id.present ? data.id.value : this.id,
      baseCurrency: data.baseCurrency.present
          ? data.baseCurrency.value
          : this.baseCurrency,
      quoteCurrency: data.quoteCurrency.present
          ? data.quoteCurrency.value
          : this.quoteCurrency,
      rate: data.rate.present ? data.rate.value : this.rate,
      source: data.source.present ? data.source.value : this.source,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FxRateRow(')
          ..write('id: $id, ')
          ..write('baseCurrency: $baseCurrency, ')
          ..write('quoteCurrency: $quoteCurrency, ')
          ..write('rate: $rate, ')
          ..write('source: $source, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, baseCurrency, quoteCurrency, rate, source, fetchedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FxRateRow &&
          other.id == this.id &&
          other.baseCurrency == this.baseCurrency &&
          other.quoteCurrency == this.quoteCurrency &&
          other.rate == this.rate &&
          other.source == this.source &&
          other.fetchedAt == this.fetchedAt);
}

class FxRatesCompanion extends UpdateCompanion<FxRateRow> {
  final Value<int> id;
  final Value<String> baseCurrency;
  final Value<String> quoteCurrency;
  final Value<Decimal> rate;
  final Value<String> source;
  final Value<int> fetchedAt;
  const FxRatesCompanion({
    this.id = const Value.absent(),
    this.baseCurrency = const Value.absent(),
    this.quoteCurrency = const Value.absent(),
    this.rate = const Value.absent(),
    this.source = const Value.absent(),
    this.fetchedAt = const Value.absent(),
  });
  FxRatesCompanion.insert({
    this.id = const Value.absent(),
    required String baseCurrency,
    required String quoteCurrency,
    required Decimal rate,
    required String source,
    required int fetchedAt,
  })  : baseCurrency = Value(baseCurrency),
        quoteCurrency = Value(quoteCurrency),
        rate = Value(rate),
        source = Value(source),
        fetchedAt = Value(fetchedAt);
  static Insertable<FxRateRow> custom({
    Expression<int>? id,
    Expression<String>? baseCurrency,
    Expression<String>? quoteCurrency,
    Expression<String>? rate,
    Expression<String>? source,
    Expression<int>? fetchedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (baseCurrency != null) 'base_currency': baseCurrency,
      if (quoteCurrency != null) 'quote_currency': quoteCurrency,
      if (rate != null) 'rate': rate,
      if (source != null) 'source': source,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
    });
  }

  FxRatesCompanion copyWith(
      {Value<int>? id,
      Value<String>? baseCurrency,
      Value<String>? quoteCurrency,
      Value<Decimal>? rate,
      Value<String>? source,
      Value<int>? fetchedAt}) {
    return FxRatesCompanion(
      id: id ?? this.id,
      baseCurrency: baseCurrency ?? this.baseCurrency,
      quoteCurrency: quoteCurrency ?? this.quoteCurrency,
      rate: rate ?? this.rate,
      source: source ?? this.source,
      fetchedAt: fetchedAt ?? this.fetchedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (baseCurrency.present) {
      map['base_currency'] = Variable<String>(baseCurrency.value);
    }
    if (quoteCurrency.present) {
      map['quote_currency'] = Variable<String>(quoteCurrency.value);
    }
    if (rate.present) {
      map['rate'] =
          Variable<String>($FxRatesTable.$converterrate.toSql(rate.value));
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (fetchedAt.present) {
      map['fetched_at'] = Variable<int>(fetchedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FxRatesCompanion(')
          ..write('id: $id, ')
          ..write('baseCurrency: $baseCurrency, ')
          ..write('quoteCurrency: $quoteCurrency, ')
          ..write('rate: $rate, ')
          ..write('source: $source, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }
}

class $TransactionFingerprintsTable extends TransactionFingerprints
    with TableInfo<$TransactionFingerprintsTable, TxnFingerprintRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TransactionFingerprintsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _fingerprintMeta =
      const VerificationMeta('fingerprint');
  @override
  late final GeneratedColumn<String> fingerprint = GeneratedColumn<String>(
      'fingerprint', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [vaultId, fingerprint];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'transaction_fingerprints';
  @override
  VerificationContext validateIntegrity(Insertable<TxnFingerprintRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('fingerprint')) {
      context.handle(
          _fingerprintMeta,
          fingerprint.isAcceptableOrUnknown(
              data['fingerprint']!, _fingerprintMeta));
    } else if (isInserting) {
      context.missing(_fingerprintMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {vaultId, fingerprint};
  @override
  TxnFingerprintRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TxnFingerprintRow(
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      fingerprint: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}fingerprint'])!,
    );
  }

  @override
  $TransactionFingerprintsTable createAlias(String alias) {
    return $TransactionFingerprintsTable(attachedDatabase, alias);
  }
}

class TxnFingerprintRow extends DataClass
    implements Insertable<TxnFingerprintRow> {
  final String vaultId;
  final String fingerprint;
  const TxnFingerprintRow({required this.vaultId, required this.fingerprint});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['vault_id'] = Variable<String>(vaultId);
    map['fingerprint'] = Variable<String>(fingerprint);
    return map;
  }

  TransactionFingerprintsCompanion toCompanion(bool nullToAbsent) {
    return TransactionFingerprintsCompanion(
      vaultId: Value(vaultId),
      fingerprint: Value(fingerprint),
    );
  }

  factory TxnFingerprintRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TxnFingerprintRow(
      vaultId: serializer.fromJson<String>(json['vaultId']),
      fingerprint: serializer.fromJson<String>(json['fingerprint']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'vaultId': serializer.toJson<String>(vaultId),
      'fingerprint': serializer.toJson<String>(fingerprint),
    };
  }

  TxnFingerprintRow copyWith({String? vaultId, String? fingerprint}) =>
      TxnFingerprintRow(
        vaultId: vaultId ?? this.vaultId,
        fingerprint: fingerprint ?? this.fingerprint,
      );
  TxnFingerprintRow copyWithCompanion(TransactionFingerprintsCompanion data) {
    return TxnFingerprintRow(
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      fingerprint:
          data.fingerprint.present ? data.fingerprint.value : this.fingerprint,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TxnFingerprintRow(')
          ..write('vaultId: $vaultId, ')
          ..write('fingerprint: $fingerprint')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(vaultId, fingerprint);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TxnFingerprintRow &&
          other.vaultId == this.vaultId &&
          other.fingerprint == this.fingerprint);
}

class TransactionFingerprintsCompanion
    extends UpdateCompanion<TxnFingerprintRow> {
  final Value<String> vaultId;
  final Value<String> fingerprint;
  final Value<int> rowid;
  const TransactionFingerprintsCompanion({
    this.vaultId = const Value.absent(),
    this.fingerprint = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TransactionFingerprintsCompanion.insert({
    required String vaultId,
    required String fingerprint,
    this.rowid = const Value.absent(),
  })  : vaultId = Value(vaultId),
        fingerprint = Value(fingerprint);
  static Insertable<TxnFingerprintRow> custom({
    Expression<String>? vaultId,
    Expression<String>? fingerprint,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (vaultId != null) 'vault_id': vaultId,
      if (fingerprint != null) 'fingerprint': fingerprint,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TransactionFingerprintsCompanion copyWith(
      {Value<String>? vaultId, Value<String>? fingerprint, Value<int>? rowid}) {
    return TransactionFingerprintsCompanion(
      vaultId: vaultId ?? this.vaultId,
      fingerprint: fingerprint ?? this.fingerprint,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (fingerprint.present) {
      map['fingerprint'] = Variable<String>(fingerprint.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TransactionFingerprintsCompanion(')
          ..write('vaultId: $vaultId, ')
          ..write('fingerprint: $fingerprint, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $InsurancesTable extends Insurances
    with TableInfo<$InsurancesTable, InsuranceRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $InsurancesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
      'type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _providerMeta =
      const VerificationMeta('provider');
  @override
  late final GeneratedColumn<String> provider = GeneratedColumn<String>(
      'provider', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _coverAmountMeta =
      const VerificationMeta('coverAmount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> coverAmount =
      GeneratedColumn<String>('cover_amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($InsurancesTable.$convertercoverAmount);
  static const VerificationMeta _premiumMeta =
      const VerificationMeta('premium');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> premium =
      GeneratedColumn<String>('premium', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($InsurancesTable.$converterpremium);
  static const VerificationMeta _renewalDateMeta =
      const VerificationMeta('renewalDate');
  @override
  late final GeneratedColumn<int> renewalDate = GeneratedColumn<int>(
      'renewal_date', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
      'created_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        name,
        type,
        provider,
        coverAmount,
        premium,
        renewalDate,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'insurances';
  @override
  VerificationContext validateIntegrity(Insertable<InsuranceRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('type')) {
      context.handle(
          _typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('provider')) {
      context.handle(_providerMeta,
          provider.isAcceptableOrUnknown(data['provider']!, _providerMeta));
    }
    context.handle(_coverAmountMeta, const VerificationResult.success());
    context.handle(_premiumMeta, const VerificationResult.success());
    if (data.containsKey('renewal_date')) {
      context.handle(
          _renewalDateMeta,
          renewalDate.isAcceptableOrUnknown(
              data['renewal_date']!, _renewalDateMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  InsuranceRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return InsuranceRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      type: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      provider: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}provider']),
      coverAmount: $InsurancesTable.$convertercoverAmount.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.string, data['${effectivePrefix}cover_amount'])!),
      premium: $InsurancesTable.$converterpremium.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}premium'])!),
      renewalDate: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}renewal_date']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $InsurancesTable createAlias(String alias) {
    return $InsurancesTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $convertercoverAmount =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $converterpremium =
      const DecimalConverter();
}

class InsuranceRow extends DataClass implements Insertable<InsuranceRow> {
  final String id;
  final String vaultId;
  final String name;
  final String type;
  final String? provider;
  final Decimal coverAmount;
  final Decimal premium;
  final int? renewalDate;
  final int createdAt;
  const InsuranceRow(
      {required this.id,
      required this.vaultId,
      required this.name,
      required this.type,
      this.provider,
      required this.coverAmount,
      required this.premium,
      this.renewalDate,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['name'] = Variable<String>(name);
    map['type'] = Variable<String>(type);
    if (!nullToAbsent || provider != null) {
      map['provider'] = Variable<String>(provider);
    }
    {
      map['cover_amount'] = Variable<String>(
          $InsurancesTable.$convertercoverAmount.toSql(coverAmount));
    }
    {
      map['premium'] =
          Variable<String>($InsurancesTable.$converterpremium.toSql(premium));
    }
    if (!nullToAbsent || renewalDate != null) {
      map['renewal_date'] = Variable<int>(renewalDate);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  InsurancesCompanion toCompanion(bool nullToAbsent) {
    return InsurancesCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      name: Value(name),
      type: Value(type),
      provider: provider == null && nullToAbsent
          ? const Value.absent()
          : Value(provider),
      coverAmount: Value(coverAmount),
      premium: Value(premium),
      renewalDate: renewalDate == null && nullToAbsent
          ? const Value.absent()
          : Value(renewalDate),
      createdAt: Value(createdAt),
    );
  }

  factory InsuranceRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return InsuranceRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      name: serializer.fromJson<String>(json['name']),
      type: serializer.fromJson<String>(json['type']),
      provider: serializer.fromJson<String?>(json['provider']),
      coverAmount: serializer.fromJson<Decimal>(json['coverAmount']),
      premium: serializer.fromJson<Decimal>(json['premium']),
      renewalDate: serializer.fromJson<int?>(json['renewalDate']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'name': serializer.toJson<String>(name),
      'type': serializer.toJson<String>(type),
      'provider': serializer.toJson<String?>(provider),
      'coverAmount': serializer.toJson<Decimal>(coverAmount),
      'premium': serializer.toJson<Decimal>(premium),
      'renewalDate': serializer.toJson<int?>(renewalDate),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  InsuranceRow copyWith(
          {String? id,
          String? vaultId,
          String? name,
          String? type,
          Value<String?> provider = const Value.absent(),
          Decimal? coverAmount,
          Decimal? premium,
          Value<int?> renewalDate = const Value.absent(),
          int? createdAt}) =>
      InsuranceRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        name: name ?? this.name,
        type: type ?? this.type,
        provider: provider.present ? provider.value : this.provider,
        coverAmount: coverAmount ?? this.coverAmount,
        premium: premium ?? this.premium,
        renewalDate: renewalDate.present ? renewalDate.value : this.renewalDate,
        createdAt: createdAt ?? this.createdAt,
      );
  InsuranceRow copyWithCompanion(InsurancesCompanion data) {
    return InsuranceRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      name: data.name.present ? data.name.value : this.name,
      type: data.type.present ? data.type.value : this.type,
      provider: data.provider.present ? data.provider.value : this.provider,
      coverAmount:
          data.coverAmount.present ? data.coverAmount.value : this.coverAmount,
      premium: data.premium.present ? data.premium.value : this.premium,
      renewalDate:
          data.renewalDate.present ? data.renewalDate.value : this.renewalDate,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('InsuranceRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('type: $type, ')
          ..write('provider: $provider, ')
          ..write('coverAmount: $coverAmount, ')
          ..write('premium: $premium, ')
          ..write('renewalDate: $renewalDate, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, name, type, provider,
      coverAmount, premium, renewalDate, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is InsuranceRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.name == this.name &&
          other.type == this.type &&
          other.provider == this.provider &&
          other.coverAmount == this.coverAmount &&
          other.premium == this.premium &&
          other.renewalDate == this.renewalDate &&
          other.createdAt == this.createdAt);
}

class InsurancesCompanion extends UpdateCompanion<InsuranceRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> name;
  final Value<String> type;
  final Value<String?> provider;
  final Value<Decimal> coverAmount;
  final Value<Decimal> premium;
  final Value<int?> renewalDate;
  final Value<int> createdAt;
  final Value<int> rowid;
  const InsurancesCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.name = const Value.absent(),
    this.type = const Value.absent(),
    this.provider = const Value.absent(),
    this.coverAmount = const Value.absent(),
    this.premium = const Value.absent(),
    this.renewalDate = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  InsurancesCompanion.insert({
    required String id,
    required String vaultId,
    required String name,
    required String type,
    this.provider = const Value.absent(),
    required Decimal coverAmount,
    required Decimal premium,
    this.renewalDate = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        name = Value(name),
        type = Value(type),
        coverAmount = Value(coverAmount),
        premium = Value(premium),
        createdAt = Value(createdAt);
  static Insertable<InsuranceRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? name,
    Expression<String>? type,
    Expression<String>? provider,
    Expression<String>? coverAmount,
    Expression<String>? premium,
    Expression<int>? renewalDate,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (name != null) 'name': name,
      if (type != null) 'type': type,
      if (provider != null) 'provider': provider,
      if (coverAmount != null) 'cover_amount': coverAmount,
      if (premium != null) 'premium': premium,
      if (renewalDate != null) 'renewal_date': renewalDate,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  InsurancesCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? name,
      Value<String>? type,
      Value<String?>? provider,
      Value<Decimal>? coverAmount,
      Value<Decimal>? premium,
      Value<int?>? renewalDate,
      Value<int>? createdAt,
      Value<int>? rowid}) {
    return InsurancesCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      name: name ?? this.name,
      type: type ?? this.type,
      provider: provider ?? this.provider,
      coverAmount: coverAmount ?? this.coverAmount,
      premium: premium ?? this.premium,
      renewalDate: renewalDate ?? this.renewalDate,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (provider.present) {
      map['provider'] = Variable<String>(provider.value);
    }
    if (coverAmount.present) {
      map['cover_amount'] = Variable<String>(
          $InsurancesTable.$convertercoverAmount.toSql(coverAmount.value));
    }
    if (premium.present) {
      map['premium'] = Variable<String>(
          $InsurancesTable.$converterpremium.toSql(premium.value));
    }
    if (renewalDate.present) {
      map['renewal_date'] = Variable<int>(renewalDate.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('InsurancesCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('type: $type, ')
          ..write('provider: $provider, ')
          ..write('coverAmount: $coverAmount, ')
          ..write('premium: $premium, ')
          ..write('renewalDate: $renewalDate, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $NetWorthSnapshotsTable extends NetWorthSnapshots
    with TableInfo<$NetWorthSnapshotsTable, NetWorthSnapshotRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $NetWorthSnapshotsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _dateMeta = const VerificationMeta('date');
  @override
  late final GeneratedColumn<int> date = GeneratedColumn<int>(
      'date', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _netWorthMeta =
      const VerificationMeta('netWorth');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> netWorth =
      GeneratedColumn<String>('net_worth', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($NetWorthSnapshotsTable.$converternetWorth);
  static const VerificationMeta _cashMeta = const VerificationMeta('cash');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> cash =
      GeneratedColumn<String>('cash', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($NetWorthSnapshotsTable.$convertercash);
  static const VerificationMeta _investmentsMeta =
      const VerificationMeta('investments');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> investments =
      GeneratedColumn<String>('investments', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>(
              $NetWorthSnapshotsTable.$converterinvestments);
  static const VerificationMeta _liabilitiesMeta =
      const VerificationMeta('liabilities');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> liabilities =
      GeneratedColumn<String>('liabilities', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>(
              $NetWorthSnapshotsTable.$converterliabilities);
  @override
  List<GeneratedColumn> get $columns =>
      [id, vaultId, date, netWorth, cash, investments, liabilities];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'net_worth_snapshots';
  @override
  VerificationContext validateIntegrity(
      Insertable<NetWorthSnapshotRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('date')) {
      context.handle(
          _dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));
    } else if (isInserting) {
      context.missing(_dateMeta);
    }
    context.handle(_netWorthMeta, const VerificationResult.success());
    context.handle(_cashMeta, const VerificationResult.success());
    context.handle(_investmentsMeta, const VerificationResult.success());
    context.handle(_liabilitiesMeta, const VerificationResult.success());
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  NetWorthSnapshotRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return NetWorthSnapshotRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      date: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}date'])!,
      netWorth: $NetWorthSnapshotsTable.$converternetWorth.fromSql(
          attachedDatabase.typeMapping
              .read(DriftSqlType.string, data['${effectivePrefix}net_worth'])!),
      cash: $NetWorthSnapshotsTable.$convertercash.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}cash'])!),
      investments: $NetWorthSnapshotsTable.$converterinvestments.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.string, data['${effectivePrefix}investments'])!),
      liabilities: $NetWorthSnapshotsTable.$converterliabilities.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.string, data['${effectivePrefix}liabilities'])!),
    );
  }

  @override
  $NetWorthSnapshotsTable createAlias(String alias) {
    return $NetWorthSnapshotsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converternetWorth =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $convertercash =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $converterinvestments =
      const DecimalConverter();
  static TypeConverter<Decimal, String> $converterliabilities =
      const DecimalConverter();
}

class NetWorthSnapshotRow extends DataClass
    implements Insertable<NetWorthSnapshotRow> {
  final String id;
  final String vaultId;
  final int date;
  final Decimal netWorth;
  final Decimal cash;
  final Decimal investments;
  final Decimal liabilities;
  const NetWorthSnapshotRow(
      {required this.id,
      required this.vaultId,
      required this.date,
      required this.netWorth,
      required this.cash,
      required this.investments,
      required this.liabilities});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['date'] = Variable<int>(date);
    {
      map['net_worth'] = Variable<String>(
          $NetWorthSnapshotsTable.$converternetWorth.toSql(netWorth));
    }
    {
      map['cash'] =
          Variable<String>($NetWorthSnapshotsTable.$convertercash.toSql(cash));
    }
    {
      map['investments'] = Variable<String>(
          $NetWorthSnapshotsTable.$converterinvestments.toSql(investments));
    }
    {
      map['liabilities'] = Variable<String>(
          $NetWorthSnapshotsTable.$converterliabilities.toSql(liabilities));
    }
    return map;
  }

  NetWorthSnapshotsCompanion toCompanion(bool nullToAbsent) {
    return NetWorthSnapshotsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      date: Value(date),
      netWorth: Value(netWorth),
      cash: Value(cash),
      investments: Value(investments),
      liabilities: Value(liabilities),
    );
  }

  factory NetWorthSnapshotRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return NetWorthSnapshotRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      date: serializer.fromJson<int>(json['date']),
      netWorth: serializer.fromJson<Decimal>(json['netWorth']),
      cash: serializer.fromJson<Decimal>(json['cash']),
      investments: serializer.fromJson<Decimal>(json['investments']),
      liabilities: serializer.fromJson<Decimal>(json['liabilities']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'date': serializer.toJson<int>(date),
      'netWorth': serializer.toJson<Decimal>(netWorth),
      'cash': serializer.toJson<Decimal>(cash),
      'investments': serializer.toJson<Decimal>(investments),
      'liabilities': serializer.toJson<Decimal>(liabilities),
    };
  }

  NetWorthSnapshotRow copyWith(
          {String? id,
          String? vaultId,
          int? date,
          Decimal? netWorth,
          Decimal? cash,
          Decimal? investments,
          Decimal? liabilities}) =>
      NetWorthSnapshotRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        date: date ?? this.date,
        netWorth: netWorth ?? this.netWorth,
        cash: cash ?? this.cash,
        investments: investments ?? this.investments,
        liabilities: liabilities ?? this.liabilities,
      );
  NetWorthSnapshotRow copyWithCompanion(NetWorthSnapshotsCompanion data) {
    return NetWorthSnapshotRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      date: data.date.present ? data.date.value : this.date,
      netWorth: data.netWorth.present ? data.netWorth.value : this.netWorth,
      cash: data.cash.present ? data.cash.value : this.cash,
      investments:
          data.investments.present ? data.investments.value : this.investments,
      liabilities:
          data.liabilities.present ? data.liabilities.value : this.liabilities,
    );
  }

  @override
  String toString() {
    return (StringBuffer('NetWorthSnapshotRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('date: $date, ')
          ..write('netWorth: $netWorth, ')
          ..write('cash: $cash, ')
          ..write('investments: $investments, ')
          ..write('liabilities: $liabilities')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, vaultId, date, netWorth, cash, investments, liabilities);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is NetWorthSnapshotRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.date == this.date &&
          other.netWorth == this.netWorth &&
          other.cash == this.cash &&
          other.investments == this.investments &&
          other.liabilities == this.liabilities);
}

class NetWorthSnapshotsCompanion extends UpdateCompanion<NetWorthSnapshotRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<int> date;
  final Value<Decimal> netWorth;
  final Value<Decimal> cash;
  final Value<Decimal> investments;
  final Value<Decimal> liabilities;
  final Value<int> rowid;
  const NetWorthSnapshotsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.date = const Value.absent(),
    this.netWorth = const Value.absent(),
    this.cash = const Value.absent(),
    this.investments = const Value.absent(),
    this.liabilities = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  NetWorthSnapshotsCompanion.insert({
    required String id,
    required String vaultId,
    required int date,
    required Decimal netWorth,
    required Decimal cash,
    required Decimal investments,
    required Decimal liabilities,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        date = Value(date),
        netWorth = Value(netWorth),
        cash = Value(cash),
        investments = Value(investments),
        liabilities = Value(liabilities);
  static Insertable<NetWorthSnapshotRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<int>? date,
    Expression<String>? netWorth,
    Expression<String>? cash,
    Expression<String>? investments,
    Expression<String>? liabilities,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (date != null) 'date': date,
      if (netWorth != null) 'net_worth': netWorth,
      if (cash != null) 'cash': cash,
      if (investments != null) 'investments': investments,
      if (liabilities != null) 'liabilities': liabilities,
      if (rowid != null) 'rowid': rowid,
    });
  }

  NetWorthSnapshotsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<int>? date,
      Value<Decimal>? netWorth,
      Value<Decimal>? cash,
      Value<Decimal>? investments,
      Value<Decimal>? liabilities,
      Value<int>? rowid}) {
    return NetWorthSnapshotsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      date: date ?? this.date,
      netWorth: netWorth ?? this.netWorth,
      cash: cash ?? this.cash,
      investments: investments ?? this.investments,
      liabilities: liabilities ?? this.liabilities,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (date.present) {
      map['date'] = Variable<int>(date.value);
    }
    if (netWorth.present) {
      map['net_worth'] = Variable<String>(
          $NetWorthSnapshotsTable.$converternetWorth.toSql(netWorth.value));
    }
    if (cash.present) {
      map['cash'] = Variable<String>(
          $NetWorthSnapshotsTable.$convertercash.toSql(cash.value));
    }
    if (investments.present) {
      map['investments'] = Variable<String>($NetWorthSnapshotsTable
          .$converterinvestments
          .toSql(investments.value));
    }
    if (liabilities.present) {
      map['liabilities'] = Variable<String>($NetWorthSnapshotsTable
          .$converterliabilities
          .toSql(liabilities.value));
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('NetWorthSnapshotsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('date: $date, ')
          ..write('netWorth: $netWorth, ')
          ..write('cash: $cash, ')
          ..write('investments: $investments, ')
          ..write('liabilities: $liabilities, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AccountsTable extends Accounts
    with TableInfo<$AccountsTable, AccountRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AccountsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
      'type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _subtypeMeta =
      const VerificationMeta('subtype');
  @override
  late final GeneratedColumn<String> subtype = GeneratedColumn<String>(
      'subtype', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('cash'));
  static const VerificationMeta _currencyMeta =
      const VerificationMeta('currency');
  @override
  late final GeneratedColumn<String> currency = GeneratedColumn<String>(
      'currency', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('INR'));
  static const VerificationMeta _openingBalanceMeta =
      const VerificationMeta('openingBalance');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> openingBalance =
      GeneratedColumn<String>('opening_balance', aliasedName, false,
              type: DriftSqlType.string,
              requiredDuringInsert: false,
              defaultValue: const Constant('0'))
          .withConverter<Decimal>($AccountsTable.$converteropeningBalance);
  static const VerificationMeta _archivedMeta =
      const VerificationMeta('archived');
  @override
  late final GeneratedColumn<bool> archived = GeneratedColumn<bool>(
      'archived', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("archived" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
      'created_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        name,
        type,
        subtype,
        currency,
        openingBalance,
        archived,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'accounts';
  @override
  VerificationContext validateIntegrity(Insertable<AccountRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('type')) {
      context.handle(
          _typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('subtype')) {
      context.handle(_subtypeMeta,
          subtype.isAcceptableOrUnknown(data['subtype']!, _subtypeMeta));
    }
    if (data.containsKey('currency')) {
      context.handle(_currencyMeta,
          currency.isAcceptableOrUnknown(data['currency']!, _currencyMeta));
    }
    context.handle(_openingBalanceMeta, const VerificationResult.success());
    if (data.containsKey('archived')) {
      context.handle(_archivedMeta,
          archived.isAcceptableOrUnknown(data['archived']!, _archivedMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  AccountRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AccountRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      type: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      subtype: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}subtype'])!,
      currency: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}currency'])!,
      openingBalance: $AccountsTable.$converteropeningBalance.fromSql(
          attachedDatabase.typeMapping.read(
              DriftSqlType.string, data['${effectivePrefix}opening_balance'])!),
      archived: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}archived'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $AccountsTable createAlias(String alias) {
    return $AccountsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteropeningBalance =
      const DecimalConverter();
}

class AccountRow extends DataClass implements Insertable<AccountRow> {
  final String id;
  final String vaultId;
  final String name;
  final String type;
  final String subtype;
  final String currency;
  final Decimal openingBalance;
  final bool archived;
  final int createdAt;
  const AccountRow(
      {required this.id,
      required this.vaultId,
      required this.name,
      required this.type,
      required this.subtype,
      required this.currency,
      required this.openingBalance,
      required this.archived,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['name'] = Variable<String>(name);
    map['type'] = Variable<String>(type);
    map['subtype'] = Variable<String>(subtype);
    map['currency'] = Variable<String>(currency);
    {
      map['opening_balance'] = Variable<String>(
          $AccountsTable.$converteropeningBalance.toSql(openingBalance));
    }
    map['archived'] = Variable<bool>(archived);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  AccountsCompanion toCompanion(bool nullToAbsent) {
    return AccountsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      name: Value(name),
      type: Value(type),
      subtype: Value(subtype),
      currency: Value(currency),
      openingBalance: Value(openingBalance),
      archived: Value(archived),
      createdAt: Value(createdAt),
    );
  }

  factory AccountRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AccountRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      name: serializer.fromJson<String>(json['name']),
      type: serializer.fromJson<String>(json['type']),
      subtype: serializer.fromJson<String>(json['subtype']),
      currency: serializer.fromJson<String>(json['currency']),
      openingBalance: serializer.fromJson<Decimal>(json['openingBalance']),
      archived: serializer.fromJson<bool>(json['archived']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'name': serializer.toJson<String>(name),
      'type': serializer.toJson<String>(type),
      'subtype': serializer.toJson<String>(subtype),
      'currency': serializer.toJson<String>(currency),
      'openingBalance': serializer.toJson<Decimal>(openingBalance),
      'archived': serializer.toJson<bool>(archived),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  AccountRow copyWith(
          {String? id,
          String? vaultId,
          String? name,
          String? type,
          String? subtype,
          String? currency,
          Decimal? openingBalance,
          bool? archived,
          int? createdAt}) =>
      AccountRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        name: name ?? this.name,
        type: type ?? this.type,
        subtype: subtype ?? this.subtype,
        currency: currency ?? this.currency,
        openingBalance: openingBalance ?? this.openingBalance,
        archived: archived ?? this.archived,
        createdAt: createdAt ?? this.createdAt,
      );
  AccountRow copyWithCompanion(AccountsCompanion data) {
    return AccountRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      name: data.name.present ? data.name.value : this.name,
      type: data.type.present ? data.type.value : this.type,
      subtype: data.subtype.present ? data.subtype.value : this.subtype,
      currency: data.currency.present ? data.currency.value : this.currency,
      openingBalance: data.openingBalance.present
          ? data.openingBalance.value
          : this.openingBalance,
      archived: data.archived.present ? data.archived.value : this.archived,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AccountRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('type: $type, ')
          ..write('subtype: $subtype, ')
          ..write('currency: $currency, ')
          ..write('openingBalance: $openingBalance, ')
          ..write('archived: $archived, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, name, type, subtype, currency,
      openingBalance, archived, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AccountRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.name == this.name &&
          other.type == this.type &&
          other.subtype == this.subtype &&
          other.currency == this.currency &&
          other.openingBalance == this.openingBalance &&
          other.archived == this.archived &&
          other.createdAt == this.createdAt);
}

class AccountsCompanion extends UpdateCompanion<AccountRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> name;
  final Value<String> type;
  final Value<String> subtype;
  final Value<String> currency;
  final Value<Decimal> openingBalance;
  final Value<bool> archived;
  final Value<int> createdAt;
  final Value<int> rowid;
  const AccountsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.name = const Value.absent(),
    this.type = const Value.absent(),
    this.subtype = const Value.absent(),
    this.currency = const Value.absent(),
    this.openingBalance = const Value.absent(),
    this.archived = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AccountsCompanion.insert({
    required String id,
    required String vaultId,
    required String name,
    required String type,
    this.subtype = const Value.absent(),
    this.currency = const Value.absent(),
    this.openingBalance = const Value.absent(),
    this.archived = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        name = Value(name),
        type = Value(type),
        createdAt = Value(createdAt);
  static Insertable<AccountRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? name,
    Expression<String>? type,
    Expression<String>? subtype,
    Expression<String>? currency,
    Expression<String>? openingBalance,
    Expression<bool>? archived,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (name != null) 'name': name,
      if (type != null) 'type': type,
      if (subtype != null) 'subtype': subtype,
      if (currency != null) 'currency': currency,
      if (openingBalance != null) 'opening_balance': openingBalance,
      if (archived != null) 'archived': archived,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AccountsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? name,
      Value<String>? type,
      Value<String>? subtype,
      Value<String>? currency,
      Value<Decimal>? openingBalance,
      Value<bool>? archived,
      Value<int>? createdAt,
      Value<int>? rowid}) {
    return AccountsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      name: name ?? this.name,
      type: type ?? this.type,
      subtype: subtype ?? this.subtype,
      currency: currency ?? this.currency,
      openingBalance: openingBalance ?? this.openingBalance,
      archived: archived ?? this.archived,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (subtype.present) {
      map['subtype'] = Variable<String>(subtype.value);
    }
    if (currency.present) {
      map['currency'] = Variable<String>(currency.value);
    }
    if (openingBalance.present) {
      map['opening_balance'] = Variable<String>(
          $AccountsTable.$converteropeningBalance.toSql(openingBalance.value));
    }
    if (archived.present) {
      map['archived'] = Variable<bool>(archived.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AccountsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('name: $name, ')
          ..write('type: $type, ')
          ..write('subtype: $subtype, ')
          ..write('currency: $currency, ')
          ..write('openingBalance: $openingBalance, ')
          ..write('archived: $archived, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PostingsTable extends Postings
    with TableInfo<$PostingsTable, PostingRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PostingsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _entryIdMeta =
      const VerificationMeta('entryId');
  @override
  late final GeneratedColumn<String> entryId = GeneratedColumn<String>(
      'entry_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES transactions (id)'));
  static const VerificationMeta _accountIdMeta =
      const VerificationMeta('accountId');
  @override
  late final GeneratedColumn<String> accountId = GeneratedColumn<String>(
      'account_id', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: true,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('REFERENCES accounts (id)'));
  static const VerificationMeta _amountMeta = const VerificationMeta('amount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> amount =
      GeneratedColumn<String>('amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($PostingsTable.$converteramount);
  @override
  List<GeneratedColumn> get $columns =>
      [id, vaultId, entryId, accountId, amount];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'postings';
  @override
  VerificationContext validateIntegrity(Insertable<PostingRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    if (data.containsKey('entry_id')) {
      context.handle(_entryIdMeta,
          entryId.isAcceptableOrUnknown(data['entry_id']!, _entryIdMeta));
    } else if (isInserting) {
      context.missing(_entryIdMeta);
    }
    if (data.containsKey('account_id')) {
      context.handle(_accountIdMeta,
          accountId.isAcceptableOrUnknown(data['account_id']!, _accountIdMeta));
    } else if (isInserting) {
      context.missing(_accountIdMeta);
    }
    context.handle(_amountMeta, const VerificationResult.success());
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PostingRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PostingRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      entryId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}entry_id'])!,
      accountId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}account_id'])!,
      amount: $PostingsTable.$converteramount.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}amount'])!),
    );
  }

  @override
  $PostingsTable createAlias(String alias) {
    return $PostingsTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteramount =
      const DecimalConverter();
}

class PostingRow extends DataClass implements Insertable<PostingRow> {
  final String id;
  final String vaultId;
  final String entryId;
  final String accountId;
  final Decimal amount;
  const PostingRow(
      {required this.id,
      required this.vaultId,
      required this.entryId,
      required this.accountId,
      required this.amount});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    map['entry_id'] = Variable<String>(entryId);
    map['account_id'] = Variable<String>(accountId);
    {
      map['amount'] =
          Variable<String>($PostingsTable.$converteramount.toSql(amount));
    }
    return map;
  }

  PostingsCompanion toCompanion(bool nullToAbsent) {
    return PostingsCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      entryId: Value(entryId),
      accountId: Value(accountId),
      amount: Value(amount),
    );
  }

  factory PostingRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PostingRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      entryId: serializer.fromJson<String>(json['entryId']),
      accountId: serializer.fromJson<String>(json['accountId']),
      amount: serializer.fromJson<Decimal>(json['amount']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'entryId': serializer.toJson<String>(entryId),
      'accountId': serializer.toJson<String>(accountId),
      'amount': serializer.toJson<Decimal>(amount),
    };
  }

  PostingRow copyWith(
          {String? id,
          String? vaultId,
          String? entryId,
          String? accountId,
          Decimal? amount}) =>
      PostingRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        entryId: entryId ?? this.entryId,
        accountId: accountId ?? this.accountId,
        amount: amount ?? this.amount,
      );
  PostingRow copyWithCompanion(PostingsCompanion data) {
    return PostingRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      entryId: data.entryId.present ? data.entryId.value : this.entryId,
      accountId: data.accountId.present ? data.accountId.value : this.accountId,
      amount: data.amount.present ? data.amount.value : this.amount,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PostingRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('entryId: $entryId, ')
          ..write('accountId: $accountId, ')
          ..write('amount: $amount')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, entryId, accountId, amount);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PostingRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.entryId == this.entryId &&
          other.accountId == this.accountId &&
          other.amount == this.amount);
}

class PostingsCompanion extends UpdateCompanion<PostingRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<String> entryId;
  final Value<String> accountId;
  final Value<Decimal> amount;
  final Value<int> rowid;
  const PostingsCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.entryId = const Value.absent(),
    this.accountId = const Value.absent(),
    this.amount = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PostingsCompanion.insert({
    required String id,
    required String vaultId,
    required String entryId,
    required String accountId,
    required Decimal amount,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        entryId = Value(entryId),
        accountId = Value(accountId),
        amount = Value(amount);
  static Insertable<PostingRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? entryId,
    Expression<String>? accountId,
    Expression<String>? amount,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (entryId != null) 'entry_id': entryId,
      if (accountId != null) 'account_id': accountId,
      if (amount != null) 'amount': amount,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PostingsCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<String>? entryId,
      Value<String>? accountId,
      Value<Decimal>? amount,
      Value<int>? rowid}) {
    return PostingsCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      entryId: entryId ?? this.entryId,
      accountId: accountId ?? this.accountId,
      amount: amount ?? this.amount,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (entryId.present) {
      map['entry_id'] = Variable<String>(entryId.value);
    }
    if (accountId.present) {
      map['account_id'] = Variable<String>(accountId.value);
    }
    if (amount.present) {
      map['amount'] =
          Variable<String>($PostingsTable.$converteramount.toSql(amount.value));
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PostingsCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('entryId: $entryId, ')
          ..write('accountId: $accountId, ')
          ..write('amount: $amount, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PendingCapturesTable extends PendingCaptures
    with TableInfo<$PendingCapturesTable, PendingCaptureRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PendingCapturesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _vaultIdMeta =
      const VerificationMeta('vaultId');
  @override
  late final GeneratedColumn<String> vaultId = GeneratedColumn<String>(
      'vault_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _amountMeta = const VerificationMeta('amount');
  @override
  late final GeneratedColumnWithTypeConverter<Decimal, String> amount =
      GeneratedColumn<String>('amount', aliasedName, false,
              type: DriftSqlType.string, requiredDuringInsert: true)
          .withConverter<Decimal>($PendingCapturesTable.$converteramount);
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
      'type', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _merchantMeta =
      const VerificationMeta('merchant');
  @override
  late final GeneratedColumn<String> merchant = GeneratedColumn<String>(
      'merchant', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _occurredAtMeta =
      const VerificationMeta('occurredAt');
  @override
  late final GeneratedColumn<int> occurredAt = GeneratedColumn<int>(
      'occurred_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _uncategorizedMeta =
      const VerificationMeta('uncategorized');
  @override
  late final GeneratedColumn<bool> uncategorized = GeneratedColumn<bool>(
      'uncategorized', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("uncategorized" IN (0, 1))'),
      defaultValue: const Constant(true));
  static const VerificationMeta _fingerprintMeta =
      const VerificationMeta('fingerprint');
  @override
  late final GeneratedColumn<String> fingerprint = GeneratedColumn<String>(
      'fingerprint', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _capturedAtMeta =
      const VerificationMeta('capturedAt');
  @override
  late final GeneratedColumn<int> capturedAt = GeneratedColumn<int>(
      'captured_at', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        vaultId,
        amount,
        type,
        merchant,
        occurredAt,
        source,
        uncategorized,
        fingerprint,
        capturedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_captures';
  @override
  VerificationContext validateIntegrity(Insertable<PendingCaptureRow> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('vault_id')) {
      context.handle(_vaultIdMeta,
          vaultId.isAcceptableOrUnknown(data['vault_id']!, _vaultIdMeta));
    } else if (isInserting) {
      context.missing(_vaultIdMeta);
    }
    context.handle(_amountMeta, const VerificationResult.success());
    if (data.containsKey('type')) {
      context.handle(
          _typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('merchant')) {
      context.handle(_merchantMeta,
          merchant.isAcceptableOrUnknown(data['merchant']!, _merchantMeta));
    }
    if (data.containsKey('occurred_at')) {
      context.handle(
          _occurredAtMeta,
          occurredAt.isAcceptableOrUnknown(
              data['occurred_at']!, _occurredAtMeta));
    } else if (isInserting) {
      context.missing(_occurredAtMeta);
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    } else if (isInserting) {
      context.missing(_sourceMeta);
    }
    if (data.containsKey('uncategorized')) {
      context.handle(
          _uncategorizedMeta,
          uncategorized.isAcceptableOrUnknown(
              data['uncategorized']!, _uncategorizedMeta));
    }
    if (data.containsKey('fingerprint')) {
      context.handle(
          _fingerprintMeta,
          fingerprint.isAcceptableOrUnknown(
              data['fingerprint']!, _fingerprintMeta));
    } else if (isInserting) {
      context.missing(_fingerprintMeta);
    }
    if (data.containsKey('captured_at')) {
      context.handle(
          _capturedAtMeta,
          capturedAt.isAcceptableOrUnknown(
              data['captured_at']!, _capturedAtMeta));
    } else if (isInserting) {
      context.missing(_capturedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  PendingCaptureRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingCaptureRow(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      vaultId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}vault_id'])!,
      amount: $PendingCapturesTable.$converteramount.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}amount'])!),
      type: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      merchant: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}merchant']),
      occurredAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}occurred_at'])!,
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      uncategorized: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}uncategorized'])!,
      fingerprint: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}fingerprint'])!,
      capturedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}captured_at'])!,
    );
  }

  @override
  $PendingCapturesTable createAlias(String alias) {
    return $PendingCapturesTable(attachedDatabase, alias);
  }

  static TypeConverter<Decimal, String> $converteramount =
      const DecimalConverter();
}

class PendingCaptureRow extends DataClass
    implements Insertable<PendingCaptureRow> {
  final String id;
  final String vaultId;
  final Decimal amount;
  final String type;
  final String? merchant;
  final int occurredAt;
  final String source;
  final bool uncategorized;
  final String fingerprint;
  final int capturedAt;
  const PendingCaptureRow(
      {required this.id,
      required this.vaultId,
      required this.amount,
      required this.type,
      this.merchant,
      required this.occurredAt,
      required this.source,
      required this.uncategorized,
      required this.fingerprint,
      required this.capturedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['vault_id'] = Variable<String>(vaultId);
    {
      map['amount'] = Variable<String>(
          $PendingCapturesTable.$converteramount.toSql(amount));
    }
    map['type'] = Variable<String>(type);
    if (!nullToAbsent || merchant != null) {
      map['merchant'] = Variable<String>(merchant);
    }
    map['occurred_at'] = Variable<int>(occurredAt);
    map['source'] = Variable<String>(source);
    map['uncategorized'] = Variable<bool>(uncategorized);
    map['fingerprint'] = Variable<String>(fingerprint);
    map['captured_at'] = Variable<int>(capturedAt);
    return map;
  }

  PendingCapturesCompanion toCompanion(bool nullToAbsent) {
    return PendingCapturesCompanion(
      id: Value(id),
      vaultId: Value(vaultId),
      amount: Value(amount),
      type: Value(type),
      merchant: merchant == null && nullToAbsent
          ? const Value.absent()
          : Value(merchant),
      occurredAt: Value(occurredAt),
      source: Value(source),
      uncategorized: Value(uncategorized),
      fingerprint: Value(fingerprint),
      capturedAt: Value(capturedAt),
    );
  }

  factory PendingCaptureRow.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingCaptureRow(
      id: serializer.fromJson<String>(json['id']),
      vaultId: serializer.fromJson<String>(json['vaultId']),
      amount: serializer.fromJson<Decimal>(json['amount']),
      type: serializer.fromJson<String>(json['type']),
      merchant: serializer.fromJson<String?>(json['merchant']),
      occurredAt: serializer.fromJson<int>(json['occurredAt']),
      source: serializer.fromJson<String>(json['source']),
      uncategorized: serializer.fromJson<bool>(json['uncategorized']),
      fingerprint: serializer.fromJson<String>(json['fingerprint']),
      capturedAt: serializer.fromJson<int>(json['capturedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'vaultId': serializer.toJson<String>(vaultId),
      'amount': serializer.toJson<Decimal>(amount),
      'type': serializer.toJson<String>(type),
      'merchant': serializer.toJson<String?>(merchant),
      'occurredAt': serializer.toJson<int>(occurredAt),
      'source': serializer.toJson<String>(source),
      'uncategorized': serializer.toJson<bool>(uncategorized),
      'fingerprint': serializer.toJson<String>(fingerprint),
      'capturedAt': serializer.toJson<int>(capturedAt),
    };
  }

  PendingCaptureRow copyWith(
          {String? id,
          String? vaultId,
          Decimal? amount,
          String? type,
          Value<String?> merchant = const Value.absent(),
          int? occurredAt,
          String? source,
          bool? uncategorized,
          String? fingerprint,
          int? capturedAt}) =>
      PendingCaptureRow(
        id: id ?? this.id,
        vaultId: vaultId ?? this.vaultId,
        amount: amount ?? this.amount,
        type: type ?? this.type,
        merchant: merchant.present ? merchant.value : this.merchant,
        occurredAt: occurredAt ?? this.occurredAt,
        source: source ?? this.source,
        uncategorized: uncategorized ?? this.uncategorized,
        fingerprint: fingerprint ?? this.fingerprint,
        capturedAt: capturedAt ?? this.capturedAt,
      );
  PendingCaptureRow copyWithCompanion(PendingCapturesCompanion data) {
    return PendingCaptureRow(
      id: data.id.present ? data.id.value : this.id,
      vaultId: data.vaultId.present ? data.vaultId.value : this.vaultId,
      amount: data.amount.present ? data.amount.value : this.amount,
      type: data.type.present ? data.type.value : this.type,
      merchant: data.merchant.present ? data.merchant.value : this.merchant,
      occurredAt:
          data.occurredAt.present ? data.occurredAt.value : this.occurredAt,
      source: data.source.present ? data.source.value : this.source,
      uncategorized: data.uncategorized.present
          ? data.uncategorized.value
          : this.uncategorized,
      fingerprint:
          data.fingerprint.present ? data.fingerprint.value : this.fingerprint,
      capturedAt:
          data.capturedAt.present ? data.capturedAt.value : this.capturedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PendingCaptureRow(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('amount: $amount, ')
          ..write('type: $type, ')
          ..write('merchant: $merchant, ')
          ..write('occurredAt: $occurredAt, ')
          ..write('source: $source, ')
          ..write('uncategorized: $uncategorized, ')
          ..write('fingerprint: $fingerprint, ')
          ..write('capturedAt: $capturedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, vaultId, amount, type, merchant,
      occurredAt, source, uncategorized, fingerprint, capturedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingCaptureRow &&
          other.id == this.id &&
          other.vaultId == this.vaultId &&
          other.amount == this.amount &&
          other.type == this.type &&
          other.merchant == this.merchant &&
          other.occurredAt == this.occurredAt &&
          other.source == this.source &&
          other.uncategorized == this.uncategorized &&
          other.fingerprint == this.fingerprint &&
          other.capturedAt == this.capturedAt);
}

class PendingCapturesCompanion extends UpdateCompanion<PendingCaptureRow> {
  final Value<String> id;
  final Value<String> vaultId;
  final Value<Decimal> amount;
  final Value<String> type;
  final Value<String?> merchant;
  final Value<int> occurredAt;
  final Value<String> source;
  final Value<bool> uncategorized;
  final Value<String> fingerprint;
  final Value<int> capturedAt;
  final Value<int> rowid;
  const PendingCapturesCompanion({
    this.id = const Value.absent(),
    this.vaultId = const Value.absent(),
    this.amount = const Value.absent(),
    this.type = const Value.absent(),
    this.merchant = const Value.absent(),
    this.occurredAt = const Value.absent(),
    this.source = const Value.absent(),
    this.uncategorized = const Value.absent(),
    this.fingerprint = const Value.absent(),
    this.capturedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingCapturesCompanion.insert({
    required String id,
    required String vaultId,
    required Decimal amount,
    required String type,
    this.merchant = const Value.absent(),
    required int occurredAt,
    required String source,
    this.uncategorized = const Value.absent(),
    required String fingerprint,
    required int capturedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        vaultId = Value(vaultId),
        amount = Value(amount),
        type = Value(type),
        occurredAt = Value(occurredAt),
        source = Value(source),
        fingerprint = Value(fingerprint),
        capturedAt = Value(capturedAt);
  static Insertable<PendingCaptureRow> custom({
    Expression<String>? id,
    Expression<String>? vaultId,
    Expression<String>? amount,
    Expression<String>? type,
    Expression<String>? merchant,
    Expression<int>? occurredAt,
    Expression<String>? source,
    Expression<bool>? uncategorized,
    Expression<String>? fingerprint,
    Expression<int>? capturedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (vaultId != null) 'vault_id': vaultId,
      if (amount != null) 'amount': amount,
      if (type != null) 'type': type,
      if (merchant != null) 'merchant': merchant,
      if (occurredAt != null) 'occurred_at': occurredAt,
      if (source != null) 'source': source,
      if (uncategorized != null) 'uncategorized': uncategorized,
      if (fingerprint != null) 'fingerprint': fingerprint,
      if (capturedAt != null) 'captured_at': capturedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingCapturesCompanion copyWith(
      {Value<String>? id,
      Value<String>? vaultId,
      Value<Decimal>? amount,
      Value<String>? type,
      Value<String?>? merchant,
      Value<int>? occurredAt,
      Value<String>? source,
      Value<bool>? uncategorized,
      Value<String>? fingerprint,
      Value<int>? capturedAt,
      Value<int>? rowid}) {
    return PendingCapturesCompanion(
      id: id ?? this.id,
      vaultId: vaultId ?? this.vaultId,
      amount: amount ?? this.amount,
      type: type ?? this.type,
      merchant: merchant ?? this.merchant,
      occurredAt: occurredAt ?? this.occurredAt,
      source: source ?? this.source,
      uncategorized: uncategorized ?? this.uncategorized,
      fingerprint: fingerprint ?? this.fingerprint,
      capturedAt: capturedAt ?? this.capturedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (vaultId.present) {
      map['vault_id'] = Variable<String>(vaultId.value);
    }
    if (amount.present) {
      map['amount'] = Variable<String>(
          $PendingCapturesTable.$converteramount.toSql(amount.value));
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (merchant.present) {
      map['merchant'] = Variable<String>(merchant.value);
    }
    if (occurredAt.present) {
      map['occurred_at'] = Variable<int>(occurredAt.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (uncategorized.present) {
      map['uncategorized'] = Variable<bool>(uncategorized.value);
    }
    if (fingerprint.present) {
      map['fingerprint'] = Variable<String>(fingerprint.value);
    }
    if (capturedAt.present) {
      map['captured_at'] = Variable<int>(capturedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingCapturesCompanion(')
          ..write('id: $id, ')
          ..write('vaultId: $vaultId, ')
          ..write('amount: $amount, ')
          ..write('type: $type, ')
          ..write('merchant: $merchant, ')
          ..write('occurredAt: $occurredAt, ')
          ..write('source: $source, ')
          ..write('uncategorized: $uncategorized, ')
          ..write('fingerprint: $fingerprint, ')
          ..write('capturedAt: $capturedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CategoriesTable categories = $CategoriesTable(this);
  late final $TransactionsTable transactions = $TransactionsTable(this);
  late final $BudgetsTable budgets = $BudgetsTable(this);
  late final $MerchantAliasesTable merchantAliases =
      $MerchantAliasesTable(this);
  late final $HoldingsTable holdings = $HoldingsTable(this);
  late final $LiabilitiesTable liabilities = $LiabilitiesTable(this);
  late final $GoalsTable goals = $GoalsTable(this);
  late final $GoalContributionsTable goalContributions =
      $GoalContributionsTable(this);
  late final $RecurringRulesTable recurringRules = $RecurringRulesTable(this);
  late final $FxRatesTable fxRates = $FxRatesTable(this);
  late final $TransactionFingerprintsTable transactionFingerprints =
      $TransactionFingerprintsTable(this);
  late final $InsurancesTable insurances = $InsurancesTable(this);
  late final $NetWorthSnapshotsTable netWorthSnapshots =
      $NetWorthSnapshotsTable(this);
  late final $AccountsTable accounts = $AccountsTable(this);
  late final $PostingsTable postings = $PostingsTable(this);
  late final $PendingCapturesTable pendingCaptures =
      $PendingCapturesTable(this);
  late final TransactionDao transactionDao =
      TransactionDao(this as AppDatabase);
  late final CategoryDao categoryDao = CategoryDao(this as AppDatabase);
  late final BudgetDao budgetDao = BudgetDao(this as AppDatabase);
  late final MerchantAliasDao merchantAliasDao =
      MerchantAliasDao(this as AppDatabase);
  late final HoldingDao holdingDao = HoldingDao(this as AppDatabase);
  late final LiabilityDao liabilityDao = LiabilityDao(this as AppDatabase);
  late final FingerprintDao fingerprintDao =
      FingerprintDao(this as AppDatabase);
  late final FxRateDao fxRateDao = FxRateDao(this as AppDatabase);
  late final GoalDao goalDao = GoalDao(this as AppDatabase);
  late final RecurringDao recurringDao = RecurringDao(this as AppDatabase);
  late final InsuranceDao insuranceDao = InsuranceDao(this as AppDatabase);
  late final SnapshotDao snapshotDao = SnapshotDao(this as AppDatabase);
  late final AccountDao accountDao = AccountDao(this as AppDatabase);
  late final PostingDao postingDao = PostingDao(this as AppDatabase);
  late final PendingCaptureDao pendingCaptureDao =
      PendingCaptureDao(this as AppDatabase);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
        categories,
        transactions,
        budgets,
        merchantAliases,
        holdings,
        liabilities,
        goals,
        goalContributions,
        recurringRules,
        fxRates,
        transactionFingerprints,
        insurances,
        netWorthSnapshots,
        accounts,
        postings,
        pendingCaptures
      ];
}

typedef $$CategoriesTableCreateCompanionBuilder = CategoriesCompanion Function({
  required String id,
  required String vaultId,
  required String name,
  Value<int?> iconCodepoint,
  Value<int> rowid,
});
typedef $$CategoriesTableUpdateCompanionBuilder = CategoriesCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> name,
  Value<int?> iconCodepoint,
  Value<int> rowid,
});

final class $$CategoriesTableReferences
    extends BaseReferences<_$AppDatabase, $CategoriesTable, CategoryRow> {
  $$CategoriesTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$TransactionsTable, List<TransactionRow>>
      _transactionsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.transactions,
              aliasName: $_aliasNameGenerator(
                  db.categories.id, db.transactions.categoryId));

  $$TransactionsTableProcessedTableManager get transactionsRefs {
    final manager = $$TransactionsTableTableManager($_db, $_db.transactions)
        .filter((f) => f.categoryId.id($_item.id));

    final cache = $_typedResult.readTableOrNull(_transactionsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }

  static MultiTypedResultKey<$BudgetsTable, List<BudgetRow>> _budgetsRefsTable(
          _$AppDatabase db) =>
      MultiTypedResultKey.fromTable(db.budgets,
          aliasName:
              $_aliasNameGenerator(db.categories.id, db.budgets.categoryId));

  $$BudgetsTableProcessedTableManager get budgetsRefs {
    final manager = $$BudgetsTableTableManager($_db, $_db.budgets)
        .filter((f) => f.categoryId.id($_item.id));

    final cache = $_typedResult.readTableOrNull(_budgetsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }

  static MultiTypedResultKey<$MerchantAliasesTable, List<MerchantAliasRow>>
      _merchantAliasesRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.merchantAliases,
              aliasName: $_aliasNameGenerator(
                  db.categories.id, db.merchantAliases.categoryId));

  $$MerchantAliasesTableProcessedTableManager get merchantAliasesRefs {
    final manager =
        $$MerchantAliasesTableTableManager($_db, $_db.merchantAliases)
            .filter((f) => f.categoryId.id($_item.id));

    final cache =
        $_typedResult.readTableOrNull(_merchantAliasesRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }

  static MultiTypedResultKey<$RecurringRulesTable, List<RecurringRuleRow>>
      _recurringRulesRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.recurringRules,
              aliasName: $_aliasNameGenerator(
                  db.categories.id, db.recurringRules.categoryId));

  $$RecurringRulesTableProcessedTableManager get recurringRulesRefs {
    final manager = $$RecurringRulesTableTableManager($_db, $_db.recurringRules)
        .filter((f) => f.categoryId.id($_item.id));

    final cache = $_typedResult.readTableOrNull(_recurringRulesRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$CategoriesTableFilterComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get iconCodepoint => $composableBuilder(
      column: $table.iconCodepoint, builder: (column) => ColumnFilters(column));

  Expression<bool> transactionsRefs(
      Expression<bool> Function($$TransactionsTableFilterComposer f) f) {
    final $$TransactionsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.transactions,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$TransactionsTableFilterComposer(
              $db: $db,
              $table: $db.transactions,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<bool> budgetsRefs(
      Expression<bool> Function($$BudgetsTableFilterComposer f) f) {
    final $$BudgetsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.budgets,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$BudgetsTableFilterComposer(
              $db: $db,
              $table: $db.budgets,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<bool> merchantAliasesRefs(
      Expression<bool> Function($$MerchantAliasesTableFilterComposer f) f) {
    final $$MerchantAliasesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.merchantAliases,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$MerchantAliasesTableFilterComposer(
              $db: $db,
              $table: $db.merchantAliases,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<bool> recurringRulesRefs(
      Expression<bool> Function($$RecurringRulesTableFilterComposer f) f) {
    final $$RecurringRulesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.recurringRules,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$RecurringRulesTableFilterComposer(
              $db: $db,
              $table: $db.recurringRules,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$CategoriesTableOrderingComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get iconCodepoint => $composableBuilder(
      column: $table.iconCodepoint,
      builder: (column) => ColumnOrderings(column));
}

class $$CategoriesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CategoriesTable> {
  $$CategoriesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<int> get iconCodepoint => $composableBuilder(
      column: $table.iconCodepoint, builder: (column) => column);

  Expression<T> transactionsRefs<T extends Object>(
      Expression<T> Function($$TransactionsTableAnnotationComposer a) f) {
    final $$TransactionsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.transactions,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$TransactionsTableAnnotationComposer(
              $db: $db,
              $table: $db.transactions,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<T> budgetsRefs<T extends Object>(
      Expression<T> Function($$BudgetsTableAnnotationComposer a) f) {
    final $$BudgetsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.budgets,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$BudgetsTableAnnotationComposer(
              $db: $db,
              $table: $db.budgets,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<T> merchantAliasesRefs<T extends Object>(
      Expression<T> Function($$MerchantAliasesTableAnnotationComposer a) f) {
    final $$MerchantAliasesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.merchantAliases,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$MerchantAliasesTableAnnotationComposer(
              $db: $db,
              $table: $db.merchantAliases,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }

  Expression<T> recurringRulesRefs<T extends Object>(
      Expression<T> Function($$RecurringRulesTableAnnotationComposer a) f) {
    final $$RecurringRulesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.recurringRules,
        getReferencedColumn: (t) => t.categoryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$RecurringRulesTableAnnotationComposer(
              $db: $db,
              $table: $db.recurringRules,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$CategoriesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CategoriesTable,
    CategoryRow,
    $$CategoriesTableFilterComposer,
    $$CategoriesTableOrderingComposer,
    $$CategoriesTableAnnotationComposer,
    $$CategoriesTableCreateCompanionBuilder,
    $$CategoriesTableUpdateCompanionBuilder,
    (CategoryRow, $$CategoriesTableReferences),
    CategoryRow,
    PrefetchHooks Function(
        {bool transactionsRefs,
        bool budgetsRefs,
        bool merchantAliasesRefs,
        bool recurringRulesRefs})> {
  $$CategoriesTableTableManager(_$AppDatabase db, $CategoriesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CategoriesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CategoriesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CategoriesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<int?> iconCodepoint = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CategoriesCompanion(
            id: id,
            vaultId: vaultId,
            name: name,
            iconCodepoint: iconCodepoint,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String name,
            Value<int?> iconCodepoint = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CategoriesCompanion.insert(
            id: id,
            vaultId: vaultId,
            name: name,
            iconCodepoint: iconCodepoint,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$CategoriesTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: (
              {transactionsRefs = false,
              budgetsRefs = false,
              merchantAliasesRefs = false,
              recurringRulesRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (transactionsRefs) db.transactions,
                if (budgetsRefs) db.budgets,
                if (merchantAliasesRefs) db.merchantAliases,
                if (recurringRulesRefs) db.recurringRules
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (transactionsRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable: $$CategoriesTableReferences
                            ._transactionsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$CategoriesTableReferences(db, table, p0)
                                .transactionsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.categoryId == item.id),
                        typedResults: items),
                  if (budgetsRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable:
                            $$CategoriesTableReferences._budgetsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$CategoriesTableReferences(db, table, p0)
                                .budgetsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.categoryId == item.id),
                        typedResults: items),
                  if (merchantAliasesRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable: $$CategoriesTableReferences
                            ._merchantAliasesRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$CategoriesTableReferences(db, table, p0)
                                .merchantAliasesRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.categoryId == item.id),
                        typedResults: items),
                  if (recurringRulesRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable: $$CategoriesTableReferences
                            ._recurringRulesRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$CategoriesTableReferences(db, table, p0)
                                .recurringRulesRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.categoryId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$CategoriesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CategoriesTable,
    CategoryRow,
    $$CategoriesTableFilterComposer,
    $$CategoriesTableOrderingComposer,
    $$CategoriesTableAnnotationComposer,
    $$CategoriesTableCreateCompanionBuilder,
    $$CategoriesTableUpdateCompanionBuilder,
    (CategoryRow, $$CategoriesTableReferences),
    CategoryRow,
    PrefetchHooks Function(
        {bool transactionsRefs,
        bool budgetsRefs,
        bool merchantAliasesRefs,
        bool recurringRulesRefs})>;
typedef $$TransactionsTableCreateCompanionBuilder = TransactionsCompanion
    Function({
  required String id,
  required String vaultId,
  required Decimal amount,
  required String type,
  required String categoryId,
  Value<String?> merchant,
  Value<String?> note,
  Value<String?> accountId,
  Value<String?> attachmentRef,
  required int date,
  required int createdAt,
  Value<int> rowid,
});
typedef $$TransactionsTableUpdateCompanionBuilder = TransactionsCompanion
    Function({
  Value<String> id,
  Value<String> vaultId,
  Value<Decimal> amount,
  Value<String> type,
  Value<String> categoryId,
  Value<String?> merchant,
  Value<String?> note,
  Value<String?> accountId,
  Value<String?> attachmentRef,
  Value<int> date,
  Value<int> createdAt,
  Value<int> rowid,
});

final class $$TransactionsTableReferences
    extends BaseReferences<_$AppDatabase, $TransactionsTable, TransactionRow> {
  $$TransactionsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $CategoriesTable _categoryIdTable(_$AppDatabase db) =>
      db.categories.createAlias(
          $_aliasNameGenerator(db.transactions.categoryId, db.categories.id));

  $$CategoriesTableProcessedTableManager? get categoryId {
    if ($_item.categoryId == null) return null;
    final manager = $$CategoriesTableTableManager($_db, $_db.categories)
        .filter((f) => f.id($_item.categoryId!));
    final item = $_typedResult.readTableOrNull(_categoryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }

  static MultiTypedResultKey<$PostingsTable, List<PostingRow>>
      _postingsRefsTable(_$AppDatabase db) => MultiTypedResultKey.fromTable(
          db.postings,
          aliasName:
              $_aliasNameGenerator(db.transactions.id, db.postings.entryId));

  $$PostingsTableProcessedTableManager get postingsRefs {
    final manager = $$PostingsTableTableManager($_db, $_db.postings)
        .filter((f) => f.entryId.id($_item.id));

    final cache = $_typedResult.readTableOrNull(_postingsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$TransactionsTableFilterComposer
    extends Composer<_$AppDatabase, $TransactionsTable> {
  $$TransactionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get amount =>
      $composableBuilder(
          column: $table.amount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get merchant => $composableBuilder(
      column: $table.merchant, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get accountId => $composableBuilder(
      column: $table.accountId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get attachmentRef => $composableBuilder(
      column: $table.attachmentRef, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  $$CategoriesTableFilterComposer get categoryId {
    final $$CategoriesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableFilterComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<bool> postingsRefs(
      Expression<bool> Function($$PostingsTableFilterComposer f) f) {
    final $$PostingsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.postings,
        getReferencedColumn: (t) => t.entryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$PostingsTableFilterComposer(
              $db: $db,
              $table: $db.postings,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$TransactionsTableOrderingComposer
    extends Composer<_$AppDatabase, $TransactionsTable> {
  $$TransactionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get amount => $composableBuilder(
      column: $table.amount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get merchant => $composableBuilder(
      column: $table.merchant, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get accountId => $composableBuilder(
      column: $table.accountId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get attachmentRef => $composableBuilder(
      column: $table.attachmentRef,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  $$CategoriesTableOrderingComposer get categoryId {
    final $$CategoriesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableOrderingComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$TransactionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TransactionsTable> {
  $$TransactionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get amount =>
      $composableBuilder(column: $table.amount, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get merchant =>
      $composableBuilder(column: $table.merchant, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<String> get accountId =>
      $composableBuilder(column: $table.accountId, builder: (column) => column);

  GeneratedColumn<String> get attachmentRef => $composableBuilder(
      column: $table.attachmentRef, builder: (column) => column);

  GeneratedColumn<int> get date =>
      $composableBuilder(column: $table.date, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$CategoriesTableAnnotationComposer get categoryId {
    final $$CategoriesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableAnnotationComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  Expression<T> postingsRefs<T extends Object>(
      Expression<T> Function($$PostingsTableAnnotationComposer a) f) {
    final $$PostingsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.postings,
        getReferencedColumn: (t) => t.entryId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$PostingsTableAnnotationComposer(
              $db: $db,
              $table: $db.postings,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$TransactionsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $TransactionsTable,
    TransactionRow,
    $$TransactionsTableFilterComposer,
    $$TransactionsTableOrderingComposer,
    $$TransactionsTableAnnotationComposer,
    $$TransactionsTableCreateCompanionBuilder,
    $$TransactionsTableUpdateCompanionBuilder,
    (TransactionRow, $$TransactionsTableReferences),
    TransactionRow,
    PrefetchHooks Function({bool categoryId, bool postingsRefs})> {
  $$TransactionsTableTableManager(_$AppDatabase db, $TransactionsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TransactionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TransactionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TransactionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<Decimal> amount = const Value.absent(),
            Value<String> type = const Value.absent(),
            Value<String> categoryId = const Value.absent(),
            Value<String?> merchant = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<String?> accountId = const Value.absent(),
            Value<String?> attachmentRef = const Value.absent(),
            Value<int> date = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              TransactionsCompanion(
            id: id,
            vaultId: vaultId,
            amount: amount,
            type: type,
            categoryId: categoryId,
            merchant: merchant,
            note: note,
            accountId: accountId,
            attachmentRef: attachmentRef,
            date: date,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required Decimal amount,
            required String type,
            required String categoryId,
            Value<String?> merchant = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<String?> accountId = const Value.absent(),
            Value<String?> attachmentRef = const Value.absent(),
            required int date,
            required int createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              TransactionsCompanion.insert(
            id: id,
            vaultId: vaultId,
            amount: amount,
            type: type,
            categoryId: categoryId,
            merchant: merchant,
            note: note,
            accountId: accountId,
            attachmentRef: attachmentRef,
            date: date,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$TransactionsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({categoryId = false, postingsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (postingsRefs) db.postings],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (categoryId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.categoryId,
                    referencedTable:
                        $$TransactionsTableReferences._categoryIdTable(db),
                    referencedColumn:
                        $$TransactionsTableReferences._categoryIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [
                  if (postingsRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable: $$TransactionsTableReferences
                            ._postingsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$TransactionsTableReferences(db, table, p0)
                                .postingsRefs,
                        referencedItemsForCurrentItem: (item,
                                referencedItems) =>
                            referencedItems.where((e) => e.entryId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$TransactionsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $TransactionsTable,
    TransactionRow,
    $$TransactionsTableFilterComposer,
    $$TransactionsTableOrderingComposer,
    $$TransactionsTableAnnotationComposer,
    $$TransactionsTableCreateCompanionBuilder,
    $$TransactionsTableUpdateCompanionBuilder,
    (TransactionRow, $$TransactionsTableReferences),
    TransactionRow,
    PrefetchHooks Function({bool categoryId, bool postingsRefs})>;
typedef $$BudgetsTableCreateCompanionBuilder = BudgetsCompanion Function({
  required String id,
  required String vaultId,
  required String categoryId,
  Value<String> periodType,
  required Decimal amountLimit,
  Value<bool> rolloverEnabled,
  Value<int> alertThresholdPct,
  required int createdAt,
  Value<int> rowid,
});
typedef $$BudgetsTableUpdateCompanionBuilder = BudgetsCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> categoryId,
  Value<String> periodType,
  Value<Decimal> amountLimit,
  Value<bool> rolloverEnabled,
  Value<int> alertThresholdPct,
  Value<int> createdAt,
  Value<int> rowid,
});

final class $$BudgetsTableReferences
    extends BaseReferences<_$AppDatabase, $BudgetsTable, BudgetRow> {
  $$BudgetsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $CategoriesTable _categoryIdTable(_$AppDatabase db) =>
      db.categories.createAlias(
          $_aliasNameGenerator(db.budgets.categoryId, db.categories.id));

  $$CategoriesTableProcessedTableManager? get categoryId {
    if ($_item.categoryId == null) return null;
    final manager = $$CategoriesTableTableManager($_db, $_db.categories)
        .filter((f) => f.id($_item.categoryId!));
    final item = $_typedResult.readTableOrNull(_categoryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$BudgetsTableFilterComposer
    extends Composer<_$AppDatabase, $BudgetsTable> {
  $$BudgetsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get periodType => $composableBuilder(
      column: $table.periodType, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get amountLimit =>
      $composableBuilder(
          column: $table.amountLimit,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<bool> get rolloverEnabled => $composableBuilder(
      column: $table.rolloverEnabled,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get alertThresholdPct => $composableBuilder(
      column: $table.alertThresholdPct,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  $$CategoriesTableFilterComposer get categoryId {
    final $$CategoriesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableFilterComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$BudgetsTableOrderingComposer
    extends Composer<_$AppDatabase, $BudgetsTable> {
  $$BudgetsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get periodType => $composableBuilder(
      column: $table.periodType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get amountLimit => $composableBuilder(
      column: $table.amountLimit, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get rolloverEnabled => $composableBuilder(
      column: $table.rolloverEnabled,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get alertThresholdPct => $composableBuilder(
      column: $table.alertThresholdPct,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  $$CategoriesTableOrderingComposer get categoryId {
    final $$CategoriesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableOrderingComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$BudgetsTableAnnotationComposer
    extends Composer<_$AppDatabase, $BudgetsTable> {
  $$BudgetsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get periodType => $composableBuilder(
      column: $table.periodType, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get amountLimit =>
      $composableBuilder(
          column: $table.amountLimit, builder: (column) => column);

  GeneratedColumn<bool> get rolloverEnabled => $composableBuilder(
      column: $table.rolloverEnabled, builder: (column) => column);

  GeneratedColumn<int> get alertThresholdPct => $composableBuilder(
      column: $table.alertThresholdPct, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$CategoriesTableAnnotationComposer get categoryId {
    final $$CategoriesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableAnnotationComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$BudgetsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $BudgetsTable,
    BudgetRow,
    $$BudgetsTableFilterComposer,
    $$BudgetsTableOrderingComposer,
    $$BudgetsTableAnnotationComposer,
    $$BudgetsTableCreateCompanionBuilder,
    $$BudgetsTableUpdateCompanionBuilder,
    (BudgetRow, $$BudgetsTableReferences),
    BudgetRow,
    PrefetchHooks Function({bool categoryId})> {
  $$BudgetsTableTableManager(_$AppDatabase db, $BudgetsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$BudgetsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$BudgetsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$BudgetsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> categoryId = const Value.absent(),
            Value<String> periodType = const Value.absent(),
            Value<Decimal> amountLimit = const Value.absent(),
            Value<bool> rolloverEnabled = const Value.absent(),
            Value<int> alertThresholdPct = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              BudgetsCompanion(
            id: id,
            vaultId: vaultId,
            categoryId: categoryId,
            periodType: periodType,
            amountLimit: amountLimit,
            rolloverEnabled: rolloverEnabled,
            alertThresholdPct: alertThresholdPct,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String categoryId,
            Value<String> periodType = const Value.absent(),
            required Decimal amountLimit,
            Value<bool> rolloverEnabled = const Value.absent(),
            Value<int> alertThresholdPct = const Value.absent(),
            required int createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              BudgetsCompanion.insert(
            id: id,
            vaultId: vaultId,
            categoryId: categoryId,
            periodType: periodType,
            amountLimit: amountLimit,
            rolloverEnabled: rolloverEnabled,
            alertThresholdPct: alertThresholdPct,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) =>
                  (e.readTable(table), $$BudgetsTableReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: ({categoryId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (categoryId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.categoryId,
                    referencedTable:
                        $$BudgetsTableReferences._categoryIdTable(db),
                    referencedColumn:
                        $$BudgetsTableReferences._categoryIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$BudgetsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $BudgetsTable,
    BudgetRow,
    $$BudgetsTableFilterComposer,
    $$BudgetsTableOrderingComposer,
    $$BudgetsTableAnnotationComposer,
    $$BudgetsTableCreateCompanionBuilder,
    $$BudgetsTableUpdateCompanionBuilder,
    (BudgetRow, $$BudgetsTableReferences),
    BudgetRow,
    PrefetchHooks Function({bool categoryId})>;
typedef $$MerchantAliasesTableCreateCompanionBuilder = MerchantAliasesCompanion
    Function({
  required String id,
  required String vaultId,
  required String merchantPattern,
  required String categoryId,
  Value<int> hitCount,
  Value<int> rowid,
});
typedef $$MerchantAliasesTableUpdateCompanionBuilder = MerchantAliasesCompanion
    Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> merchantPattern,
  Value<String> categoryId,
  Value<int> hitCount,
  Value<int> rowid,
});

final class $$MerchantAliasesTableReferences extends BaseReferences<
    _$AppDatabase, $MerchantAliasesTable, MerchantAliasRow> {
  $$MerchantAliasesTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $CategoriesTable _categoryIdTable(_$AppDatabase db) =>
      db.categories.createAlias($_aliasNameGenerator(
          db.merchantAliases.categoryId, db.categories.id));

  $$CategoriesTableProcessedTableManager? get categoryId {
    if ($_item.categoryId == null) return null;
    final manager = $$CategoriesTableTableManager($_db, $_db.categories)
        .filter((f) => f.id($_item.categoryId!));
    final item = $_typedResult.readTableOrNull(_categoryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$MerchantAliasesTableFilterComposer
    extends Composer<_$AppDatabase, $MerchantAliasesTable> {
  $$MerchantAliasesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get merchantPattern => $composableBuilder(
      column: $table.merchantPattern,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get hitCount => $composableBuilder(
      column: $table.hitCount, builder: (column) => ColumnFilters(column));

  $$CategoriesTableFilterComposer get categoryId {
    final $$CategoriesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableFilterComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$MerchantAliasesTableOrderingComposer
    extends Composer<_$AppDatabase, $MerchantAliasesTable> {
  $$MerchantAliasesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get merchantPattern => $composableBuilder(
      column: $table.merchantPattern,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get hitCount => $composableBuilder(
      column: $table.hitCount, builder: (column) => ColumnOrderings(column));

  $$CategoriesTableOrderingComposer get categoryId {
    final $$CategoriesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableOrderingComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$MerchantAliasesTableAnnotationComposer
    extends Composer<_$AppDatabase, $MerchantAliasesTable> {
  $$MerchantAliasesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get merchantPattern => $composableBuilder(
      column: $table.merchantPattern, builder: (column) => column);

  GeneratedColumn<int> get hitCount =>
      $composableBuilder(column: $table.hitCount, builder: (column) => column);

  $$CategoriesTableAnnotationComposer get categoryId {
    final $$CategoriesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableAnnotationComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$MerchantAliasesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $MerchantAliasesTable,
    MerchantAliasRow,
    $$MerchantAliasesTableFilterComposer,
    $$MerchantAliasesTableOrderingComposer,
    $$MerchantAliasesTableAnnotationComposer,
    $$MerchantAliasesTableCreateCompanionBuilder,
    $$MerchantAliasesTableUpdateCompanionBuilder,
    (MerchantAliasRow, $$MerchantAliasesTableReferences),
    MerchantAliasRow,
    PrefetchHooks Function({bool categoryId})> {
  $$MerchantAliasesTableTableManager(
      _$AppDatabase db, $MerchantAliasesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MerchantAliasesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MerchantAliasesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MerchantAliasesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> merchantPattern = const Value.absent(),
            Value<String> categoryId = const Value.absent(),
            Value<int> hitCount = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              MerchantAliasesCompanion(
            id: id,
            vaultId: vaultId,
            merchantPattern: merchantPattern,
            categoryId: categoryId,
            hitCount: hitCount,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String merchantPattern,
            required String categoryId,
            Value<int> hitCount = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              MerchantAliasesCompanion.insert(
            id: id,
            vaultId: vaultId,
            merchantPattern: merchantPattern,
            categoryId: categoryId,
            hitCount: hitCount,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$MerchantAliasesTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({categoryId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (categoryId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.categoryId,
                    referencedTable:
                        $$MerchantAliasesTableReferences._categoryIdTable(db),
                    referencedColumn: $$MerchantAliasesTableReferences
                        ._categoryIdTable(db)
                        .id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$MerchantAliasesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $MerchantAliasesTable,
    MerchantAliasRow,
    $$MerchantAliasesTableFilterComposer,
    $$MerchantAliasesTableOrderingComposer,
    $$MerchantAliasesTableAnnotationComposer,
    $$MerchantAliasesTableCreateCompanionBuilder,
    $$MerchantAliasesTableUpdateCompanionBuilder,
    (MerchantAliasRow, $$MerchantAliasesTableReferences),
    MerchantAliasRow,
    PrefetchHooks Function({bool categoryId})>;
typedef $$HoldingsTableCreateCompanionBuilder = HoldingsCompanion Function({
  required String id,
  required String vaultId,
  required String symbol,
  Value<String> exchange,
  required Decimal quantity,
  required Decimal avgCost,
  required int firstPurchaseDate,
  Value<String> assetType,
  Value<String> currency,
  Value<Decimal?> lastPrice,
  Value<int> rowid,
});
typedef $$HoldingsTableUpdateCompanionBuilder = HoldingsCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> symbol,
  Value<String> exchange,
  Value<Decimal> quantity,
  Value<Decimal> avgCost,
  Value<int> firstPurchaseDate,
  Value<String> assetType,
  Value<String> currency,
  Value<Decimal?> lastPrice,
  Value<int> rowid,
});

class $$HoldingsTableFilterComposer
    extends Composer<_$AppDatabase, $HoldingsTable> {
  $$HoldingsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get symbol => $composableBuilder(
      column: $table.symbol, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get exchange => $composableBuilder(
      column: $table.exchange, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get quantity =>
      $composableBuilder(
          column: $table.quantity,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get avgCost =>
      $composableBuilder(
          column: $table.avgCost,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get firstPurchaseDate => $composableBuilder(
      column: $table.firstPurchaseDate,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get assetType => $composableBuilder(
      column: $table.assetType, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get currency => $composableBuilder(
      column: $table.currency, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal?, Decimal, String> get lastPrice =>
      $composableBuilder(
          column: $table.lastPrice,
          builder: (column) => ColumnWithTypeConverterFilters(column));
}

class $$HoldingsTableOrderingComposer
    extends Composer<_$AppDatabase, $HoldingsTable> {
  $$HoldingsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get symbol => $composableBuilder(
      column: $table.symbol, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get exchange => $composableBuilder(
      column: $table.exchange, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get quantity => $composableBuilder(
      column: $table.quantity, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get avgCost => $composableBuilder(
      column: $table.avgCost, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get firstPurchaseDate => $composableBuilder(
      column: $table.firstPurchaseDate,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get assetType => $composableBuilder(
      column: $table.assetType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get currency => $composableBuilder(
      column: $table.currency, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastPrice => $composableBuilder(
      column: $table.lastPrice, builder: (column) => ColumnOrderings(column));
}

class $$HoldingsTableAnnotationComposer
    extends Composer<_$AppDatabase, $HoldingsTable> {
  $$HoldingsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get symbol =>
      $composableBuilder(column: $table.symbol, builder: (column) => column);

  GeneratedColumn<String> get exchange =>
      $composableBuilder(column: $table.exchange, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get avgCost =>
      $composableBuilder(column: $table.avgCost, builder: (column) => column);

  GeneratedColumn<int> get firstPurchaseDate => $composableBuilder(
      column: $table.firstPurchaseDate, builder: (column) => column);

  GeneratedColumn<String> get assetType =>
      $composableBuilder(column: $table.assetType, builder: (column) => column);

  GeneratedColumn<String> get currency =>
      $composableBuilder(column: $table.currency, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal?, String> get lastPrice =>
      $composableBuilder(column: $table.lastPrice, builder: (column) => column);
}

class $$HoldingsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $HoldingsTable,
    HoldingRow,
    $$HoldingsTableFilterComposer,
    $$HoldingsTableOrderingComposer,
    $$HoldingsTableAnnotationComposer,
    $$HoldingsTableCreateCompanionBuilder,
    $$HoldingsTableUpdateCompanionBuilder,
    (HoldingRow, BaseReferences<_$AppDatabase, $HoldingsTable, HoldingRow>),
    HoldingRow,
    PrefetchHooks Function()> {
  $$HoldingsTableTableManager(_$AppDatabase db, $HoldingsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$HoldingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$HoldingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$HoldingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> symbol = const Value.absent(),
            Value<String> exchange = const Value.absent(),
            Value<Decimal> quantity = const Value.absent(),
            Value<Decimal> avgCost = const Value.absent(),
            Value<int> firstPurchaseDate = const Value.absent(),
            Value<String> assetType = const Value.absent(),
            Value<String> currency = const Value.absent(),
            Value<Decimal?> lastPrice = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              HoldingsCompanion(
            id: id,
            vaultId: vaultId,
            symbol: symbol,
            exchange: exchange,
            quantity: quantity,
            avgCost: avgCost,
            firstPurchaseDate: firstPurchaseDate,
            assetType: assetType,
            currency: currency,
            lastPrice: lastPrice,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String symbol,
            Value<String> exchange = const Value.absent(),
            required Decimal quantity,
            required Decimal avgCost,
            required int firstPurchaseDate,
            Value<String> assetType = const Value.absent(),
            Value<String> currency = const Value.absent(),
            Value<Decimal?> lastPrice = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              HoldingsCompanion.insert(
            id: id,
            vaultId: vaultId,
            symbol: symbol,
            exchange: exchange,
            quantity: quantity,
            avgCost: avgCost,
            firstPurchaseDate: firstPurchaseDate,
            assetType: assetType,
            currency: currency,
            lastPrice: lastPrice,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$HoldingsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $HoldingsTable,
    HoldingRow,
    $$HoldingsTableFilterComposer,
    $$HoldingsTableOrderingComposer,
    $$HoldingsTableAnnotationComposer,
    $$HoldingsTableCreateCompanionBuilder,
    $$HoldingsTableUpdateCompanionBuilder,
    (HoldingRow, BaseReferences<_$AppDatabase, $HoldingsTable, HoldingRow>),
    HoldingRow,
    PrefetchHooks Function()>;
typedef $$LiabilitiesTableCreateCompanionBuilder = LiabilitiesCompanion
    Function({
  required String id,
  required String vaultId,
  required String name,
  required String kind,
  required Decimal principal,
  required Decimal aprPct,
  Value<int?> termMonths,
  required int createdAt,
  Value<int> rowid,
});
typedef $$LiabilitiesTableUpdateCompanionBuilder = LiabilitiesCompanion
    Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> name,
  Value<String> kind,
  Value<Decimal> principal,
  Value<Decimal> aprPct,
  Value<int?> termMonths,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$LiabilitiesTableFilterComposer
    extends Composer<_$AppDatabase, $LiabilitiesTable> {
  $$LiabilitiesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get principal =>
      $composableBuilder(
          column: $table.principal,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get aprPct =>
      $composableBuilder(
          column: $table.aprPct,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get termMonths => $composableBuilder(
      column: $table.termMonths, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$LiabilitiesTableOrderingComposer
    extends Composer<_$AppDatabase, $LiabilitiesTable> {
  $$LiabilitiesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get principal => $composableBuilder(
      column: $table.principal, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get aprPct => $composableBuilder(
      column: $table.aprPct, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get termMonths => $composableBuilder(
      column: $table.termMonths, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$LiabilitiesTableAnnotationComposer
    extends Composer<_$AppDatabase, $LiabilitiesTable> {
  $$LiabilitiesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get principal =>
      $composableBuilder(column: $table.principal, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get aprPct =>
      $composableBuilder(column: $table.aprPct, builder: (column) => column);

  GeneratedColumn<int> get termMonths => $composableBuilder(
      column: $table.termMonths, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$LiabilitiesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $LiabilitiesTable,
    LiabilityRow,
    $$LiabilitiesTableFilterComposer,
    $$LiabilitiesTableOrderingComposer,
    $$LiabilitiesTableAnnotationComposer,
    $$LiabilitiesTableCreateCompanionBuilder,
    $$LiabilitiesTableUpdateCompanionBuilder,
    (
      LiabilityRow,
      BaseReferences<_$AppDatabase, $LiabilitiesTable, LiabilityRow>
    ),
    LiabilityRow,
    PrefetchHooks Function()> {
  $$LiabilitiesTableTableManager(_$AppDatabase db, $LiabilitiesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LiabilitiesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LiabilitiesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LiabilitiesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<Decimal> principal = const Value.absent(),
            Value<Decimal> aprPct = const Value.absent(),
            Value<int?> termMonths = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              LiabilitiesCompanion(
            id: id,
            vaultId: vaultId,
            name: name,
            kind: kind,
            principal: principal,
            aprPct: aprPct,
            termMonths: termMonths,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String name,
            required String kind,
            required Decimal principal,
            required Decimal aprPct,
            Value<int?> termMonths = const Value.absent(),
            required int createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              LiabilitiesCompanion.insert(
            id: id,
            vaultId: vaultId,
            name: name,
            kind: kind,
            principal: principal,
            aprPct: aprPct,
            termMonths: termMonths,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$LiabilitiesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $LiabilitiesTable,
    LiabilityRow,
    $$LiabilitiesTableFilterComposer,
    $$LiabilitiesTableOrderingComposer,
    $$LiabilitiesTableAnnotationComposer,
    $$LiabilitiesTableCreateCompanionBuilder,
    $$LiabilitiesTableUpdateCompanionBuilder,
    (
      LiabilityRow,
      BaseReferences<_$AppDatabase, $LiabilitiesTable, LiabilityRow>
    ),
    LiabilityRow,
    PrefetchHooks Function()>;
typedef $$GoalsTableCreateCompanionBuilder = GoalsCompanion Function({
  required String id,
  required String vaultId,
  required String name,
  required String goalType,
  required Decimal targetAmount,
  required Decimal currentAmount,
  Value<int?> targetDate,
  Value<String?> notes,
  Value<bool> isAchieved,
  required int createdAt,
  Value<int> rowid,
});
typedef $$GoalsTableUpdateCompanionBuilder = GoalsCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> name,
  Value<String> goalType,
  Value<Decimal> targetAmount,
  Value<Decimal> currentAmount,
  Value<int?> targetDate,
  Value<String?> notes,
  Value<bool> isAchieved,
  Value<int> createdAt,
  Value<int> rowid,
});

final class $$GoalsTableReferences
    extends BaseReferences<_$AppDatabase, $GoalsTable, GoalRow> {
  $$GoalsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$GoalContributionsTable, List<GoalContributionRow>>
      _goalContributionsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.goalContributions,
              aliasName: $_aliasNameGenerator(
                  db.goals.id, db.goalContributions.goalId));

  $$GoalContributionsTableProcessedTableManager get goalContributionsRefs {
    final manager =
        $$GoalContributionsTableTableManager($_db, $_db.goalContributions)
            .filter((f) => f.goalId.id($_item.id));

    final cache =
        $_typedResult.readTableOrNull(_goalContributionsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$GoalsTableFilterComposer extends Composer<_$AppDatabase, $GoalsTable> {
  $$GoalsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get goalType => $composableBuilder(
      column: $table.goalType, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get targetAmount =>
      $composableBuilder(
          column: $table.targetAmount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get currentAmount =>
      $composableBuilder(
          column: $table.currentAmount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get targetDate => $composableBuilder(
      column: $table.targetDate, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get isAchieved => $composableBuilder(
      column: $table.isAchieved, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  Expression<bool> goalContributionsRefs(
      Expression<bool> Function($$GoalContributionsTableFilterComposer f) f) {
    final $$GoalContributionsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.goalContributions,
        getReferencedColumn: (t) => t.goalId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$GoalContributionsTableFilterComposer(
              $db: $db,
              $table: $db.goalContributions,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$GoalsTableOrderingComposer
    extends Composer<_$AppDatabase, $GoalsTable> {
  $$GoalsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get goalType => $composableBuilder(
      column: $table.goalType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get targetAmount => $composableBuilder(
      column: $table.targetAmount,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get currentAmount => $composableBuilder(
      column: $table.currentAmount,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get targetDate => $composableBuilder(
      column: $table.targetDate, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get isAchieved => $composableBuilder(
      column: $table.isAchieved, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$GoalsTableAnnotationComposer
    extends Composer<_$AppDatabase, $GoalsTable> {
  $$GoalsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get goalType =>
      $composableBuilder(column: $table.goalType, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get targetAmount =>
      $composableBuilder(
          column: $table.targetAmount, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get currentAmount =>
      $composableBuilder(
          column: $table.currentAmount, builder: (column) => column);

  GeneratedColumn<int> get targetDate => $composableBuilder(
      column: $table.targetDate, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<bool> get isAchieved => $composableBuilder(
      column: $table.isAchieved, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  Expression<T> goalContributionsRefs<T extends Object>(
      Expression<T> Function($$GoalContributionsTableAnnotationComposer a) f) {
    final $$GoalContributionsTableAnnotationComposer composer =
        $composerBuilder(
            composer: this,
            getCurrentColumn: (t) => t.id,
            referencedTable: $db.goalContributions,
            getReferencedColumn: (t) => t.goalId,
            builder: (joinBuilder,
                    {$addJoinBuilderToRootComposer,
                    $removeJoinBuilderFromRootComposer}) =>
                $$GoalContributionsTableAnnotationComposer(
                  $db: $db,
                  $table: $db.goalContributions,
                  $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                  joinBuilder: joinBuilder,
                  $removeJoinBuilderFromRootComposer:
                      $removeJoinBuilderFromRootComposer,
                ));
    return f(composer);
  }
}

class $$GoalsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $GoalsTable,
    GoalRow,
    $$GoalsTableFilterComposer,
    $$GoalsTableOrderingComposer,
    $$GoalsTableAnnotationComposer,
    $$GoalsTableCreateCompanionBuilder,
    $$GoalsTableUpdateCompanionBuilder,
    (GoalRow, $$GoalsTableReferences),
    GoalRow,
    PrefetchHooks Function({bool goalContributionsRefs})> {
  $$GoalsTableTableManager(_$AppDatabase db, $GoalsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$GoalsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$GoalsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$GoalsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> goalType = const Value.absent(),
            Value<Decimal> targetAmount = const Value.absent(),
            Value<Decimal> currentAmount = const Value.absent(),
            Value<int?> targetDate = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            Value<bool> isAchieved = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              GoalsCompanion(
            id: id,
            vaultId: vaultId,
            name: name,
            goalType: goalType,
            targetAmount: targetAmount,
            currentAmount: currentAmount,
            targetDate: targetDate,
            notes: notes,
            isAchieved: isAchieved,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String name,
            required String goalType,
            required Decimal targetAmount,
            required Decimal currentAmount,
            Value<int?> targetDate = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            Value<bool> isAchieved = const Value.absent(),
            required int createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              GoalsCompanion.insert(
            id: id,
            vaultId: vaultId,
            name: name,
            goalType: goalType,
            targetAmount: targetAmount,
            currentAmount: currentAmount,
            targetDate: targetDate,
            notes: notes,
            isAchieved: isAchieved,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) =>
                  (e.readTable(table), $$GoalsTableReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: ({goalContributionsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (goalContributionsRefs) db.goalContributions
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (goalContributionsRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable: $$GoalsTableReferences
                            ._goalContributionsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$GoalsTableReferences(db, table, p0)
                                .goalContributionsRefs,
                        referencedItemsForCurrentItem: (item,
                                referencedItems) =>
                            referencedItems.where((e) => e.goalId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$GoalsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $GoalsTable,
    GoalRow,
    $$GoalsTableFilterComposer,
    $$GoalsTableOrderingComposer,
    $$GoalsTableAnnotationComposer,
    $$GoalsTableCreateCompanionBuilder,
    $$GoalsTableUpdateCompanionBuilder,
    (GoalRow, $$GoalsTableReferences),
    GoalRow,
    PrefetchHooks Function({bool goalContributionsRefs})>;
typedef $$GoalContributionsTableCreateCompanionBuilder
    = GoalContributionsCompanion Function({
  required String id,
  required String goalId,
  required Decimal amount,
  Value<String?> note,
  required int contributedAt,
  Value<int> rowid,
});
typedef $$GoalContributionsTableUpdateCompanionBuilder
    = GoalContributionsCompanion Function({
  Value<String> id,
  Value<String> goalId,
  Value<Decimal> amount,
  Value<String?> note,
  Value<int> contributedAt,
  Value<int> rowid,
});

final class $$GoalContributionsTableReferences extends BaseReferences<
    _$AppDatabase, $GoalContributionsTable, GoalContributionRow> {
  $$GoalContributionsTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $GoalsTable _goalIdTable(_$AppDatabase db) => db.goals.createAlias(
      $_aliasNameGenerator(db.goalContributions.goalId, db.goals.id));

  $$GoalsTableProcessedTableManager? get goalId {
    if ($_item.goalId == null) return null;
    final manager = $$GoalsTableTableManager($_db, $_db.goals)
        .filter((f) => f.id($_item.goalId!));
    final item = $_typedResult.readTableOrNull(_goalIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$GoalContributionsTableFilterComposer
    extends Composer<_$AppDatabase, $GoalContributionsTable> {
  $$GoalContributionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get amount =>
      $composableBuilder(
          column: $table.amount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get contributedAt => $composableBuilder(
      column: $table.contributedAt, builder: (column) => ColumnFilters(column));

  $$GoalsTableFilterComposer get goalId {
    final $$GoalsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.goalId,
        referencedTable: $db.goals,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$GoalsTableFilterComposer(
              $db: $db,
              $table: $db.goals,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$GoalContributionsTableOrderingComposer
    extends Composer<_$AppDatabase, $GoalContributionsTable> {
  $$GoalContributionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get amount => $composableBuilder(
      column: $table.amount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get contributedAt => $composableBuilder(
      column: $table.contributedAt,
      builder: (column) => ColumnOrderings(column));

  $$GoalsTableOrderingComposer get goalId {
    final $$GoalsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.goalId,
        referencedTable: $db.goals,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$GoalsTableOrderingComposer(
              $db: $db,
              $table: $db.goals,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$GoalContributionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $GoalContributionsTable> {
  $$GoalContributionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get amount =>
      $composableBuilder(column: $table.amount, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<int> get contributedAt => $composableBuilder(
      column: $table.contributedAt, builder: (column) => column);

  $$GoalsTableAnnotationComposer get goalId {
    final $$GoalsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.goalId,
        referencedTable: $db.goals,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$GoalsTableAnnotationComposer(
              $db: $db,
              $table: $db.goals,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$GoalContributionsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $GoalContributionsTable,
    GoalContributionRow,
    $$GoalContributionsTableFilterComposer,
    $$GoalContributionsTableOrderingComposer,
    $$GoalContributionsTableAnnotationComposer,
    $$GoalContributionsTableCreateCompanionBuilder,
    $$GoalContributionsTableUpdateCompanionBuilder,
    (GoalContributionRow, $$GoalContributionsTableReferences),
    GoalContributionRow,
    PrefetchHooks Function({bool goalId})> {
  $$GoalContributionsTableTableManager(
      _$AppDatabase db, $GoalContributionsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$GoalContributionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$GoalContributionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$GoalContributionsTableAnnotationComposer(
                  $db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> goalId = const Value.absent(),
            Value<Decimal> amount = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<int> contributedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              GoalContributionsCompanion(
            id: id,
            goalId: goalId,
            amount: amount,
            note: note,
            contributedAt: contributedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String goalId,
            required Decimal amount,
            Value<String?> note = const Value.absent(),
            required int contributedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              GoalContributionsCompanion.insert(
            id: id,
            goalId: goalId,
            amount: amount,
            note: note,
            contributedAt: contributedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$GoalContributionsTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({goalId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (goalId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.goalId,
                    referencedTable:
                        $$GoalContributionsTableReferences._goalIdTable(db),
                    referencedColumn:
                        $$GoalContributionsTableReferences._goalIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$GoalContributionsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $GoalContributionsTable,
    GoalContributionRow,
    $$GoalContributionsTableFilterComposer,
    $$GoalContributionsTableOrderingComposer,
    $$GoalContributionsTableAnnotationComposer,
    $$GoalContributionsTableCreateCompanionBuilder,
    $$GoalContributionsTableUpdateCompanionBuilder,
    (GoalContributionRow, $$GoalContributionsTableReferences),
    GoalContributionRow,
    PrefetchHooks Function({bool goalId})>;
typedef $$RecurringRulesTableCreateCompanionBuilder = RecurringRulesCompanion
    Function({
  required String id,
  required String vaultId,
  required Decimal amount,
  required String type,
  required String categoryId,
  Value<String?> merchant,
  Value<String?> note,
  required String frequency,
  required int nextRun,
  Value<bool> active,
  Value<int> rowid,
});
typedef $$RecurringRulesTableUpdateCompanionBuilder = RecurringRulesCompanion
    Function({
  Value<String> id,
  Value<String> vaultId,
  Value<Decimal> amount,
  Value<String> type,
  Value<String> categoryId,
  Value<String?> merchant,
  Value<String?> note,
  Value<String> frequency,
  Value<int> nextRun,
  Value<bool> active,
  Value<int> rowid,
});

final class $$RecurringRulesTableReferences extends BaseReferences<
    _$AppDatabase, $RecurringRulesTable, RecurringRuleRow> {
  $$RecurringRulesTableReferences(
      super.$_db, super.$_table, super.$_typedResult);

  static $CategoriesTable _categoryIdTable(_$AppDatabase db) =>
      db.categories.createAlias(
          $_aliasNameGenerator(db.recurringRules.categoryId, db.categories.id));

  $$CategoriesTableProcessedTableManager? get categoryId {
    if ($_item.categoryId == null) return null;
    final manager = $$CategoriesTableTableManager($_db, $_db.categories)
        .filter((f) => f.id($_item.categoryId!));
    final item = $_typedResult.readTableOrNull(_categoryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$RecurringRulesTableFilterComposer
    extends Composer<_$AppDatabase, $RecurringRulesTable> {
  $$RecurringRulesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get amount =>
      $composableBuilder(
          column: $table.amount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get merchant => $composableBuilder(
      column: $table.merchant, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get frequency => $composableBuilder(
      column: $table.frequency, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get nextRun => $composableBuilder(
      column: $table.nextRun, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get active => $composableBuilder(
      column: $table.active, builder: (column) => ColumnFilters(column));

  $$CategoriesTableFilterComposer get categoryId {
    final $$CategoriesTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableFilterComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$RecurringRulesTableOrderingComposer
    extends Composer<_$AppDatabase, $RecurringRulesTable> {
  $$RecurringRulesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get amount => $composableBuilder(
      column: $table.amount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get merchant => $composableBuilder(
      column: $table.merchant, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get frequency => $composableBuilder(
      column: $table.frequency, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get nextRun => $composableBuilder(
      column: $table.nextRun, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get active => $composableBuilder(
      column: $table.active, builder: (column) => ColumnOrderings(column));

  $$CategoriesTableOrderingComposer get categoryId {
    final $$CategoriesTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableOrderingComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$RecurringRulesTableAnnotationComposer
    extends Composer<_$AppDatabase, $RecurringRulesTable> {
  $$RecurringRulesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get amount =>
      $composableBuilder(column: $table.amount, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get merchant =>
      $composableBuilder(column: $table.merchant, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<String> get frequency =>
      $composableBuilder(column: $table.frequency, builder: (column) => column);

  GeneratedColumn<int> get nextRun =>
      $composableBuilder(column: $table.nextRun, builder: (column) => column);

  GeneratedColumn<bool> get active =>
      $composableBuilder(column: $table.active, builder: (column) => column);

  $$CategoriesTableAnnotationComposer get categoryId {
    final $$CategoriesTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.categoryId,
        referencedTable: $db.categories,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$CategoriesTableAnnotationComposer(
              $db: $db,
              $table: $db.categories,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$RecurringRulesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $RecurringRulesTable,
    RecurringRuleRow,
    $$RecurringRulesTableFilterComposer,
    $$RecurringRulesTableOrderingComposer,
    $$RecurringRulesTableAnnotationComposer,
    $$RecurringRulesTableCreateCompanionBuilder,
    $$RecurringRulesTableUpdateCompanionBuilder,
    (RecurringRuleRow, $$RecurringRulesTableReferences),
    RecurringRuleRow,
    PrefetchHooks Function({bool categoryId})> {
  $$RecurringRulesTableTableManager(
      _$AppDatabase db, $RecurringRulesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RecurringRulesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RecurringRulesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RecurringRulesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<Decimal> amount = const Value.absent(),
            Value<String> type = const Value.absent(),
            Value<String> categoryId = const Value.absent(),
            Value<String?> merchant = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<String> frequency = const Value.absent(),
            Value<int> nextRun = const Value.absent(),
            Value<bool> active = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RecurringRulesCompanion(
            id: id,
            vaultId: vaultId,
            amount: amount,
            type: type,
            categoryId: categoryId,
            merchant: merchant,
            note: note,
            frequency: frequency,
            nextRun: nextRun,
            active: active,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required Decimal amount,
            required String type,
            required String categoryId,
            Value<String?> merchant = const Value.absent(),
            Value<String?> note = const Value.absent(),
            required String frequency,
            required int nextRun,
            Value<bool> active = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RecurringRulesCompanion.insert(
            id: id,
            vaultId: vaultId,
            amount: amount,
            type: type,
            categoryId: categoryId,
            merchant: merchant,
            note: note,
            frequency: frequency,
            nextRun: nextRun,
            active: active,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (
                    e.readTable(table),
                    $$RecurringRulesTableReferences(db, table, e)
                  ))
              .toList(),
          prefetchHooksCallback: ({categoryId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (categoryId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.categoryId,
                    referencedTable:
                        $$RecurringRulesTableReferences._categoryIdTable(db),
                    referencedColumn:
                        $$RecurringRulesTableReferences._categoryIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$RecurringRulesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $RecurringRulesTable,
    RecurringRuleRow,
    $$RecurringRulesTableFilterComposer,
    $$RecurringRulesTableOrderingComposer,
    $$RecurringRulesTableAnnotationComposer,
    $$RecurringRulesTableCreateCompanionBuilder,
    $$RecurringRulesTableUpdateCompanionBuilder,
    (RecurringRuleRow, $$RecurringRulesTableReferences),
    RecurringRuleRow,
    PrefetchHooks Function({bool categoryId})>;
typedef $$FxRatesTableCreateCompanionBuilder = FxRatesCompanion Function({
  Value<int> id,
  required String baseCurrency,
  required String quoteCurrency,
  required Decimal rate,
  required String source,
  required int fetchedAt,
});
typedef $$FxRatesTableUpdateCompanionBuilder = FxRatesCompanion Function({
  Value<int> id,
  Value<String> baseCurrency,
  Value<String> quoteCurrency,
  Value<Decimal> rate,
  Value<String> source,
  Value<int> fetchedAt,
});

class $$FxRatesTableFilterComposer
    extends Composer<_$AppDatabase, $FxRatesTable> {
  $$FxRatesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get baseCurrency => $composableBuilder(
      column: $table.baseCurrency, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get quoteCurrency => $composableBuilder(
      column: $table.quoteCurrency, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get rate =>
      $composableBuilder(
          column: $table.rate,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnFilters(column));
}

class $$FxRatesTableOrderingComposer
    extends Composer<_$AppDatabase, $FxRatesTable> {
  $$FxRatesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get baseCurrency => $composableBuilder(
      column: $table.baseCurrency,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get quoteCurrency => $composableBuilder(
      column: $table.quoteCurrency,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get rate => $composableBuilder(
      column: $table.rate, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnOrderings(column));
}

class $$FxRatesTableAnnotationComposer
    extends Composer<_$AppDatabase, $FxRatesTable> {
  $$FxRatesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get baseCurrency => $composableBuilder(
      column: $table.baseCurrency, builder: (column) => column);

  GeneratedColumn<String> get quoteCurrency => $composableBuilder(
      column: $table.quoteCurrency, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get rate =>
      $composableBuilder(column: $table.rate, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<int> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$FxRatesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $FxRatesTable,
    FxRateRow,
    $$FxRatesTableFilterComposer,
    $$FxRatesTableOrderingComposer,
    $$FxRatesTableAnnotationComposer,
    $$FxRatesTableCreateCompanionBuilder,
    $$FxRatesTableUpdateCompanionBuilder,
    (FxRateRow, BaseReferences<_$AppDatabase, $FxRatesTable, FxRateRow>),
    FxRateRow,
    PrefetchHooks Function()> {
  $$FxRatesTableTableManager(_$AppDatabase db, $FxRatesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$FxRatesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$FxRatesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$FxRatesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<String> baseCurrency = const Value.absent(),
            Value<String> quoteCurrency = const Value.absent(),
            Value<Decimal> rate = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<int> fetchedAt = const Value.absent(),
          }) =>
              FxRatesCompanion(
            id: id,
            baseCurrency: baseCurrency,
            quoteCurrency: quoteCurrency,
            rate: rate,
            source: source,
            fetchedAt: fetchedAt,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required String baseCurrency,
            required String quoteCurrency,
            required Decimal rate,
            required String source,
            required int fetchedAt,
          }) =>
              FxRatesCompanion.insert(
            id: id,
            baseCurrency: baseCurrency,
            quoteCurrency: quoteCurrency,
            rate: rate,
            source: source,
            fetchedAt: fetchedAt,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$FxRatesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $FxRatesTable,
    FxRateRow,
    $$FxRatesTableFilterComposer,
    $$FxRatesTableOrderingComposer,
    $$FxRatesTableAnnotationComposer,
    $$FxRatesTableCreateCompanionBuilder,
    $$FxRatesTableUpdateCompanionBuilder,
    (FxRateRow, BaseReferences<_$AppDatabase, $FxRatesTable, FxRateRow>),
    FxRateRow,
    PrefetchHooks Function()>;
typedef $$TransactionFingerprintsTableCreateCompanionBuilder
    = TransactionFingerprintsCompanion Function({
  required String vaultId,
  required String fingerprint,
  Value<int> rowid,
});
typedef $$TransactionFingerprintsTableUpdateCompanionBuilder
    = TransactionFingerprintsCompanion Function({
  Value<String> vaultId,
  Value<String> fingerprint,
  Value<int> rowid,
});

class $$TransactionFingerprintsTableFilterComposer
    extends Composer<_$AppDatabase, $TransactionFingerprintsTable> {
  $$TransactionFingerprintsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get fingerprint => $composableBuilder(
      column: $table.fingerprint, builder: (column) => ColumnFilters(column));
}

class $$TransactionFingerprintsTableOrderingComposer
    extends Composer<_$AppDatabase, $TransactionFingerprintsTable> {
  $$TransactionFingerprintsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get fingerprint => $composableBuilder(
      column: $table.fingerprint, builder: (column) => ColumnOrderings(column));
}

class $$TransactionFingerprintsTableAnnotationComposer
    extends Composer<_$AppDatabase, $TransactionFingerprintsTable> {
  $$TransactionFingerprintsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get fingerprint => $composableBuilder(
      column: $table.fingerprint, builder: (column) => column);
}

class $$TransactionFingerprintsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $TransactionFingerprintsTable,
    TxnFingerprintRow,
    $$TransactionFingerprintsTableFilterComposer,
    $$TransactionFingerprintsTableOrderingComposer,
    $$TransactionFingerprintsTableAnnotationComposer,
    $$TransactionFingerprintsTableCreateCompanionBuilder,
    $$TransactionFingerprintsTableUpdateCompanionBuilder,
    (
      TxnFingerprintRow,
      BaseReferences<_$AppDatabase, $TransactionFingerprintsTable,
          TxnFingerprintRow>
    ),
    TxnFingerprintRow,
    PrefetchHooks Function()> {
  $$TransactionFingerprintsTableTableManager(
      _$AppDatabase db, $TransactionFingerprintsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TransactionFingerprintsTableFilterComposer(
                  $db: db, $table: table),
          createOrderingComposer: () =>
              $$TransactionFingerprintsTableOrderingComposer(
                  $db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TransactionFingerprintsTableAnnotationComposer(
                  $db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> vaultId = const Value.absent(),
            Value<String> fingerprint = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              TransactionFingerprintsCompanion(
            vaultId: vaultId,
            fingerprint: fingerprint,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String vaultId,
            required String fingerprint,
            Value<int> rowid = const Value.absent(),
          }) =>
              TransactionFingerprintsCompanion.insert(
            vaultId: vaultId,
            fingerprint: fingerprint,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$TransactionFingerprintsTableProcessedTableManager
    = ProcessedTableManager<
        _$AppDatabase,
        $TransactionFingerprintsTable,
        TxnFingerprintRow,
        $$TransactionFingerprintsTableFilterComposer,
        $$TransactionFingerprintsTableOrderingComposer,
        $$TransactionFingerprintsTableAnnotationComposer,
        $$TransactionFingerprintsTableCreateCompanionBuilder,
        $$TransactionFingerprintsTableUpdateCompanionBuilder,
        (
          TxnFingerprintRow,
          BaseReferences<_$AppDatabase, $TransactionFingerprintsTable,
              TxnFingerprintRow>
        ),
        TxnFingerprintRow,
        PrefetchHooks Function()>;
typedef $$InsurancesTableCreateCompanionBuilder = InsurancesCompanion Function({
  required String id,
  required String vaultId,
  required String name,
  required String type,
  Value<String?> provider,
  required Decimal coverAmount,
  required Decimal premium,
  Value<int?> renewalDate,
  required int createdAt,
  Value<int> rowid,
});
typedef $$InsurancesTableUpdateCompanionBuilder = InsurancesCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> name,
  Value<String> type,
  Value<String?> provider,
  Value<Decimal> coverAmount,
  Value<Decimal> premium,
  Value<int?> renewalDate,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$InsurancesTableFilterComposer
    extends Composer<_$AppDatabase, $InsurancesTable> {
  $$InsurancesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get provider => $composableBuilder(
      column: $table.provider, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get coverAmount =>
      $composableBuilder(
          column: $table.coverAmount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get premium =>
      $composableBuilder(
          column: $table.premium,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get renewalDate => $composableBuilder(
      column: $table.renewalDate, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$InsurancesTableOrderingComposer
    extends Composer<_$AppDatabase, $InsurancesTable> {
  $$InsurancesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get provider => $composableBuilder(
      column: $table.provider, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get coverAmount => $composableBuilder(
      column: $table.coverAmount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get premium => $composableBuilder(
      column: $table.premium, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get renewalDate => $composableBuilder(
      column: $table.renewalDate, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$InsurancesTableAnnotationComposer
    extends Composer<_$AppDatabase, $InsurancesTable> {
  $$InsurancesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get provider =>
      $composableBuilder(column: $table.provider, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get coverAmount =>
      $composableBuilder(
          column: $table.coverAmount, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get premium =>
      $composableBuilder(column: $table.premium, builder: (column) => column);

  GeneratedColumn<int> get renewalDate => $composableBuilder(
      column: $table.renewalDate, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$InsurancesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $InsurancesTable,
    InsuranceRow,
    $$InsurancesTableFilterComposer,
    $$InsurancesTableOrderingComposer,
    $$InsurancesTableAnnotationComposer,
    $$InsurancesTableCreateCompanionBuilder,
    $$InsurancesTableUpdateCompanionBuilder,
    (
      InsuranceRow,
      BaseReferences<_$AppDatabase, $InsurancesTable, InsuranceRow>
    ),
    InsuranceRow,
    PrefetchHooks Function()> {
  $$InsurancesTableTableManager(_$AppDatabase db, $InsurancesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$InsurancesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$InsurancesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$InsurancesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> type = const Value.absent(),
            Value<String?> provider = const Value.absent(),
            Value<Decimal> coverAmount = const Value.absent(),
            Value<Decimal> premium = const Value.absent(),
            Value<int?> renewalDate = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              InsurancesCompanion(
            id: id,
            vaultId: vaultId,
            name: name,
            type: type,
            provider: provider,
            coverAmount: coverAmount,
            premium: premium,
            renewalDate: renewalDate,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String name,
            required String type,
            Value<String?> provider = const Value.absent(),
            required Decimal coverAmount,
            required Decimal premium,
            Value<int?> renewalDate = const Value.absent(),
            required int createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              InsurancesCompanion.insert(
            id: id,
            vaultId: vaultId,
            name: name,
            type: type,
            provider: provider,
            coverAmount: coverAmount,
            premium: premium,
            renewalDate: renewalDate,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$InsurancesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $InsurancesTable,
    InsuranceRow,
    $$InsurancesTableFilterComposer,
    $$InsurancesTableOrderingComposer,
    $$InsurancesTableAnnotationComposer,
    $$InsurancesTableCreateCompanionBuilder,
    $$InsurancesTableUpdateCompanionBuilder,
    (
      InsuranceRow,
      BaseReferences<_$AppDatabase, $InsurancesTable, InsuranceRow>
    ),
    InsuranceRow,
    PrefetchHooks Function()>;
typedef $$NetWorthSnapshotsTableCreateCompanionBuilder
    = NetWorthSnapshotsCompanion Function({
  required String id,
  required String vaultId,
  required int date,
  required Decimal netWorth,
  required Decimal cash,
  required Decimal investments,
  required Decimal liabilities,
  Value<int> rowid,
});
typedef $$NetWorthSnapshotsTableUpdateCompanionBuilder
    = NetWorthSnapshotsCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<int> date,
  Value<Decimal> netWorth,
  Value<Decimal> cash,
  Value<Decimal> investments,
  Value<Decimal> liabilities,
  Value<int> rowid,
});

class $$NetWorthSnapshotsTableFilterComposer
    extends Composer<_$AppDatabase, $NetWorthSnapshotsTable> {
  $$NetWorthSnapshotsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get netWorth =>
      $composableBuilder(
          column: $table.netWorth,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get cash =>
      $composableBuilder(
          column: $table.cash,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get investments =>
      $composableBuilder(
          column: $table.investments,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get liabilities =>
      $composableBuilder(
          column: $table.liabilities,
          builder: (column) => ColumnWithTypeConverterFilters(column));
}

class $$NetWorthSnapshotsTableOrderingComposer
    extends Composer<_$AppDatabase, $NetWorthSnapshotsTable> {
  $$NetWorthSnapshotsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get netWorth => $composableBuilder(
      column: $table.netWorth, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get cash => $composableBuilder(
      column: $table.cash, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get investments => $composableBuilder(
      column: $table.investments, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get liabilities => $composableBuilder(
      column: $table.liabilities, builder: (column) => ColumnOrderings(column));
}

class $$NetWorthSnapshotsTableAnnotationComposer
    extends Composer<_$AppDatabase, $NetWorthSnapshotsTable> {
  $$NetWorthSnapshotsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<int> get date =>
      $composableBuilder(column: $table.date, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get netWorth =>
      $composableBuilder(column: $table.netWorth, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get cash =>
      $composableBuilder(column: $table.cash, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get investments =>
      $composableBuilder(
          column: $table.investments, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get liabilities =>
      $composableBuilder(
          column: $table.liabilities, builder: (column) => column);
}

class $$NetWorthSnapshotsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $NetWorthSnapshotsTable,
    NetWorthSnapshotRow,
    $$NetWorthSnapshotsTableFilterComposer,
    $$NetWorthSnapshotsTableOrderingComposer,
    $$NetWorthSnapshotsTableAnnotationComposer,
    $$NetWorthSnapshotsTableCreateCompanionBuilder,
    $$NetWorthSnapshotsTableUpdateCompanionBuilder,
    (
      NetWorthSnapshotRow,
      BaseReferences<_$AppDatabase, $NetWorthSnapshotsTable,
          NetWorthSnapshotRow>
    ),
    NetWorthSnapshotRow,
    PrefetchHooks Function()> {
  $$NetWorthSnapshotsTableTableManager(
      _$AppDatabase db, $NetWorthSnapshotsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$NetWorthSnapshotsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$NetWorthSnapshotsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$NetWorthSnapshotsTableAnnotationComposer(
                  $db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<int> date = const Value.absent(),
            Value<Decimal> netWorth = const Value.absent(),
            Value<Decimal> cash = const Value.absent(),
            Value<Decimal> investments = const Value.absent(),
            Value<Decimal> liabilities = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              NetWorthSnapshotsCompanion(
            id: id,
            vaultId: vaultId,
            date: date,
            netWorth: netWorth,
            cash: cash,
            investments: investments,
            liabilities: liabilities,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required int date,
            required Decimal netWorth,
            required Decimal cash,
            required Decimal investments,
            required Decimal liabilities,
            Value<int> rowid = const Value.absent(),
          }) =>
              NetWorthSnapshotsCompanion.insert(
            id: id,
            vaultId: vaultId,
            date: date,
            netWorth: netWorth,
            cash: cash,
            investments: investments,
            liabilities: liabilities,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$NetWorthSnapshotsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $NetWorthSnapshotsTable,
    NetWorthSnapshotRow,
    $$NetWorthSnapshotsTableFilterComposer,
    $$NetWorthSnapshotsTableOrderingComposer,
    $$NetWorthSnapshotsTableAnnotationComposer,
    $$NetWorthSnapshotsTableCreateCompanionBuilder,
    $$NetWorthSnapshotsTableUpdateCompanionBuilder,
    (
      NetWorthSnapshotRow,
      BaseReferences<_$AppDatabase, $NetWorthSnapshotsTable,
          NetWorthSnapshotRow>
    ),
    NetWorthSnapshotRow,
    PrefetchHooks Function()>;
typedef $$AccountsTableCreateCompanionBuilder = AccountsCompanion Function({
  required String id,
  required String vaultId,
  required String name,
  required String type,
  Value<String> subtype,
  Value<String> currency,
  Value<Decimal> openingBalance,
  Value<bool> archived,
  required int createdAt,
  Value<int> rowid,
});
typedef $$AccountsTableUpdateCompanionBuilder = AccountsCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> name,
  Value<String> type,
  Value<String> subtype,
  Value<String> currency,
  Value<Decimal> openingBalance,
  Value<bool> archived,
  Value<int> createdAt,
  Value<int> rowid,
});

final class $$AccountsTableReferences
    extends BaseReferences<_$AppDatabase, $AccountsTable, AccountRow> {
  $$AccountsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$PostingsTable, List<PostingRow>>
      _postingsRefsTable(_$AppDatabase db) =>
          MultiTypedResultKey.fromTable(db.postings,
              aliasName:
                  $_aliasNameGenerator(db.accounts.id, db.postings.accountId));

  $$PostingsTableProcessedTableManager get postingsRefs {
    final manager = $$PostingsTableTableManager($_db, $_db.postings)
        .filter((f) => f.accountId.id($_item.id));

    final cache = $_typedResult.readTableOrNull(_postingsRefsTable($_db));
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: cache));
  }
}

class $$AccountsTableFilterComposer
    extends Composer<_$AppDatabase, $AccountsTable> {
  $$AccountsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get subtype => $composableBuilder(
      column: $table.subtype, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get currency => $composableBuilder(
      column: $table.currency, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get openingBalance =>
      $composableBuilder(
          column: $table.openingBalance,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<bool> get archived => $composableBuilder(
      column: $table.archived, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));

  Expression<bool> postingsRefs(
      Expression<bool> Function($$PostingsTableFilterComposer f) f) {
    final $$PostingsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.postings,
        getReferencedColumn: (t) => t.accountId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$PostingsTableFilterComposer(
              $db: $db,
              $table: $db.postings,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$AccountsTableOrderingComposer
    extends Composer<_$AppDatabase, $AccountsTable> {
  $$AccountsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get subtype => $composableBuilder(
      column: $table.subtype, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get currency => $composableBuilder(
      column: $table.currency, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get openingBalance => $composableBuilder(
      column: $table.openingBalance,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get archived => $composableBuilder(
      column: $table.archived, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$AccountsTableAnnotationComposer
    extends Composer<_$AppDatabase, $AccountsTable> {
  $$AccountsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get subtype =>
      $composableBuilder(column: $table.subtype, builder: (column) => column);

  GeneratedColumn<String> get currency =>
      $composableBuilder(column: $table.currency, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get openingBalance =>
      $composableBuilder(
          column: $table.openingBalance, builder: (column) => column);

  GeneratedColumn<bool> get archived =>
      $composableBuilder(column: $table.archived, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  Expression<T> postingsRefs<T extends Object>(
      Expression<T> Function($$PostingsTableAnnotationComposer a) f) {
    final $$PostingsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.id,
        referencedTable: $db.postings,
        getReferencedColumn: (t) => t.accountId,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$PostingsTableAnnotationComposer(
              $db: $db,
              $table: $db.postings,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return f(composer);
  }
}

class $$AccountsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AccountsTable,
    AccountRow,
    $$AccountsTableFilterComposer,
    $$AccountsTableOrderingComposer,
    $$AccountsTableAnnotationComposer,
    $$AccountsTableCreateCompanionBuilder,
    $$AccountsTableUpdateCompanionBuilder,
    (AccountRow, $$AccountsTableReferences),
    AccountRow,
    PrefetchHooks Function({bool postingsRefs})> {
  $$AccountsTableTableManager(_$AppDatabase db, $AccountsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AccountsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AccountsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AccountsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> type = const Value.absent(),
            Value<String> subtype = const Value.absent(),
            Value<String> currency = const Value.absent(),
            Value<Decimal> openingBalance = const Value.absent(),
            Value<bool> archived = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AccountsCompanion(
            id: id,
            vaultId: vaultId,
            name: name,
            type: type,
            subtype: subtype,
            currency: currency,
            openingBalance: openingBalance,
            archived: archived,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String name,
            required String type,
            Value<String> subtype = const Value.absent(),
            Value<String> currency = const Value.absent(),
            Value<Decimal> openingBalance = const Value.absent(),
            Value<bool> archived = const Value.absent(),
            required int createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              AccountsCompanion.insert(
            id: id,
            vaultId: vaultId,
            name: name,
            type: type,
            subtype: subtype,
            currency: currency,
            openingBalance: openingBalance,
            archived: archived,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) =>
                  (e.readTable(table), $$AccountsTableReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: ({postingsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [if (postingsRefs) db.postings],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (postingsRefs)
                    await $_getPrefetchedData(
                        currentTable: table,
                        referencedTable:
                            $$AccountsTableReferences._postingsRefsTable(db),
                        managerFromTypedResult: (p0) =>
                            $$AccountsTableReferences(db, table, p0)
                                .postingsRefs,
                        referencedItemsForCurrentItem:
                            (item, referencedItems) => referencedItems
                                .where((e) => e.accountId == item.id),
                        typedResults: items)
                ];
              },
            );
          },
        ));
}

typedef $$AccountsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $AccountsTable,
    AccountRow,
    $$AccountsTableFilterComposer,
    $$AccountsTableOrderingComposer,
    $$AccountsTableAnnotationComposer,
    $$AccountsTableCreateCompanionBuilder,
    $$AccountsTableUpdateCompanionBuilder,
    (AccountRow, $$AccountsTableReferences),
    AccountRow,
    PrefetchHooks Function({bool postingsRefs})>;
typedef $$PostingsTableCreateCompanionBuilder = PostingsCompanion Function({
  required String id,
  required String vaultId,
  required String entryId,
  required String accountId,
  required Decimal amount,
  Value<int> rowid,
});
typedef $$PostingsTableUpdateCompanionBuilder = PostingsCompanion Function({
  Value<String> id,
  Value<String> vaultId,
  Value<String> entryId,
  Value<String> accountId,
  Value<Decimal> amount,
  Value<int> rowid,
});

final class $$PostingsTableReferences
    extends BaseReferences<_$AppDatabase, $PostingsTable, PostingRow> {
  $$PostingsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $TransactionsTable _entryIdTable(_$AppDatabase db) =>
      db.transactions.createAlias(
          $_aliasNameGenerator(db.postings.entryId, db.transactions.id));

  $$TransactionsTableProcessedTableManager? get entryId {
    if ($_item.entryId == null) return null;
    final manager = $$TransactionsTableTableManager($_db, $_db.transactions)
        .filter((f) => f.id($_item.entryId!));
    final item = $_typedResult.readTableOrNull(_entryIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }

  static $AccountsTable _accountIdTable(_$AppDatabase db) => db.accounts
      .createAlias($_aliasNameGenerator(db.postings.accountId, db.accounts.id));

  $$AccountsTableProcessedTableManager? get accountId {
    if ($_item.accountId == null) return null;
    final manager = $$AccountsTableTableManager($_db, $_db.accounts)
        .filter((f) => f.id($_item.accountId!));
    final item = $_typedResult.readTableOrNull(_accountIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
        manager.$state.copyWith(prefetchedData: [item]));
  }
}

class $$PostingsTableFilterComposer
    extends Composer<_$AppDatabase, $PostingsTable> {
  $$PostingsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get amount =>
      $composableBuilder(
          column: $table.amount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  $$TransactionsTableFilterComposer get entryId {
    final $$TransactionsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.entryId,
        referencedTable: $db.transactions,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$TransactionsTableFilterComposer(
              $db: $db,
              $table: $db.transactions,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  $$AccountsTableFilterComposer get accountId {
    final $$AccountsTableFilterComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.accountId,
        referencedTable: $db.accounts,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$AccountsTableFilterComposer(
              $db: $db,
              $table: $db.accounts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$PostingsTableOrderingComposer
    extends Composer<_$AppDatabase, $PostingsTable> {
  $$PostingsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get amount => $composableBuilder(
      column: $table.amount, builder: (column) => ColumnOrderings(column));

  $$TransactionsTableOrderingComposer get entryId {
    final $$TransactionsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.entryId,
        referencedTable: $db.transactions,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$TransactionsTableOrderingComposer(
              $db: $db,
              $table: $db.transactions,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  $$AccountsTableOrderingComposer get accountId {
    final $$AccountsTableOrderingComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.accountId,
        referencedTable: $db.accounts,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$AccountsTableOrderingComposer(
              $db: $db,
              $table: $db.accounts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$PostingsTableAnnotationComposer
    extends Composer<_$AppDatabase, $PostingsTable> {
  $$PostingsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get amount =>
      $composableBuilder(column: $table.amount, builder: (column) => column);

  $$TransactionsTableAnnotationComposer get entryId {
    final $$TransactionsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.entryId,
        referencedTable: $db.transactions,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$TransactionsTableAnnotationComposer(
              $db: $db,
              $table: $db.transactions,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }

  $$AccountsTableAnnotationComposer get accountId {
    final $$AccountsTableAnnotationComposer composer = $composerBuilder(
        composer: this,
        getCurrentColumn: (t) => t.accountId,
        referencedTable: $db.accounts,
        getReferencedColumn: (t) => t.id,
        builder: (joinBuilder,
                {$addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer}) =>
            $$AccountsTableAnnotationComposer(
              $db: $db,
              $table: $db.accounts,
              $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
              joinBuilder: joinBuilder,
              $removeJoinBuilderFromRootComposer:
                  $removeJoinBuilderFromRootComposer,
            ));
    return composer;
  }
}

class $$PostingsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $PostingsTable,
    PostingRow,
    $$PostingsTableFilterComposer,
    $$PostingsTableOrderingComposer,
    $$PostingsTableAnnotationComposer,
    $$PostingsTableCreateCompanionBuilder,
    $$PostingsTableUpdateCompanionBuilder,
    (PostingRow, $$PostingsTableReferences),
    PostingRow,
    PrefetchHooks Function({bool entryId, bool accountId})> {
  $$PostingsTableTableManager(_$AppDatabase db, $PostingsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PostingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PostingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PostingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<String> entryId = const Value.absent(),
            Value<String> accountId = const Value.absent(),
            Value<Decimal> amount = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              PostingsCompanion(
            id: id,
            vaultId: vaultId,
            entryId: entryId,
            accountId: accountId,
            amount: amount,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required String entryId,
            required String accountId,
            required Decimal amount,
            Value<int> rowid = const Value.absent(),
          }) =>
              PostingsCompanion.insert(
            id: id,
            vaultId: vaultId,
            entryId: entryId,
            accountId: accountId,
            amount: amount,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) =>
                  (e.readTable(table), $$PostingsTableReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: ({entryId = false, accountId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins: <
                  T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic>>(state) {
                if (entryId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.entryId,
                    referencedTable:
                        $$PostingsTableReferences._entryIdTable(db),
                    referencedColumn:
                        $$PostingsTableReferences._entryIdTable(db).id,
                  ) as T;
                }
                if (accountId) {
                  state = state.withJoin(
                    currentTable: table,
                    currentColumn: table.accountId,
                    referencedTable:
                        $$PostingsTableReferences._accountIdTable(db),
                    referencedColumn:
                        $$PostingsTableReferences._accountIdTable(db).id,
                  ) as T;
                }

                return state;
              },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ));
}

typedef $$PostingsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $PostingsTable,
    PostingRow,
    $$PostingsTableFilterComposer,
    $$PostingsTableOrderingComposer,
    $$PostingsTableAnnotationComposer,
    $$PostingsTableCreateCompanionBuilder,
    $$PostingsTableUpdateCompanionBuilder,
    (PostingRow, $$PostingsTableReferences),
    PostingRow,
    PrefetchHooks Function({bool entryId, bool accountId})>;
typedef $$PendingCapturesTableCreateCompanionBuilder = PendingCapturesCompanion
    Function({
  required String id,
  required String vaultId,
  required Decimal amount,
  required String type,
  Value<String?> merchant,
  required int occurredAt,
  required String source,
  Value<bool> uncategorized,
  required String fingerprint,
  required int capturedAt,
  Value<int> rowid,
});
typedef $$PendingCapturesTableUpdateCompanionBuilder = PendingCapturesCompanion
    Function({
  Value<String> id,
  Value<String> vaultId,
  Value<Decimal> amount,
  Value<String> type,
  Value<String?> merchant,
  Value<int> occurredAt,
  Value<String> source,
  Value<bool> uncategorized,
  Value<String> fingerprint,
  Value<int> capturedAt,
  Value<int> rowid,
});

class $$PendingCapturesTableFilterComposer
    extends Composer<_$AppDatabase, $PendingCapturesTable> {
  $$PendingCapturesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<Decimal, Decimal, String> get amount =>
      $composableBuilder(
          column: $table.amount,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get merchant => $composableBuilder(
      column: $table.merchant, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get occurredAt => $composableBuilder(
      column: $table.occurredAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get uncategorized => $composableBuilder(
      column: $table.uncategorized, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get fingerprint => $composableBuilder(
      column: $table.fingerprint, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get capturedAt => $composableBuilder(
      column: $table.capturedAt, builder: (column) => ColumnFilters(column));
}

class $$PendingCapturesTableOrderingComposer
    extends Composer<_$AppDatabase, $PendingCapturesTable> {
  $$PendingCapturesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get vaultId => $composableBuilder(
      column: $table.vaultId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get amount => $composableBuilder(
      column: $table.amount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get merchant => $composableBuilder(
      column: $table.merchant, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get occurredAt => $composableBuilder(
      column: $table.occurredAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get uncategorized => $composableBuilder(
      column: $table.uncategorized,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get fingerprint => $composableBuilder(
      column: $table.fingerprint, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get capturedAt => $composableBuilder(
      column: $table.capturedAt, builder: (column) => ColumnOrderings(column));
}

class $$PendingCapturesTableAnnotationComposer
    extends Composer<_$AppDatabase, $PendingCapturesTable> {
  $$PendingCapturesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get vaultId =>
      $composableBuilder(column: $table.vaultId, builder: (column) => column);

  GeneratedColumnWithTypeConverter<Decimal, String> get amount =>
      $composableBuilder(column: $table.amount, builder: (column) => column);

  GeneratedColumn<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get merchant =>
      $composableBuilder(column: $table.merchant, builder: (column) => column);

  GeneratedColumn<int> get occurredAt => $composableBuilder(
      column: $table.occurredAt, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<bool> get uncategorized => $composableBuilder(
      column: $table.uncategorized, builder: (column) => column);

  GeneratedColumn<String> get fingerprint => $composableBuilder(
      column: $table.fingerprint, builder: (column) => column);

  GeneratedColumn<int> get capturedAt => $composableBuilder(
      column: $table.capturedAt, builder: (column) => column);
}

class $$PendingCapturesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $PendingCapturesTable,
    PendingCaptureRow,
    $$PendingCapturesTableFilterComposer,
    $$PendingCapturesTableOrderingComposer,
    $$PendingCapturesTableAnnotationComposer,
    $$PendingCapturesTableCreateCompanionBuilder,
    $$PendingCapturesTableUpdateCompanionBuilder,
    (
      PendingCaptureRow,
      BaseReferences<_$AppDatabase, $PendingCapturesTable, PendingCaptureRow>
    ),
    PendingCaptureRow,
    PrefetchHooks Function()> {
  $$PendingCapturesTableTableManager(
      _$AppDatabase db, $PendingCapturesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PendingCapturesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PendingCapturesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PendingCapturesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> vaultId = const Value.absent(),
            Value<Decimal> amount = const Value.absent(),
            Value<String> type = const Value.absent(),
            Value<String?> merchant = const Value.absent(),
            Value<int> occurredAt = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<bool> uncategorized = const Value.absent(),
            Value<String> fingerprint = const Value.absent(),
            Value<int> capturedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              PendingCapturesCompanion(
            id: id,
            vaultId: vaultId,
            amount: amount,
            type: type,
            merchant: merchant,
            occurredAt: occurredAt,
            source: source,
            uncategorized: uncategorized,
            fingerprint: fingerprint,
            capturedAt: capturedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String vaultId,
            required Decimal amount,
            required String type,
            Value<String?> merchant = const Value.absent(),
            required int occurredAt,
            required String source,
            Value<bool> uncategorized = const Value.absent(),
            required String fingerprint,
            required int capturedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              PendingCapturesCompanion.insert(
            id: id,
            vaultId: vaultId,
            amount: amount,
            type: type,
            merchant: merchant,
            occurredAt: occurredAt,
            source: source,
            uncategorized: uncategorized,
            fingerprint: fingerprint,
            capturedAt: capturedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$PendingCapturesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $PendingCapturesTable,
    PendingCaptureRow,
    $$PendingCapturesTableFilterComposer,
    $$PendingCapturesTableOrderingComposer,
    $$PendingCapturesTableAnnotationComposer,
    $$PendingCapturesTableCreateCompanionBuilder,
    $$PendingCapturesTableUpdateCompanionBuilder,
    (
      PendingCaptureRow,
      BaseReferences<_$AppDatabase, $PendingCapturesTable, PendingCaptureRow>
    ),
    PendingCaptureRow,
    PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CategoriesTableTableManager get categories =>
      $$CategoriesTableTableManager(_db, _db.categories);
  $$TransactionsTableTableManager get transactions =>
      $$TransactionsTableTableManager(_db, _db.transactions);
  $$BudgetsTableTableManager get budgets =>
      $$BudgetsTableTableManager(_db, _db.budgets);
  $$MerchantAliasesTableTableManager get merchantAliases =>
      $$MerchantAliasesTableTableManager(_db, _db.merchantAliases);
  $$HoldingsTableTableManager get holdings =>
      $$HoldingsTableTableManager(_db, _db.holdings);
  $$LiabilitiesTableTableManager get liabilities =>
      $$LiabilitiesTableTableManager(_db, _db.liabilities);
  $$GoalsTableTableManager get goals =>
      $$GoalsTableTableManager(_db, _db.goals);
  $$GoalContributionsTableTableManager get goalContributions =>
      $$GoalContributionsTableTableManager(_db, _db.goalContributions);
  $$RecurringRulesTableTableManager get recurringRules =>
      $$RecurringRulesTableTableManager(_db, _db.recurringRules);
  $$FxRatesTableTableManager get fxRates =>
      $$FxRatesTableTableManager(_db, _db.fxRates);
  $$TransactionFingerprintsTableTableManager get transactionFingerprints =>
      $$TransactionFingerprintsTableTableManager(
          _db, _db.transactionFingerprints);
  $$InsurancesTableTableManager get insurances =>
      $$InsurancesTableTableManager(_db, _db.insurances);
  $$NetWorthSnapshotsTableTableManager get netWorthSnapshots =>
      $$NetWorthSnapshotsTableTableManager(_db, _db.netWorthSnapshots);
  $$AccountsTableTableManager get accounts =>
      $$AccountsTableTableManager(_db, _db.accounts);
  $$PostingsTableTableManager get postings =>
      $$PostingsTableTableManager(_db, _db.postings);
  $$PendingCapturesTableTableManager get pendingCaptures =>
      $$PendingCapturesTableTableManager(_db, _db.pendingCaptures);
}
