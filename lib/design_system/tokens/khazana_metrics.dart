/// Spacing and radii. The Dart mirror of the web token modules.
abstract final class KhazanaSpace {
  /// 8px base scale. Nothing should use an off-scale value.
  static const double x2 = 8, x3 = 12, x4 = 16, x5 = 20;
  static const double x8 = 32, x10 = 40, x12 = 48, x16 = 64;
}

/// Prescribed per component: a button is tighter than a card, a card is
/// tighter than a modal. "Everything is a giant rounded rectangle" is the
/// generic look this system avoids.
abstract final class KhazanaRadius {
  static const double input = 10;
  static const double button = 9;
  static const double card = 14;
  static const double panel = 16;
  static const double modal = 18;
  static const double pill = 999;
}
