import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../home_palette.dart';
import 'entrance.dart';

class _Action {
  const _Action(this.label, this.icon, this.route, {this.primary = false});
  final String label;
  final IconData icon;
  final String route;
  final bool primary;
}

/// The round shortcut buttons under the balance.
///
/// Transfer is the web client's third action, but the Flutter ledger has no
/// transfer transaction yet, so Accounts takes its place rather than offering
/// a button that cannot do what it says.
const _actions = [
  _Action(
    'Expense',
    Icons.remove_rounded,
    Routes.addTransaction,
    primary: true,
  ),
  _Action('Income', Icons.add_rounded, '${Routes.addTransaction}?type=income'),
  _Action('Accounts', Icons.account_balance_outlined, Routes.accounts),
  _Action('Import', Icons.file_download_outlined, Routes.bankImport),
];

class QuickActions extends StatelessWidget {
  const QuickActions({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _actions.length; i++)
          Expanded(
            child: Entrance(order: i, child: _ActionButton(_actions[i])),
          ),
      ],
    );
  }
}

class _ActionButton extends StatefulWidget {
  const _ActionButton(this.action);
  final _Action action;

  @override
  State<_ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<_ActionButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final a = widget.action;
    final palette = HomePalette.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      button: true,
      label: a.label,
      excludeSemantics: true,
      child: GestureDetector(
        onTapDown: (_) => setState(() => _down = true),
        onTapCancel: () => setState(() => _down = false),
        onTapUp: (_) => setState(() => _down = false),
        onTap: () => context.go(a.route),
        child: AnimatedScale(
          scale: _down ? 0.92 : 1,
          duration: const Duration(milliseconds: 120),
          child: Column(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: a.primary
                      ? palette.pill
                      : (dark ? const Color(0xFF222226) : Colors.white),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: dark ? 0.5 : 0.14),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                      spreadRadius: -6,
                    ),
                  ],
                ),
                child: Icon(
                  a.icon,
                  size: 22,
                  color: a.primary ? palette.pillInk : palette.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                a.label,
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: palette.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
