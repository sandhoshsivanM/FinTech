// Twin of webapp/src/domain/notificationScheduler.test.ts. Both load
// notification_cases.json and must agree on every value.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:khazana/domain/services/notification_scheduler.dart';

const _fixturePath = 'test/fixtures/notification_cases.json';
const _webFixturePath = 'webapp/src/domain/__fixtures__/notification_cases.json';

int _ms(String iso) => DateTime.parse(iso).millisecondsSinceEpoch;

/// The subset of a [PlannedNotification] the fixture pins. Compared as a map so
/// a failure names the field rather than dumping two opaque objects.
Map<String, dynamic> _compare(PlannedNotification n) => {
      'dedupeKey': n.dedupeKey,
      'fireAt': n.fireAt,
      'category': n.category.key,
      'title': n.title,
      'body': n.body,
      'deepLink': n.deepLink,
    };

Map<String, dynamic> _expected(Map<String, dynamic> e) => {
      'dedupeKey': e['dedupeKey'],
      'fireAt': _ms(e['fireAt'] as String),
      'category': e['category'],
      'title': e['title'],
      'body': e['body'],
      'deepLink': e['deepLink'],
    };

void main() {
  late Map<String, dynamic> fixture;

  setUpAll(() {
    fixture =
        jsonDecode(File(_fixturePath).readAsStringSync()) as Map<String, dynamic>;
  });

  NotifyPrefs prefsFor(Map<String, dynamic>? overrides) {
    final merged = <String, dynamic>{
      ...(fixture['basePrefs'] as Map).cast<String, dynamic>(),
      ...?overrides,
    };
    return NotifyPrefs.fromJson(merged);
  }

  NotificationPlanInput inputFrom(Map<String, dynamic> c) {
    final routes = (fixture['routes'] as Map).cast<String, dynamic>();
    return NotificationPlanInput(
      now: _ms(c['now'] as String),
      tzOffsetMinutes: c['tzOffsetMinutes'] as int,
      routes: NotifyRoutes(
        budget: routes['budget'] as String,
        dashboard: routes['dashboard'] as String,
      ),
      prefs: prefsFor((c['prefs'] as Map?)?.cast<String, dynamic>()),
      dueEvents: [
        for (final e in (c['dueEvents'] as List? ?? const []))
          DueEvent(
            id: e['id'] as String,
            category: NotifyCategory.fromKey(e['category'] as String),
            label: e['label'] as String,
            dueAt: _ms(e['dueAt'] as String),
            deepLink: e['deepLink'] as String,
            amountText: e['amountText'] as String?,
          ),
      ],
      budgets: [
        for (final b in (c['budgets'] as List? ?? const []))
          BudgetFact(
            categoryId: b['categoryId'] as String,
            categoryName: b['categoryName'] as String,
            thresholdPct: b['thresholdPct'] as int,
            spentPct: b['spentPct'] as int,
            period: b['period'] as String,
            amountText: b['amountText'] as String?,
          ),
      ],
      marketAlerts: [
        for (final m in (c['marketAlerts'] as List? ?? const []))
          PlannedNotification(
            dedupeKey: m['dedupeKey'] as String,
            fireAt: _ms(m['fireAt'] as String),
            category: NotifyCategory.fromKey(m['category'] as String),
            title: m['title'] as String,
            body: m['body'] as String,
            deepLink: m['deepLink'] as String?,
          ),
      ],
      deliveries: {
        for (final e in ((c['deliveries'] as Map?) ?? const {}).entries)
          e.key as String: _ms(e.value as String),
      },
      maxPending: c['maxPending'] as int? ?? 200,
    );
  }

  group('stableId', () {
    test('matches the values pinned in the fixture', () {
      // Pinned as literals rather than recomputed: the point is that these
      // numbers are identical in TypeScript and unchanged next year. An alarm
      // the OS holds under one id cannot be cancelled under another.
      final pinned = (fixture['stableIds'] as Map).cast<String, dynamic>();
      for (final e in pinned.entries) {
        if (e.key == '_comment') continue;
        expect(stableId(e.key), e.value, reason: 'stableId("${e.key}")');
      }
    });

    test('always lands in the positive-int range', () {
      for (var i = 0; i < 2000; i++) {
        final id = stableId('bill:rule-$i:${20000 + i}');
        expect(id, greaterThanOrEqualTo(0));
        expect(id, lessThanOrEqualTo(0x7FFFFFFF));
      }
    });

    test('separates keys that differ only in their tail', () {
      expect(stableId('bill:r1:20686'), isNot(stableId('bill:r1:20687')));
      expect(stableId('renewal:i1:20711:14'),
          isNot(stableId('renewal:i1:20711:30')));
    });
  });

  group('local time helpers', () {
    test('round-trips a wall clock through the epoch', () {
      for (final tz in [330, 0, -300, -720, 840]) {
        final at = localWallClock(20683, 9 * 60, tz);
        expect(localEpochDay(at, tz), 20683);
        expect(localMinuteOfDay(at, tz), 9 * 60);
      }
    });

    test('floors rather than truncates west of UTC', () {
      // The bug this guards: -1 ~/ 86400000 truncates toward zero, so an
      // instant just before the epoch lands on day 0 instead of day -1, and
      // every date computed west of UTC in the 1970s drifts by one.
      expect(localEpochDay(-1, 0), -1);
      expect(localMinuteOfDay(-1, 0), 1439);
    });

    test('names the local date, not the UTC one', () {
      // 2026-08-18T23:30+05:30 is still the 18th locally and in UTC…
      expect(localDateKey(_ms('2026-08-18T23:30:00+05:30'), 330), '2026-08-18');
      // …but 2026-08-19T02:00+05:30 is the 18th in UTC and must not say so.
      expect(localDateKey(_ms('2026-08-19T02:00:00+05:30'), 330), '2026-08-19');
    });
  });

  group('quiet hours', () {
    const prefs = NotifyPrefs(quietStartMin: 22 * 60, quietEndMin: 8 * 60);

    test('wraps midnight', () {
      expect(inQuietHours(23 * 60 + 30, prefs), isTrue);
      expect(inQuietHours(2 * 60, prefs), isTrue);
      expect(inQuietHours(22 * 60, prefs), isTrue); // inclusive start
      expect(inQuietHours(8 * 60, prefs), isFalse); // exclusive end
      expect(inQuietHours(12 * 60, prefs), isFalse);
    });

    test('handles a non-wrapping window', () {
      const day = NotifyPrefs(quietStartMin: 9 * 60, quietEndMin: 17 * 60);
      expect(inQuietHours(12 * 60, day), isTrue);
      expect(inQuietHours(2 * 60, day), isFalse);
    });

    test('only ever moves a fire time forward', () {
      for (final hour in [0, 3, 7, 8, 12, 21, 22, 23]) {
        final at = localWallClock(20683, hour * 60, 330);
        expect(shiftOutOfQuietHours(at, prefs, 330), greaterThanOrEqualTo(at));
      }
    });

    test('lands outside the window wherever it started', () {
      for (final hour in [0, 3, 7, 22, 23]) {
        final at = localWallClock(20683, hour * 60, 330);
        final moved = shiftOutOfQuietHours(at, prefs, 330);
        expect(inQuietHours(localMinuteOfDay(moved, 330), prefs), isFalse);
      }
    });
  });

  group('suppressed', () {
    final now = _ms('2026-08-18T10:00:00+05:30');
    const hour = 3600 * 1000;

    test('is false for a key that has never fired', () {
      expect(suppressed('k', const {}, 24, now), isFalse);
    });

    test('is true inside the cooldown and false outside it', () {
      expect(suppressed('k', {'k': now - 23 * hour}, 24, now), isTrue);
      expect(suppressed('k', {'k': now - 25 * hour}, 24, now), isFalse);
    });

    test('treats a zero cooldown as no cooldown', () {
      expect(suppressed('k', {'k': now}, 0, now), isFalse);
    });
  });

  group('NotifyPrefs JSON', () {
    test('round-trips', () {
      const p = NotifyPrefs(
        enabled: true,
        categories: {NotifyCategory.bills, NotifyCategory.digest},
        quietStartMin: 60,
        quietEndMin: 400,
        reminderHour: 7,
        billsLeadDays: 1,
        renewalsLeadDays: 21,
        goalsLeadDays: 45,
        digestHour: null,
        cooldownHours: 12,
        hideAmounts: false,
      );
      final back = NotifyPrefs.fromJson(jsonDecode(jsonEncode(p.toJson())));
      expect(back.toJson(), p.toJson());
      expect(back.digestHour, isNull);
    });

    test('a half-written preference falls back per field, not wholesale', () {
      // An unreadable preference must never stop the app — the same reasoning
      // as ThemeModeNotifier's swallowed load.
      final p = NotifyPrefs.fromJson({'enabled': true, 'quietStartMin': 'nonsense'});
      expect(p.enabled, isTrue);
      expect(p.quietStartMin, const NotifyPrefs().quietStartMin);
    });
  });

  group('planNotifications — shared fixture', () {
    test('the two copies of the fixture are byte-identical', () {
      // Vitest cannot import from outside webapp/, so the file is duplicated
      // rather than symlinked. Duplicated files drift; this is what stops it.
      // If this fails, copy test/fixtures/notification_cases.json over
      // webapp/src/domain/__fixtures__/notification_cases.json.
      expect(File(_webFixturePath).readAsBytesSync(),
          File(_fixturePath).readAsBytesSync(),
          reason: 'the Dart and TypeScript suites are no longer asserting '
              'against the same cases, so the parity contract is not being '
              'checked');
    });

    test('every fixture case', () {
      for (final raw in fixture['cases'] as List) {
        final c = (raw as Map).cast<String, dynamic>();
        final plan = planNotifications(inputFrom(c));
        final e = (c['expect'] as Map).cast<String, dynamic>();
        final name = c['name'];

        List<Map<String, dynamic>> want(String k) => [
              for (final x in e[k] as List)
                _expected((x as Map).cast<String, dynamic>()),
            ];

        expect(plan.immediate.map(_compare).toList(), want('immediate'),
            reason: '$name → immediate');
        expect(plan.scheduled.map(_compare).toList(), want('scheduled'),
            reason: '$name → scheduled');
        expect(plan.missed.map(_compare).toList(), want('missed'),
            reason: '$name → missed');
        expect(plan.truncated, e['truncated'], reason: '$name → truncated');
      }
    });

    test('every case is deterministic', () {
      // A planner whose output depends on map iteration order or an ambient
      // clock would pass once and fail in CI.
      for (final raw in fixture['cases'] as List) {
        final c = (raw as Map).cast<String, dynamic>();
        final a = planNotifications(inputFrom(c));
        final b = planNotifications(inputFrom(c));
        expect(a.scheduled.map(_compare).toList(),
            b.scheduled.map(_compare).toList());
        expect(a.immediate.map(_compare).toList(),
            b.immediate.map(_compare).toList());
        expect(a.missed.map(_compare).toList(), b.missed.map(_compare).toList());
      }
    });

    test('no planned notification ever carries a duplicate id', () {
      for (final raw in fixture['cases'] as List) {
        final c = (raw as Map).cast<String, dynamic>();
        final plan = planNotifications(inputFrom(c));
        final all = [...plan.immediate, ...plan.scheduled, ...plan.missed];
        final ids = all.map((n) => n.id).toList();
        expect(ids.toSet().length, ids.length,
            reason: '${c['name']}: two notifications share an OS id');
      }
    });
  });
}
