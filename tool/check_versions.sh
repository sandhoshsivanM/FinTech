#!/usr/bin/env bash
#
# Asserts that every place the product states its own version agrees.
#
# There are five, and they drifted once already: pubspec said 1.0.0, the web app
# and the Tauri config said 0.1.0, and the store still stamped 1.0.0 into backup
# headers. Because .github/workflows/release.yml reads the Tauri value, a tagged
# v1.0.0 would have shipped a GitHub release titled "Khazana 0.1.0" full of
# artifacts that called themselves 1.0.0 — and the backup header version is a
# compatibility gate, so getting it wrong is not only cosmetic.
#
# Run from the repo root:  tool/check_versions.sh
set -euo pipefail

cd "$(dirname "$0")/.."

fail=0
note() { printf '  %-46s %s\n' "$1" "$2"; }

# pubspec is the source of truth: it is the one the app stores actually see.
pubspec=$(sed -n 's/^version: \([0-9.]*\)+.*$/\1/p' pubspec.yaml)
if [[ -z "$pubspec" ]]; then
  echo "check_versions: could not parse 'version:' from pubspec.yaml" >&2
  exit 1
fi

branding=$(sed -n "s/^const kAppVersion = '\(.*\)';$/\1/p" lib/core/branding.dart)
pkg=$(node -p "require('./webapp/package.json').version")
tauri=$(node -p "require('./webapp/src-tauri/tauri.conf.json').version")
# First `version = "..."` in the file, i.e. the [package] one — later sections
# carry dependency versions that must not be picked up.
cargo=$(grep -m1 '^version = ' webapp/src-tauri/Cargo.toml | sed 's/^version = "\(.*\)"$/\1/')
store=$(sed -n "s/^const APP_VERSION = '\(.*\)';$/\1/p" webapp/src/lib/store.ts)

echo "Expected version (pubspec.yaml): $pubspec"
for pair in \
  "lib/core/branding.dart:$branding" \
  "webapp/package.json:$pkg" \
  "webapp/src-tauri/tauri.conf.json:$tauri" \
  "webapp/src-tauri/Cargo.toml:$cargo" \
  "webapp/src/lib/store.ts:$store"
do
  file=${pair%%:*}
  got=${pair#*:}
  if [[ "$got" == "$pubspec" ]]; then
    note "$file" "$got  ok"
  else
    note "$file" "$got  MISMATCH (expected $pubspec)"
    fail=1
  fi
done

# The backup header stores three separate bytes rather than a string, so they
# are a fourth way to say the same thing and can drift on their own.
IFS=. read -r major minor patch <<<"$pubspec"
for part in "kAppVersionMajor:$major" "kAppVersionMinor:$minor" "kAppVersionPatch:$patch"; do
  name=${part%%:*}
  want=${part#*:}
  got=$(sed -n "s/^const $name = \([0-9]*\);$/\1/p" lib/core/branding.dart)
  if [[ "$got" != "$want" ]]; then
    note "branding.dart $name" "$got  MISMATCH (expected $want)"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo
  echo "Versions disagree. Update them all, then re-run." >&2
  exit 1
fi

echo "All version declarations agree."
