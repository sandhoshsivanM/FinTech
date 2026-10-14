import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/core/help/section_help.dart';
import 'package:khazana/core/help/section_help_data.dart';

void main() {
  test('every help entry has a non-empty title and body', () {
    expect(SectionHelp.all, isNotEmpty);
    SectionHelp.all.forEach((key, e) {
      expect(e.title.trim(), isNotEmpty, reason: key);
      expect(e.body.trim(), isNotEmpty, reason: key);
    });
  });

  test('carries the full web section set and glossary', () {
    expect(kWebSectionHelp.length, 106);
    expect(kGlossary.length, 37);
  });

  test('section, Flutter-only and glossary keys never collide', () {
    final total =
        kWebSectionHelp.length + kFlutterOnlyHelp.length + kGlossary.length;
    expect(SectionHelp.all.length, total);
  });

  test('glossary wording matches the web for the headline figures', () {
    expect(kGlossary['unrealisedPnl']!.title, 'Unrealised profit & loss');
    expect(kGlossary['xirr']!.title, 'XIRR');
    expect(kGlossary['utilisation']!.title, 'Utilisation');
    expect(kGlossary['savingsRate']!.title, 'Savings rate');
  });
}
