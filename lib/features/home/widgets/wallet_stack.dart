import '../../../core/help/info_hint.dart';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_router.dart';
import '../../../core/utils/money_format.dart';
import '../../reports/providers/dashboard_providers.dart';
import '../home_palette.dart';
import '../home_providers.dart';

/// "My wallet": a deck of account cards. The front card sits on top with two
/// more fanned out behind it, scaled down. Swipe (or fling) the front card
/// sideways, or tap a dot, to bring another forward. The dots are real buttons,
/// so the deck works without a gesture.
class WalletStack extends ConsumerStatefulWidget {
  const WalletStack({super.key});

  @override
  ConsumerState<WalletStack> createState() => _WalletStackState();
}

class _WalletStackState extends ConsumerState<WalletStack> {
  int _front = 0;
  double _drag = 0;
  bool _dragging = false;

  /// Cards visible behind the front one.
  static const _depth = 2;

  /// Distance, in px, a card must travel before it counts as a swipe.
  static const _swipe = 60.0;

  /// Dark finishes per account type, like a real card: top-left to bottom-right.
  static const _finish = {
    WalletKind.bank: [Color(0xFF1E3A2F), Color(0xFF0F1F18), Color(0xFF0A120E)],
    WalletKind.cash: [Color(0xFF3A2F1C), Color(0xFF1F190F), Color(0xFF120E08)],
    WalletKind.creditCard: [
      Color(0xFF2A2547),
      Color(0xFF17142B),
      Color(0xFF0D0B1A),
    ],
  };
  static const _kindIcon = {
    WalletKind.bank: Icons.account_balance_outlined,
    WalletKind.cash: Icons.payments_outlined,
    WalletKind.creditCard: Icons.credit_card,
  };
  static const _kindLabel = {
    WalletKind.bank: 'Bank account',
    WalletKind.cash: 'Cash',
    WalletKind.creditCard: 'Credit card',
  };

  @override
  Widget build(BuildContext context) {
    final cards = ref.watch(walletCardsProvider);
    final ghost = ref.watch(ghostModeProvider);
    if (cards == null || cards.isEmpty) return const SizedBox.shrink();
    final n = cards.length;
    final front = _front % n;
    final text = Theme.of(context).textTheme;
    final p = HomePalette.of(context);
    final reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final dur = reduce ? Duration.zero : const Duration(milliseconds: 380);

    return HomeGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: InfoHint.titled(
                  Text(
                    'My wallet',
                    style: text.titleMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  'dashboard.myWallet',
                ),
              ),
              TextButton(
                onPressed: () => context.go(Routes.accounts),
                child: const Text('Manage'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // ISO ID-1 proportions (85.6 x 54 mm). The right margin leaves room
          // for the cards behind to fan out.
          Padding(
            padding: const EdgeInsets.only(right: 28),
            child: AspectRatio(
              aspectRatio: 1.586,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Paint furthest first so the front card ends up on top.
                  for (var d = math.min(_depth, n - 1); d >= 0; d--)
                    _card(cards, (front + d) % n, d, ghost, dur),
                ],
              ),
            ),
          ),
          if (n > 1) ...[
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < n; i++)
                  Semantics(
                    button: true,
                    selected: i == front,
                    label: cards[i].name,
                    excludeSemantics: true,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => setState(() => _front = i),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 3,
                          vertical: 10,
                        ),
                        child: AnimatedContainer(
                          duration: dur,
                          curve: Curves.easeOutCubic,
                          width: i == front ? 20 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: i == front ? p.blue : p.line,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _card(
    List<WalletCardData> cards,
    int index,
    int depth,
    bool ghost,
    Duration dur,
  ) {
    final n = cards.length;
    final isFront = depth == 0;
    final c = cards[index];
    final dx = depth * 13.0 + (isFront && _dragging ? _drag * 0.8 : 0);
    final scale = 1 - depth * 0.08;
    final face = AnimatedContainer(
      key: ValueKey(c.id),
      duration: _dragging ? Duration.zero : dur,
      curve: Curves.easeOutCubic,
      transformAlignment: Alignment.centerRight,
      transform: Matrix4.translationValues(dx, 0, 0)
        ..scaleByDouble(scale, scale, 1, 1),
      child: AnimatedOpacity(
        duration: dur,
        opacity: 1 - depth * 0.2,
        child: _Face(
          data: c,
          ghost: ghost,
          icon: _kindIcon[c.kind]!,
          label: _kindLabel[c.kind]!,
          colors: _finish[c.kind]!,
        ),
      ),
    );
    if (!isFront) {
      return Positioned.fill(
        key: ValueKey(c.id),
        child: ExcludeSemantics(child: face),
      );
    }
    return Positioned.fill(
      key: ValueKey(c.id),
      child: Semantics(
        label: c.name,
        child: GestureDetector(
          onHorizontalDragStart: n > 1
              ? (_) => setState(() => _dragging = true)
              : null,
          onHorizontalDragUpdate: n > 1
              ? (d) => setState(() => _drag += d.delta.dx)
              : null,
          onHorizontalDragEnd: n > 1
              ? (e) {
                  final v = e.primaryVelocity ?? 0;
                  final dir = (_drag < -_swipe || v < -600)
                      ? 1
                      : (_drag > _swipe || v > 600)
                      ? -1
                      : 0;
                  setState(() {
                    _dragging = false;
                    _drag = 0;
                    if (dir != 0) _front = ((_front % n) + dir + n) % n;
                  });
                }
              : null,
          onHorizontalDragCancel: () => setState(() {
            _dragging = false;
            _drag = 0;
          }),
          child: face,
        ),
      ),
    );
  }
}

class _Face extends StatelessWidget {
  const _Face({
    required this.data,
    required this.ghost,
    required this.icon,
    required this.label,
    required this.colors,
  });

  final WalletCardData data;
  final bool ghost;
  final IconData icon;
  final String label;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: colors,
          stops: const [0, 0.55, 1],
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x99000000),
            blurRadius: 30,
            offset: Offset(0, 18),
            spreadRadius: -16,
          ),
        ],
      ),
      foregroundDecoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        // A faint diagonal sheen, like the lacquer on a real card.
        gradient: const LinearGradient(
          begin: Alignment(-1, -0.6),
          end: Alignment(1, 0.6),
          colors: [Color(0x00FFFFFF), Color(0x14FFFFFF), Color(0x00FFFFFF)],
          stops: [0.38, 0.5, 0.62],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      data.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(icon, size: 12, color: const Color(0x99FFFFFF)),
                        const SizedBox(width: 5),
                        Text(
                          data.owed ? 'Outstanding' : label,
                          style: const TextStyle(
                            color: Color(0x99FFFFFF),
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const RotatedBox(
                quarterTurns: 1,
                child: Icon(Icons.wifi, size: 20, color: Color(0xB3FFFFFF)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const _Chip(),
          const Spacer(),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              ghost ? '••••••' : Money.format(data.balance),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.5,
                height: 1.1,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: 4),
          // Masked on purpose: the vault holds no card numbers.
          const Text(
            '•••• •••• ••••',
            style: TextStyle(
              color: Color(0x8CFFFFFF),
              fontSize: 12,
              letterSpacing: 2.6,
            ),
          ),
        ],
      ),
    );
  }
}

/// A gold EMV contact chip, drawn rather than imported.
class _Chip extends StatelessWidget {
  const _Chip();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 28,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFF2D98C), Color(0xFFC9A24A), Color(0xFFE8CB78)],
        ),
        border: Border.all(color: const Color(0x40000000), width: 0.8),
      ),
      child: CustomPaint(painter: _ChipLines()),
    );
  }
}

class _ChipLines extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final p = Paint()
      ..color = const Color(0x73503710)
      ..strokeWidth = 0.8
      ..style = PaintingStyle.stroke;
    canvas
      ..drawLine(
        Offset(0, s.height * 0.33),
        Offset(s.width * 0.3, s.height * 0.33),
        p,
      )
      ..drawLine(
        Offset(0, s.height * 0.66),
        Offset(s.width * 0.3, s.height * 0.66),
        p,
      )
      ..drawLine(
        Offset(s.width * 0.7, s.height * 0.33),
        Offset(s.width, s.height * 0.33),
        p,
      )
      ..drawLine(
        Offset(s.width * 0.7, s.height * 0.66),
        Offset(s.width, s.height * 0.66),
        p,
      )
      ..drawLine(Offset(s.width * 0.3, 0), Offset(s.width * 0.3, s.height), p)
      ..drawLine(Offset(s.width * 0.7, 0), Offset(s.width * 0.7, s.height), p)
      ..drawLine(
        Offset(s.width * 0.3, s.height / 2),
        Offset(s.width * 0.7, s.height / 2),
        p,
      );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
