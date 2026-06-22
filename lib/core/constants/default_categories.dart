import 'package:flutter/material.dart';

/// Seed categories for a new vault (India personal-finance defaults).
/// `(name, icon)` — income categories are flagged for the UI by convention.
const List<({String name, IconData icon})> kDefaultCategories = [
  (name: 'Food', icon: Icons.restaurant),
  (name: 'Transport', icon: Icons.directions_bus),
  (name: 'Rent', icon: Icons.home),
  (name: 'Utilities', icon: Icons.bolt),
  (name: 'Shopping', icon: Icons.shopping_bag),
  (name: 'Health', icon: Icons.local_hospital),
  (name: 'Entertainment', icon: Icons.movie),
  (name: 'EMI', icon: Icons.account_balance),
  (name: 'Salary', icon: Icons.payments),
  (name: 'Investment', icon: Icons.trending_up),
  (name: 'Other', icon: Icons.category),
];
