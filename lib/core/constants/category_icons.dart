import 'package:flutter/material.dart';

import 'default_categories.dart';

/// Resolves a stored category icon codepoint back to a **constant** [IconData].
///
/// Categories persist their icon as a bare `int` codepoint
/// (`tables.dart` → `iconCodepoint`), and three screens used to turn that back
/// into an icon with `IconData(codepoint, fontFamily: 'MaterialIcons')`. That
/// is a non-constant `IconData`, and Flutter's icon tree-shaker gives up the
/// moment it sees one — it cannot know which glyphs an arbitrary runtime
/// integer might name, so it must keep all of them or none.
///
/// The result was that every release build failed outright with
/// "Avoid non-constant invocations of IconData", and the documented workaround
/// was to pass `--no-tree-shake-icons` on every build forever: about a megabyte
/// of unused font in the binary, and a flag that, when someone eventually
/// forgot it, failed the release rather than the pull request.
///
/// The set of icons a category can have is not arbitrary — it is exactly
/// [kDefaultCategories]. Mapping the codepoint back to that fixed set gives the
/// tree-shaker constant references it can follow, so it keeps precisely these
/// eleven glyphs and drops the rest.
///
/// The map is built at runtime rather than declared `const` because
/// `Icons.restaurant.codePoint` is a field read, not a constant expression, and
/// cannot be a `const` map key. That does not matter: what tree-shaking needs
/// is for the *values* to be constant icon references, and they are.
final Map<int, IconData> _byCodepoint = {
  for (final c in kDefaultCategories) c.icon.codePoint: c.icon,
};

/// The icon for a stored [codepoint], or [fallback] when it is null or names a
/// glyph outside the known set.
///
/// An unknown codepoint is possible — a vault seeded by an older build whose
/// default categories differed. Falling back beats rendering a missing-glyph
/// box, and beats crashing.
IconData categoryIcon(int? codepoint, {IconData fallback = Icons.category}) {
  if (codepoint == null) return fallback;
  return _byCodepoint[codepoint] ?? fallback;
}
