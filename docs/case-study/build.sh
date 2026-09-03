#!/usr/bin/env bash
# Regenerate the technical case-study PDF.
#   ./docs/case-study/build.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
weasyprint "$here/index.html" "$here/../Khazana_Technical_Case_Study.pdf"
echo "wrote docs/Khazana_Technical_Case_Study.pdf"
