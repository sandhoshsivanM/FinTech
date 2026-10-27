#!/usr/bin/env bash
# Fails when contracts/openapi/ is out of date with the code. Run
# tools/generate-openapi.sh and commit the result to fix.
set -euo pipefail
cd "$(dirname "$0")/.."
tools/generate-openapi.sh
if ! git diff --exit-code -- ../contracts/openapi || [ -n "$(git ls-files --others --exclude-standard ../contracts/openapi)" ]; then
  echo "OpenAPI drift: run backend/tools/generate-openapi.sh and commit contracts/openapi/." >&2
  exit 1
fi
echo "OpenAPI specs are up to date."
