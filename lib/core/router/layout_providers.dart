import 'package:flutter_riverpod/flutter_riverpod.dart';

/// When true, the global mobile-first width cap is relaxed so a screen can use a
/// multi-panel desktop layout (PRD §10 adaptive layout). Screens opt in on mount
/// and opt out on dispose. Default keeps the app mobile-first.
final wideLayoutProvider = StateProvider<bool>((ref) => false);
