// Dropdown menus must be opaque.
//
// `canvasColor` is transparent in AppTheme, and DropdownButton paints its popup
// with canvasColor unless it is given `dropdownColor`. A tester's first report
// from the Play closed test was the notification time picker opening as a
// see-through panel with its hours printed over the settings rows behind it.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/core/theme/app_theme.dart';

final _dropdown = RegExp(r'\bDropdownButton(FormField)?<[^>]*>\(');

void main() {
  test('every DropdownButton in lib/ passes an opaque dropdownColor', () {
    final offenders = <String>[];
    final files = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'));

    for (final file in files) {
      final src = file.readAsStringSync();
      for (final m in _dropdown.allMatches(src)) {
        // The argument list opened by this constructor call.
        var depth = 0;
        var end = m.end - 1;
        for (var i = m.end - 1; i < src.length; i++) {
          final c = src[i];
          if (c == '(') depth++;
          if (c == ')' && --depth == 0) {
            end = i;
            break;
          }
        }
        final args = src.substring(m.end, end);
        if (!args.contains('dropdownColor: AppTheme.menuSurface(context)')) {
          final line = '\n'.allMatches(src.substring(0, m.start)).length + 1;
          offenders.add('${file.path}:$line');
        }
      }
    }

    expect(
      offenders,
      isEmpty,
      reason:
          'Add `dropdownColor: AppTheme.menuSurface(context)` — without it '
          'the menu inherits the transparent canvasColor and is see-through.',
    );
  });

  for (final theme in [AppTheme.light, AppTheme.dark]) {
    testWidgets('open menu is painted opaque (${theme.brightness.name})', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: DropdownButton<int>(
                  value: 9,
                  dropdownColor: AppTheme.menuSurface(context),
                  items: [
                    for (var h = 0; h < 24; h++)
                      DropdownMenuItem(value: h, child: Text('$h:00')),
                  ],
                  onChanged: (_) {},
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('9:00'));
      await tester.pumpAndSettle();

      // The menu background is drawn by a (private) _DropdownMenuPainter on a
      // CustomPaint above the items, with `dropdownColor ?? canvasColor`.
      final menuColors = tester
          .widgetList<CustomPaint>(
            find.ancestor(
              of: find.text('10:00').last,
              matching: find.byType(CustomPaint),
            ),
          )
          .map((p) => p.painter)
          .where((p) => p.runtimeType.toString() == '_DropdownMenuPainter')
          .map((p) => (p as dynamic).color as Color)
          .toList();
      expect(theme.canvasColor.a, 0, reason: 'precondition: canvas is clear');
      expect(menuColors, hasLength(1));
      expect(menuColors.single.a, 1.0, reason: 'menu must be opaque');
    });
  }
}
