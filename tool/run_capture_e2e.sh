#!/usr/bin/env bash
# Runs integration_test/capture_e2e_test.dart on an Android emulator: the
# sideload build, the real notification listener and the real SMS inbox.
#
#   tool/run_capture_e2e.sh [device-id]     (default: emulator-5554)
#
# Seeds the emulator's SMS inbox with one bank SMS and one personal SMS, then
# grants what a user would grant by hand (notification access and SMS can't be
# granted from inside the app). `flutter test` installs a fresh build and
# uninstalls it afterwards, so the grants are applied once the package appears;
# the test waits for them. Emulator only: `adb emu` does not exist on a phone.
set -euo pipefail
device="${1:-emulator-5554}"
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb -s $device"
pkg=com.khazana.app.sideload

today=$(date +%d-%m-%y)
$adb emu sms send VM-HDFCBK "Rs 499.00 debited from a/c XX1234 at SMS E2E STORE on $today. UPI Ref 412345678999."
# Same shape, but from a phone number: Android-side code must drop it.
$adb emu sms send 9876543210 "Rs 100.00 debited from a/c XX1234 at PERSONAL SENDER on $today."

$adb uninstall $pkg >/dev/null 2>&1 || true
flutter test integration_test/capture_e2e_test.dart --flavor sideload -d "$device" &
test_pid=$!

until $adb shell pm path $pkg 2>/dev/null | grep -q package:; do
  kill -0 $test_pid 2>/dev/null || break
  sleep 1
done
$adb shell pm grant $pkg android.permission.RECEIVE_SMS
$adb shell pm grant $pkg android.permission.READ_SMS
$adb shell pm grant $pkg android.permission.POST_NOTIFICATIONS
$adb shell cmd notification allow_listener $pkg/com.khazana.app.KhazanaNotificationListener

wait $test_pid
