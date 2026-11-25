import 'package:flutter/material.dart';
import 'package:khazana_domain/services/skyline.dart';

import '../../reports/widgets/skyline_panels.dart';
import '../home_palette.dart';

/// Spending per day over the last 26 weeks, as a 3D skyline. Sits under the
/// last-7-days card: that one is the week, this is the shape of the half year.
class SpendSkylineCard extends StatelessWidget {
  const SpendSkylineCard({super.key});

  @override
  Widget build(BuildContext context) {
    final p = HomePalette.of(context);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return HomeGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Spend skyline',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: p.ink,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Every day of the last 26 weeks. Taller and deeper means more spent.',
            style: TextStyle(fontSize: 12, color: p.muted),
          ),
          const SizedBox(height: 14),
          SpendSkylinePanel(
            range: lastWeeks(today, 26),
            today: today,
            narrowWeeks: 13,
            card: p.group,
          ),
        ],
      ),
    );
  }
}
