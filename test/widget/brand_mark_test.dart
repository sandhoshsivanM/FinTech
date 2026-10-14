import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:khazana/design_system/components/brand_mark.dart';

String _assetOf(WidgetTester t) {
  final image = t.widget<Image>(find.byType(Image));
  return ((image.image) as AssetImage).assetName;
}

void main() {
  testWidgets('light theme uses the standard mark', (t) async {
    await t.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: Brightness.light),
        home: const BrandMark(),
      ),
    );
    expect(_assetOf(t), BrandMark.lightAsset);
  });

  testWidgets('dark theme picks the dark asset', (t) async {
    await t.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: Brightness.dark),
        home: const BrandMark(),
      ),
    );
    expect(_assetOf(t), BrandMark.darkAsset);
  });
}
