/// Pure-Dart spending/income category entity (PRD §7 budgets reference categories).
class Category {
  const Category({
    required this.id,
    required this.vaultId,
    required this.name,
    this.iconCodepoint,
  });

  final String id;
  final String vaultId;
  final String name;
  final int? iconCodepoint;
}
