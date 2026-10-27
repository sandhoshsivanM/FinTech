import 'dart:async';

import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';

import '../app_services.dart';
import '../core/gateway_client.dart';
import '../ledger/ledger.dart';
import 'approve_screen.dart';
import 'sign_in_screen.dart';

String money(Decimal d) => d.toStringAsFixed(2);

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.services});
  final AppServices services;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Ledger _ledger = Ledger.empty;
  String _status = 'Syncing…';
  bool _loaded = false;

  AppServices get _s => widget.services;

  @override
  void initState() {
    super.initState();
    _refresh();
    _sync();
  }

  Future<void> _refresh() async {
    final l = await _s.ledger();
    if (mounted) {
      setState(() {
        _ledger = l;
        _loaded = true;
      });
    }
  }

  Future<void> _sync() async {
    try {
      final r = await _s.engine.sync();
      if (!mounted) return;
      setState(() => _status = r.pushed + r.pulled == 0 ? 'Up to date' : 'Synced (${r.pushed} sent, ${r.pulled} received)');
    } on ApiException catch (e) {
      if (e.status == 401) return _toSignIn();
      if (mounted) setState(() => _status = 'Sync failed (${e.status}). Your changes are saved here.');
    } catch (_) {
      if (mounted) setState(() => _status = 'Offline. Your changes are saved here and will sync later.');
    }
    await _refresh();
  }

  void _toSignIn() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => SignInScreen(services: _s)));
  }

  Future<void> _signOut() async {
    try {
      await _s.signOut();
    } catch (_) {
      // Signed out locally either way.
    }
    _toSignIn();
  }

  Future<void> _write(Future<void> Function() change) async {
    await change();
    await _refresh();
    unawaited(_sync());
  }

  Future<void> _addAccount() async {
    final v = await showDialog<_AccountForm>(context: context, builder: (_) => const _AccountDialog());
    if (v != null) await _write(() => _s.writer.addAccount(name: v.name, kind: v.kind, openingBalance: v.opening));
  }

  Future<void> _addTxn() async {
    if (_ledger.accounts.isEmpty) return;
    final v = await showDialog<_TxnForm>(context: context, builder: (_) => _TxnDialog(accounts: _ledger.accounts));
    if (v != null) {
      await _write(() => _s.writer.addTxn(
          accountId: v.account.id, type: v.type, amount: v.amount, date: v.date, note: v.note, category: v.category));
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Khazana Online'),
        actions: [
          IconButton(
            tooltip: 'Approve a new device',
            icon: const Icon(Icons.qr_code_scanner),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ApproveScreen(services: _s))),
          ),
          TextButton(onPressed: _signOut, child: const Text('Sign out')),
        ],
      ),
      floatingActionButton: PopupMenuButton<String>(
        key: const Key('add-menu'),
        onSelected: (v) => v == 'account' ? _addAccount() : _addTxn(),
        itemBuilder: (_) => [
          const PopupMenuItem(value: 'account', child: Text('Add account')),
          PopupMenuItem(value: 'txn', enabled: _ledger.accounts.isNotEmpty, child: const Text('Add transaction')),
        ],
        child: const FloatingActionButton.extended(onPressed: null, icon: Icon(Icons.add), label: Text('Add')),
      ),
      body: RefreshIndicator(
        onRefresh: _sync,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(_status, key: const Key('sync-status'), style: TextStyle(color: muted)),
            const SizedBox(height: 8),
            if (_loaded) ...[
              Text('Net worth', style: TextStyle(color: muted)),
              Text(money(netWorth(_ledger)), key: const Key('net-worth'), style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 16),
              Text('Accounts', style: Theme.of(context).textTheme.titleMedium),
              if (_ledger.accounts.isEmpty) Text('No accounts yet. Add one to start.', style: TextStyle(color: muted)),
              for (final a in _ledger.accounts)
                Card(
                  child: ListTile(
                    title: Text(a.name),
                    subtitle: Text(a.kind == AccountKind.creditCard ? '${a.kind.label}, owed' : a.kind.label),
                    trailing: Text(money(balance(a, _ledger.transactions))),
                    onLongPress: () => _write(() => _s.writer.deleteAccount(a, _ledger)),
                  ),
                ),
              const SizedBox(height: 16),
              Text('Transactions', style: Theme.of(context).textTheme.titleMedium),
              if (_ledger.transactions.isEmpty) Text('No transactions yet.', style: TextStyle(color: muted)),
              for (final t in _ledger.transactions)
                Dismissible(
                  key: ValueKey(t.id),
                  onDismissed: (_) => _write(() => _s.writer.deleteTxn(t)),
                  child: ListTile(
                    title: Text(t.note.isEmpty ? (t.category.isEmpty ? t.type.name : t.category) : t.note),
                    subtitle: Text('${t.date}  ${_ledger.accounts.where((a) => a.id == t.accountId).firstOrNull?.name ?? ''}'),
                    trailing: Text('${t.type == TxnType.income ? '+' : '-'}${money(t.amount)}'),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AccountForm {
  _AccountForm(this.name, this.kind, this.opening);
  final String name;
  final AccountKind kind;
  final Decimal opening;
}

class _AccountDialog extends StatefulWidget {
  const _AccountDialog();
  @override
  State<_AccountDialog> createState() => _AccountDialogState();
}

class _AccountDialogState extends State<_AccountDialog> {
  final _name = TextEditingController();
  final _opening = TextEditingController(text: '0');
  AccountKind _kind = AccountKind.bank;

  @override
  void dispose() {
    _name.dispose();
    _opening.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final opening = Decimal.tryParse(_opening.text.trim());
    return AlertDialog(
      title: const Text('Add account'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(key: const Key('account-name'), controller: _name, decoration: const InputDecoration(labelText: 'Name'), onChanged: (_) => setState(() {})),
        DropdownButton<AccountKind>(
          value: _kind,
          isExpanded: true,
          items: [for (final k in AccountKind.values) DropdownMenuItem(value: k, child: Text(k.label))],
          onChanged: (k) => setState(() => _kind = k ?? _kind),
        ),
        TextField(
          key: const Key('account-opening'),
          controller: _opening,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Opening balance'),
          onChanged: (_) => setState(() {}),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          key: const Key('account-save'),
          onPressed: _name.text.trim().isEmpty || opening == null ? null : () => Navigator.pop(context, _AccountForm(_name.text.trim(), _kind, opening)),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class _TxnForm {
  _TxnForm(this.account, this.type, this.amount, this.date, this.note, this.category);
  final Account account;
  final TxnType type;
  final Decimal amount;
  final String date;
  final String note;
  final String category;
}

class _TxnDialog extends StatefulWidget {
  const _TxnDialog({required this.accounts});
  final List<Account> accounts;
  @override
  State<_TxnDialog> createState() => _TxnDialogState();
}

class _TxnDialogState extends State<_TxnDialog> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  final _category = TextEditingController();
  late Account _account = widget.accounts.first;
  TxnType _type = TxnType.expense;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _category.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final amount = Decimal.tryParse(_amount.text.trim());
    final valid = amount != null && amount > Decimal.zero;
    return AlertDialog(
      title: const Text('Add transaction'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButton<Account>(
            value: _account,
            isExpanded: true,
            items: [for (final a in widget.accounts) DropdownMenuItem(value: a, child: Text(a.name))],
            onChanged: (a) => setState(() => _account = a ?? _account),
          ),
          SegmentedButton<TxnType>(
            segments: const [ButtonSegment(value: TxnType.expense, label: Text('Expense')), ButtonSegment(value: TxnType.income, label: Text('Income'))],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          TextField(
            key: const Key('txn-amount'),
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Amount'),
            onChanged: (_) => setState(() {}),
          ),
          TextField(key: const Key('txn-note'), controller: _note, decoration: const InputDecoration(labelText: 'Note')),
          TextField(controller: _category, decoration: const InputDecoration(labelText: 'Category')),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          key: const Key('txn-save'),
          onPressed: !valid
              ? null
              : () {
                  final d = DateTime.now();
                  final date = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
                  Navigator.pop(context, _TxnForm(_account, _type, amount, date, _note.text.trim(), _category.text.trim()));
                },
          child: const Text('Save'),
        ),
      ],
    );
  }
}
