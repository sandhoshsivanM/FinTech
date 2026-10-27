import 'package:flutter/material.dart';

import 'card_maths.dart';
import 'card_palette.dart';
import 'card_store.dart';
import 'coming_soon_screen.dart';

const _peek = 58.0;
const _cardHeight = 196.0;
const _privacyNote =
    'Khazana never asks for the full card number, expiry date or CVV, and never stores them. The last 4 digits are enough to match your bank alerts.';

/// Cards: a stack (picked card to the front, the others peeking above), the
/// picked card's utilisation and bill, the total, and a detail page.
class CardsScreen extends StatefulWidget {
  const CardsScreen({
    super.key,
    required this.store,
    this.txns = noTxns,
    this.now = DateTime.now,
  });
  final CardStore store;
  final TxnSource txns;
  final DateTime Function() now;

  @override
  State<CardsScreen> createState() => _CardsScreenState();
}

class _CardsScreenState extends State<CardsScreen> {
  List<CardView> _views = [];
  bool _loaded = false;
  String? _pickedId;
  bool _detail = false;
  bool _confirmDelete = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cards = await widget.store.all()
      ..sort((a, b) => a.name.compareTo(b.name));
    final txns = await widget.txns();
    if (!mounted) return;
    setState(() {
      _views = [for (final c in cards) viewOf(c, txns, widget.now())];
      _loaded = true;
    });
  }

  CardView? get _sel {
    if (_views.isEmpty) return null;
    return _views.firstWhere(
      (v) => v.card.id == _pickedId,
      orElse: () => _views.first,
    );
  }

  Future<void> _edit([CreditCard? existing]) async {
    final input = await showModalBottomSheet<CardInput>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => CardSheet(existing: existing),
    );
    if (input == null) return;
    final card = CreditCard(
      id: existing?.id ?? '${DateTime.now().microsecondsSinceEpoch}',
      name: input.name,
      network: input.network,
      last4: input.last4,
      limitPaise: input.limitPaise,
      statementDay: input.statementDay,
      dueDay: input.dueDay,
    );
    await widget.store.save(card);
    _pickedId = card.id;
    await _load();
  }

  Future<void> _delete(CreditCard card) async {
    await widget.store.delete(card.id);
    setState(() {
      _detail = false;
      _confirmDelete = false;
      _pickedId = null;
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final p = CardPalette.of(context);
    final sel = _sel;
    if (!_loaded) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_detail && sel != null) return _detailPage(context, p, sel);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Cards',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: OutlinedButton.icon(
              key: const Key('add-card'),
              onPressed: () => _edit(),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add card'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(48, 44),
                shape: const StadiumBorder(),
                side: BorderSide(color: p.line),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          _tabs(context, p),
          const SizedBox(height: 14),
          if (sel == null)
            _panel(p, [
              Text(
                'No cards yet. Add one to see what you owe, how close you are to the limit, and when the bill is due. It is worked out on this device from your bank alerts.',
                style: TextStyle(color: p.muted),
              ),
              FilledButton(
                onPressed: () => _edit(),
                child: const Text('Add a card'),
              ),
            ])
          else ...[
            _stack(p, sel),
            const SizedBox(height: 14),
            _selectedPanel(p, sel),
            const SizedBox(height: 14),
            _totalPanel(p),
          ],
        ],
      ),
    );
  }

  Widget _tabs(BuildContext context, CardPalette p) {
    Widget soon(String label, String what) => Expanded(
      child: TextButton(
        onPressed: () => Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => ComingSoonScreen(what: what))),
        style: TextButton.styleFrom(
          minimumSize: const Size(0, 36),
          foregroundColor: p.muted,
          shape: const StadiumBorder(),
        ),
        child: Text(label, style: const TextStyle(fontSize: 13)),
      ),
    );
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: ShapeDecoration(
        color: p.card,
        shape: StadiumBorder(side: BorderSide(color: p.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 36,
              alignment: Alignment.center,
              decoration: ShapeDecoration(
                color: p.ink,
                shape: const StadiumBorder(),
              ),
              child: Text(
                'My cards',
                style: TextStyle(
                  color: p.accentOn,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ),
          ),
          soon('Credit report · P5', 'Credit report'),
          soon('Offers · P5', 'Offers'),
        ],
      ),
    );
  }

  Widget _stack(CardPalette p, CardView sel) {
    final order = [..._views.where((v) => v != sel), sel];
    return SizedBox(
      key: const Key('card-stack'),
      height: (order.length - 1) * _peek + _cardHeight,
      child: Stack(
        children: [
          for (var pos = 0; pos < order.length; pos++)
            AnimatedPositioned(
              key: ValueKey(order[pos].card.id),
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 280),
              curve: const Cubic(.2, .8, .2, 1),
              top: pos * _peek,
              left: 0,
              right: 0,
              height: _cardHeight,
              child: _face(p, order[pos], order[pos] == sel),
            ),
        ],
      ),
    );
  }

  Widget _face(CardPalette p, CardView v, bool front) {
    final face =
        CardPalette.faces[_views.indexOf(v) % CardPalette.faces.length];
    const onFace = Colors.white;
    return Semantics(
      button: true,
      selected: front,
      label: front ? '${v.card.name}, selected' : 'Show ${v.card.name}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => setState(() => _pickedId = v.card.id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          decoration: BoxDecoration(
            color: face,
            borderRadius: BorderRadius.circular(24),
            boxShadow: const [
              BoxShadow(
                color: Color(0x2E000000),
                blurRadius: 18,
                offset: Offset(0, -6),
              ),
            ],
          ),
          child: DefaultTextStyle(
            style: const TextStyle(color: onFace),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      v.card.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      '•••• ${v.card.last4}',
                      style: const TextStyle(fontSize: 13, letterSpacing: 2),
                    ),
                  ],
                ),
                Container(
                  width: 40,
                  height: 30,
                  decoration: BoxDecoration(
                    color: CardPalette.gold,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Owed', style: TextStyle(fontSize: 12)),
                        Text(
                          inr(v.owed),
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      v.card.network.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .5,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _panel(CardPalette p, List<Widget> children) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: p.card,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: p.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          children[i],
        ],
      ],
    ),
  );

  Widget _chip(CardPalette p, String text, Color tone, {Color? bg}) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: ShapeDecoration(
          color: bg ?? tone.withValues(alpha: .14),
          shape: const StadiumBorder(),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: tone,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      );

  Widget _dueChip(CardPalette p, int days) {
    final t = dueTone(days);
    return _chip(
      p,
      dueText(days),
      p.tone(t),
      bg: t == Tone.quiet ? p.tray : null,
    );
  }

  Widget _gauge(CardPalette p, CardView v, double height, {bool mark = false}) {
    return Semantics(
      label: 'Utilisation ${v.pct}%',
      child: LayoutBuilder(
        builder: (context, c) {
          return SizedBox(
            height: height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: p.tray,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                Container(
                  width: c.maxWidth * v.pct.clamp(0, 100) / 100,
                  decoration: BoxDecoration(
                    color: p.tone(v.tone),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                if (mark)
                  Positioned(
                    left: c.maxWidth * goodUtilisation / 100,
                    top: -4,
                    child: Container(
                      width: 2,
                      height: height + 8,
                      color: p.ink.withValues(alpha: .5),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _selectedPanel(CardPalette p, CardView v) {
    String d(DateTime x) =>
        '${x.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.month - 1]}';
    return _panel(p, [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            v.card.name,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          Text(
            '${inr(v.available)} available',
            style: TextStyle(fontSize: 13, color: p.muted),
          ),
        ],
      ),
      Row(
        children: [
          Expanded(child: _gauge(p, v, 12)),
          const SizedBox(width: 10),
          _chip(p, '${v.pct}%', p.tone(v.tone)),
        ],
      ),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Text(
              'Bill ${d(v.cycle.statement)} · due ${d(v.cycle.due)}',
              style: TextStyle(fontSize: 13, color: p.muted),
            ),
          ),
          _dueChip(p, v.cycle.daysToDue),
        ],
      ),
      OutlinedButton(
        onPressed: () => setState(() => _detail = true),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(44),
          side: BorderSide(color: p.line),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: const Text('Card details'),
      ),
    ]);
  }

  Widget _totalPanel(CardPalette p) {
    final t = totals(_views);
    return _panel(p, [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            'Owed on all cards',
            style: TextStyle(fontSize: 13, color: p.muted),
          ),
          Text(
            '${t.pct}% of ${inr(t.limit)}',
            style: TextStyle(fontSize: 13, color: p.muted),
          ),
        ],
      ),
      Text(
        inr(t.owed),
        key: const Key('total-owed'),
        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
      ),
      Text(
        'Credit scores reward staying under $goodUtilisation% on each card. Worked out on this device from your bank alerts.',
        style: TextStyle(fontSize: 12, color: p.muted),
      ),
    ]);
  }

  Widget _detailPage(BuildContext context, CardPalette p, CardView v) {
    String d(DateTime x) =>
        '${x.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.month - 1]}';
    final dueColour = p.tone(dueTone(v.cycle.daysToDue));
    Widget stat(String label, String value) => Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: p.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: p.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 12, color: p.muted)),
            const SizedBox(height: 4),
            Text(
              value,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back to my cards',
          icon: const Icon(Icons.chevron_left),
          onPressed: () => setState(() {
            _detail = false;
            _confirmDelete = false;
          }),
        ),
        title: Text(
          v.card.name,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
        ),
        actions: [
          TextButton(
            key: const Key('edit-card'),
            onPressed: () => _edit(v.card),
            child: const Text('Edit'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          Row(
            children: [
              stat('Owed now', inr(v.owed)),
              const SizedBox(width: 10),
              stat('Limit', inr(v.limit)),
            ],
          ),
          const SizedBox(height: 14),
          _panel(p, [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Utilisation',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
                _chip(p, '${v.pct}%', p.tone(v.tone)),
              ],
            ),
            _gauge(p, v, 14, mark: true),
            Text(
              advice(v.owed, v.limit),
              key: const Key('advice'),
              style: TextStyle(fontSize: 12, color: p.muted),
            ),
          ]),
          const SizedBox(height: 14),
          _panel(p, [
            const Text(
              'This cycle',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 84,
                  child: Column(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: p.ink,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Bill',
                        style: TextStyle(fontSize: 12, color: p.muted),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        d(v.cycle.statement),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Stack(
                      children: [
                        Container(
                          height: 4,
                          decoration: BoxDecoration(
                            color: p.tray,
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: v.cycle.cyclePct / 100,
                          child: Container(
                            height: 4,
                            decoration: BoxDecoration(
                              color: dueColour,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SizedBox(
                  width: 84,
                  child: Column(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: dueColour, width: 2),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Due',
                        style: TextStyle(fontSize: 12, color: p.muted),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        d(v.cycle.due),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Bill amount ${inr(v.billed)}',
                  style: TextStyle(fontSize: 13, color: p.muted),
                ),
                _dueChip(p, v.cycle.daysToDue),
              ],
            ),
          ]),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: p.card,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: p.line),
            ),
            child: Column(
              children: [
                if (v.txns.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'No transactions matched •••• ${v.card.last4} yet.',
                        style: TextStyle(color: p.muted),
                      ),
                    ),
                  ),
                for (final t in v.txns)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: p.tray,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            Icons.chat_bubble_outline,
                            size: 16,
                            color: p.ink,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                t.note,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              Text(
                                '${_when(t.date)} · from bank alert',
                                style: TextStyle(fontSize: 12, color: p.muted),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '${t.isExpense ? '−' : '+'}${inr(t.paise)}',
                          style: TextStyle(
                            fontSize: 14,
                            color: t.isExpense ? p.expense : p.income,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (!_confirmDelete)
            OutlinedButton(
              key: const Key('delete-card'),
              onPressed: () => setState(() => _confirmDelete = true),
              child: const Text('Delete card'),
            )
          else
            _panel(p, [
              Text(
                'Delete ${v.card.name}? Your transactions stay; only the card goes.',
                style: TextStyle(color: p.muted),
              ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _confirmDelete = false),
                      child: const Text('Keep it'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      key: const Key('confirm-delete'),
                      onPressed: () => _delete(v.card),
                      child: const Text('Delete card'),
                    ),
                  ),
                ],
              ),
            ]),
        ],
      ),
    );
  }

  String _when(DateTime date) {
    final n = widget.now();
    final days = DateTime.utc(
      n.year,
      n.month,
      n.day,
    ).difference(DateTime.utc(date.year, date.month, date.day)).inDays;
    if (days == 0) return 'Today';
    if (days == 1) return 'Yesterday';
    return '${date.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.month - 1]}';
  }
}

/// Add or edit a card. Pops a [CardInput] once the form is valid.
class CardSheet extends StatefulWidget {
  const CardSheet({super.key, this.existing});
  final CreditCard? existing;

  @override
  State<CardSheet> createState() => _CardSheetState();
}

class _CardSheetState extends State<CardSheet> {
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _last4 = TextEditingController(text: widget.existing?.last4 ?? '');
  late final _limit = TextEditingController(
    text: widget.existing == null
        ? ''
        : (widget.existing!.limitPaise / 100).toStringAsFixed(
            widget.existing!.limitPaise % 100 == 0 ? 0 : 2,
          ),
  );
  late final _statement = TextEditingController(
    text: widget.existing?.statementDay.toString() ?? '',
  );
  late final _due = TextEditingController(
    text: widget.existing?.dueDay.toString() ?? '',
  );
  late String _network = widget.existing?.network ?? 'Visa';
  Map<String, String> _errors = {};

  @override
  void dispose() {
    for (final c in [_name, _last4, _limit, _statement, _due]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    final r = validateCard(
      CardForm(
        name: _name.text,
        network: _network,
        last4: _last4.text,
        limit: _limit.text,
        statementDay: _statement.text,
        dueDay: _due.text,
      ),
    );
    if (r.value == null) {
      setState(() => _errors = r.errors);
      return;
    }
    Navigator.of(context).pop(r.value);
  }

  @override
  Widget build(BuildContext context) {
    final p = CardPalette.of(context);
    final title = widget.existing == null ? 'Add a card' : 'Edit card';
    Widget field(
      String key,
      String label,
      TextEditingController c, {
      TextInputType? type,
      int? maxLength,
      double? spacing,
      String? hint,
    }) => TextField(
      key: Key(key),
      controller: c,
      keyboardType: type,
      maxLength: maxLength,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        errorText: _errors[key],
        counterText: '',
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      style: TextStyle(letterSpacing: spacing),
    );
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            Text(
              "Only what's needed to track it.",
              style: TextStyle(fontSize: 13, color: p.muted),
            ),
            const SizedBox(height: 12),
            field(
              'name',
              'Card name',
              _name,
              maxLength: 60,
              hint: 'e.g. Axis Ace',
            ),
            const SizedBox(height: 12),
            Text('Network', style: TextStyle(fontSize: 13, color: p.muted)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (final n in networks)
                  ChoiceChip(
                    label: Text(n),
                    selected: _network == n,
                    showCheckmark: false,
                    shape: const StadiumBorder(),
                    selectedColor: p.ink,
                    labelStyle: TextStyle(
                      color: _network == n ? p.accentOn : p.ink,
                      fontWeight: FontWeight.w600,
                    ),
                    onSelected: (_) => setState(() => _network = n),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: field(
                    'last4',
                    'Last 4 digits',
                    _last4,
                    type: TextInputType.number,
                    maxLength: 4,
                    spacing: 3,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: field(
                    'limit',
                    'Credit limit',
                    _limit,
                    type: const TextInputType.numberWithOptions(decimal: true),
                    hint: '₹1,00,000',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: field(
                    'statementDay',
                    'Bill day',
                    _statement,
                    type: TextInputType.number,
                    maxLength: 2,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: field(
                    'dueDay',
                    'Due day',
                    _due,
                    type: TextInputType.number,
                    maxLength: 2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: p.tray,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lock_outline, size: 18, color: p.ink),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(_privacyNote, style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    key: const Key('save-card'),
                    onPressed: _save,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: Text(
                      widget.existing == null ? 'Add card' : 'Save card',
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
