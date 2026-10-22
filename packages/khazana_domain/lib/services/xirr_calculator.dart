import 'dart:math' as math;

import 'package:decimal/decimal.dart';

/// A dated cash flow: negative = money out (investment), positive = money in.
class CashFlow {
  const CashFlow(this.date, this.amount);
  final DateTime date;
  final Decimal amount;
}

/// Computes XIRR (annualized money-weighted return) for irregular cash flows
/// (PRD §14). Pure Dart; bisection for robustness. Returns a fraction
/// (0.18 = 18%), or null if it can't converge / inputs are degenerate.
class XirrCalculator {
  const XirrCalculator();

  double? compute(List<CashFlow> flows) {
    if (flows.length < 2) return null;
    final hasPos = flows.any((f) => f.amount > Decimal.zero);
    final hasNeg = flows.any((f) => f.amount < Decimal.zero);
    if (!hasPos || !hasNeg) return null; // need inflow and outflow

    final t0 = flows.first.date;
    double npv(double rate) {
      var sum = 0.0;
      for (final f in flows) {
        final years = f.date.difference(t0).inDays / 365.0;
        sum += f.amount.toDouble() / math.pow(1 + rate, years);
      }
      return sum;
    }

    var low = -0.9999;
    var high = 10.0;
    var fLow = npv(low);
    var fHigh = npv(high);
    if (fLow.sign == fHigh.sign) return null; // no sign change in band

    for (var i = 0; i < 200; i++) {
      final mid = (low + high) / 2;
      final fMid = npv(mid);
      if (fMid.abs() < 1e-7) return mid;
      if (fMid.sign == fLow.sign) {
        low = mid;
        fLow = fMid;
      } else {
        high = mid;
        fHigh = fMid;
      }
    }
    return (low + high) / 2;
  }
}
