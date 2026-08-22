#!/usr/bin/env bash
#
# Builds the Flutter macOS app and packages it as a DMG in dist/.
#
# Plain `hdiutil`, no `create-dmg` dependency: the fancier tool wants a
# background image and an AppleScript pass to place icons, and neither survives
# an unattended CI run reliably. What matters for a drag-to-install DMG is the
# /Applications symlink, and that is one line.
#
#   tool/package_macos_dmg.sh
#
# Signing comes from macos/Runner/Configs/Signing.xcconfig, which defaults to
# ad-hoc. A DMG built without credentials WILL be refused by Gatekeeper on
# another Mac — that is stated at the end of the run rather than left to be
# discovered by whoever you sent it to.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(sed -n 's/^version: \([0-9.]*\)+.*$/\1/p' pubspec.yaml)
APP="build/macos/Build/Products/Release/Khazana.app"
OUT="dist/Khazana-${VERSION}-macos.dmg"
STAGE="$(mktemp -d)/Khazana"

echo "==> Building Khazana ${VERSION} (macOS, release)"
flutter build macos --release

[[ -d "$APP" ]] || { echo "Build produced no app at $APP" >&2; exit 1; }

# A macOS app can build cleanly and still be dead on arrival: hardened runtime
# turns on library validation, and a team-id mismatch between the app and its
# embedded frameworks aborts the process in dyld before any of our code runs.
# That is invisible to the build and invisible to `codesign --verify`, so it is
# checked here — packaging a DMG that cannot launch is worse than not packaging
# one.
echo "==> Launch check"
if ! "$APP/Contents/MacOS/Khazana" --version >/dev/null 2>/tmp/khazana-launch.err; then
  # `--version` is not a flag Flutter handles, so a *healthy* app opens a window
  # instead of exiting. Only a dyld/codesign abort is treated as failure.
  if grep -q "Library not loaded\|code signature\|different Team IDs" /tmp/khazana-launch.err; then
    echo >&2
    echo "The built app cannot launch:" >&2
    sed 's/^/    /' /tmp/khazana-launch.err | head -5 >&2
    echo >&2
    echo "    Almost always a signing mismatch: hardened runtime is on while the" >&2
    echo "    app and its embedded frameworks carry different team IDs. See" >&2
    echo "    macos/Runner/Configs/Signing.xcconfig." >&2
    exit 1
  fi
fi
pkill -x Khazana 2>/dev/null || true

echo "==> Staging"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
# The whole reason a DMG is nicer than a zip: drag the icon onto the alias.
ln -s /Applications "$STAGE/Applications"

echo "==> Packaging"
mkdir -p dist
rm -f "$OUT"
hdiutil create \
  -volname "Khazana ${VERSION}" \
  -srcfolder "$STAGE" \
  -ov -format UDZO \
  "$OUT" >/dev/null

rm -rf "$(dirname "$STAGE")"

echo
echo "==> $OUT ($(du -h "$OUT" | cut -f1))"
echo

# Report what this DMG actually is, rather than implying it is shippable.
sig=$(codesign -dv --verbose=2 "$APP" 2>&1 | sed -n 's/^Signature=//p')
runtime=$(codesign -dv --verbose=4 "$APP" 2>&1 | grep -c 'runtime' || true)
echo "    signature:        ${sig:-none}"
echo "    hardened runtime: $([[ "$runtime" -gt 0 ]] && echo yes || echo NO)"

if [[ "$sig" == "adhoc" || -z "$sig" ]]; then
  cat <<'WARN'

    NOT DISTRIBUTABLE. This build is ad-hoc signed, so Gatekeeper on any other
    Mac will refuse to open it ("Khazana is damaged and can't be opened").
    Fine for testing on this machine; do not send it to anyone.

    To produce a real one: create macos/Runner/Configs/Signing.local.xcconfig
    with a Developer ID identity and team, re-run this script, then notarize:

      xcrun notarytool submit dist/Khazana-*-macos.dmg \
        --apple-id <you> --team-id <TEAM> --password <app-specific> --wait
      xcrun stapler staple dist/Khazana-*-macos.dmg
WARN
fi
