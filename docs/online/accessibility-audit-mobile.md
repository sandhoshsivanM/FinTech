# Khazana Online mobile: accessibility audit

- **Scope:** `mobile-online/` (Flutter, `com.khazana.online`), every screen that exists today, and the screens the design requires but that are not built yet.
- **Date:** 2026-10-27. **Base:** `feature/safety-net-and-hardening` at 8f1de24. This is a **static audit**: the code was read, not run on a device or emulator. Nothing here was measured with a screen reader.
- **Standard:** WCAG 2.2 AA, applied to native mobile through Flutter's semantics tree, plus the platform guidance for TalkBack and VoiceOver.
- **Status of this document:** findings only. No code was changed, per the brief, because other agents are editing `mobile-online/`. Line numbers refer to the base commit and will drift.

## 1. Screens

| Screen | File | State today |
|---|---|---|
| Start (loading) | `lib/main.dart` (`_Start`) | Spinner while the session check runs |
| Sign-in | `lib/features/sign_in_screen.dart` | Two disabled "coming soon" buttons; a development sign-in (build flag only) |
| Home | `lib/features/home_screen.dart` | Device status line, three informational cards, Sign out |
| Pair, recovery phrase, devices, transactions, sync | not built | Required by the design (ADR 0005, 0006) |

The web app's accessibility work (`webapp-online`, PR for the a11y pass) is not automatically inherited. Flutter has its own semantics tree, so every item below is checked separately.

## 2. Findings

Severity: **High** blocks a user from doing something; **Medium** makes something hard or unclear; **Low** is polish; **Verify** is a likely pass that needs a measurement before it can be signed off.

| ID | Sev | WCAG 2.2 | Where | Finding | Fix |
|---|---|---|---|---|---|
| M-01 | High (dev and test builds) | 1.3.1, 3.3.2, 4.1.2 | `sign_in_screen.dart:68` | The development subject `TextField` has no `labelText` or `hintText`. TalkBack and VoiceOver announce an unnamed edit box. | `InputDecoration(labelText: 'Development subject', border: ...)`. |
| M-02 | High | 4.1.3 | `sign_in_screen.dart:77`, `home_screen.dart:72` | Errors and the device status line change on screen with no announcement. A screen reader user who taps Sign in hears nothing when the refusal arrives. | Wrap each in `Semantics(liveRegion: true, child: Text(...))`, or announce with `SemanticsService` on the platform's current API. |
| M-03 | Medium | 1.1.1, 4.1.2 | `main.dart:45` | The loading `CircularProgressIndicator` has no `semanticsLabel`. The first screen a user meets is silent. | `CircularProgressIndicator(semanticsLabel: 'Loading Khazana Online')`. |
| M-04 | Medium | 1.3.1 | `sign_in_screen.dart:53` | The "Khazana Online" headline is plain `Text`, not a heading. Headings cannot be used to jump around the screen. (The AppBar title on Home is already a header in Material.) | `Semantics(header: true, child: Text(...))`. |
| M-05 | Medium | 1.4.3 (Verify) | `main.dart:26-28`, `home_screen.dart:63`, `sign_in_screen.dart:47,77` | Text colours come from `ColorScheme.fromSeed(0xFF111214)`, not from a shared token set. The web contrast figures do not carry over, and there is no Dart counterpart of `tokens.css` (`packages/khazana_domain` exports no colours). Muted text and the error colour are unmeasured in both light and dark themes. | Add widget tests with `meetsGuideline(textContrastGuideline)` in light and dark. Where a pair fails, fix the scheme for that role, and add the same colours to a Dart token file so web and mobile agree. |
| M-06 | Medium | 1.4.4, 1.4.10 (Verify) | `home_screen.dart:76-79` | `ListTile` with `isThreeLine` and a two-line subtitle has no test at a large text scale. It may clip or overflow at 200%. | Widget test at `MediaQuery(textScaler: TextScaler.linear(2))`. Let the card grow, not clip. |
| M-07 | Low | 3.1.1, 3.3.2 | `home_screen.dart:78`, `home_screen.dart:35-41` | Users see developer wording: "Coming in the next slice." and "The server refused the request (401)." Plain language helps everyone, and the status code means nothing to most people. | Replace with user sentences, for example "Coming soon." and "Something went wrong on our side. Try again." Keep the code in logs only. |
| M-08 | Low | 2.5.8 (Verify) | `sign_in_screen.dart:61-63`, Sign out in `home_screen.dart:67` | Material buttons meet 48dp by default. No custom small targets exist today. | Guideline tests: `androidTapTargetGuideline`, `iOSTapTargetGuideline`, `labeledTapTargetGuideline`. |
| M-09 | Low | 3.1.2 | `main.dart` (`MaterialApp`) | No `locale` or `supportedLocales`. Speech engines use the device default, which may not match the user's English. | Set `locale: Locale('en', 'IN')` (or the reviewed choice), with `supportedLocales` to match. |
| M-10 | Info (pass) | 1.3.4 | `android/app/src/main/AndroidManifest.xml` (`configChanges` includes `orientation`), `ios/Runner/Info.plist` | No orientation lock on either platform. | None. Keep it that way. |
| M-11 | Info (pass) | 2.3.3 | `lib/` | No custom animations; Material transitions are used. | Confirm with the OS "Remove animations" setting on device (see section 4). |
| M-12 | Info | 2.5.1, 2.1.1 | `lib/` | No custom gestures. Everything is a standard widget, so switch control and keyboard access work by default. | Re-check when the pairing and transaction screens add gestures (swipe to delete, drag to reorder). Each one needs a button alternative. |

### Disabled sign-in buttons

`sign_in_screen.dart:61-63` shows two disabled buttons labelled "(coming soon)". Screen readers announce them as dimmed and not activatable. That is accurate, and the label explains why. It is still a dead end for a production user, so it is a launch item (see the launch checklist), not an accessibility defect.

## 3. Screens that do not exist yet: requirements to build in

These have no code today. Each needs an accessibility design before it is built.

1. **Pairing (ADR 0005).** The QR code is an image. Give it `Semantics(label: 'Pairing QR code. The same link is below.')` and always show the link as selectable text. Camera scanning needs a text alternative: paste the link.
2. **Recovery phrase (24 words).** Use one labelled field per word, or one field with a visible count ("7 of 24"). Allow paste: WCAG 3.3.8 (Accessible Authentication) accepts paste as one way to avoid a memory-only task, so never block it. Set `enableSuggestions: false` and `autocorrect: false` on the fields. Do not obscure the words, because the user must check what they typed.
3. **Biometric and PIN step-up (design section 14.3).** The `localizedReason` string is read aloud by the system prompt, so make it a full sentence. Always offer the PIN fallback, and never make biometrics the only route for a user who cannot use them.
4. **Amounts.** A figure like "₹1,24,500.00" is read out digit by digit by some voices. Give amounts a `Semantics(label:)` in words (for example "one lakh twenty-four thousand five hundred rupees"), or at least keep the currency code in the label.
5. **Lists of transactions.** Each row is one `Semantics` node with the date, merchant, amount, and sign ("money out", "money in"). Colour must not be the only sign.
6. **Screen capture blocking (design section 14.2, FLAG_SECURE).** This hides the screen from screenshots and the app switcher. It does not affect TalkBack or VoiceOver. Confirm that a blocked screen still has its labels, and that the user is not left unable to read a sensitive value they need.
7. **Sync status.** Announce only outcomes ("Synced", "Sync problem"), not every in-progress change. The web app does the same.

## 4. Manual test plan (not yet run)

Run on real devices where possible. The owner has an iPhone and no Android device, so Android runs on an emulator (API 34) and is marked as such.

| Check | How | Who |
|---|---|---|
| VoiceOver, sign-in and home | iPhone: Settings, Accessibility, VoiceOver. Swipe through every screen. Each control must have a name, a role and a state. | Owner, iPhone |
| TalkBack, sign-in and home | Android emulator: Settings, Accessibility, TalkBack. Same walk-through. | Owner, emulator |
| Largest text | iOS: Settings, Display and Text Size, Larger Text at the largest size. Android: Font size and Display size at maximum. | Owner |
| Reduce motion, bold text, increase contrast | iOS: Accessibility, Motion, Display. Android: Accessibility, Remove animations. | Owner |
| Automated guidelines | Add widget tests: `meetsGuideline(textContrastGuideline)`, `androidTapTargetGuideline`, `iOSTapTargetGuideline`, `labeledTapTargetGuideline`, both themes, scale 1.0 and 2.0. | Next mobile slice |
| Accessibility Scanner | Android: install from Play, run on each screen. | Owner, emulator |
| Accessibility Inspector | macOS: Xcode, Open Developer Tool, Accessibility Inspector, on the simulator or device. | Owner |

Record each result against the finding ID. A finding is closed only when the same check passes on the device, not only in a widget test.

## 5. Summary

- Five findings are High or Medium with a clear fix and a test to prove it (M-01 to M-04, and M-05 as a measurement). They are cheap to fix and should go in the next mobile slice.
- The three "Verify" items (M-05, M-06, M-08) cannot be decided from the code. They need the widget tests in section 4.
- The app is small, and most of its controls are Material defaults, which already carry labels and 48dp targets. The real risk is in the screens still to be built (section 3), so write those accessibility requirements into the design before the code.
