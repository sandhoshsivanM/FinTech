#!/usr/bin/env bash
# Build the Khazana v2 technical design PDF.
#
#   ./docs/v2-design/build.sh
#
# One source file, one artefact: index.html → docs/Khazana_v2_Technical_Design.pdf.
# Same toolchain as docs/case-study (WeasyPrint), so nothing new to install.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
weasyprint "$here/index.html" "$here/../Khazana_v2_Technical_Design.pdf"
echo "wrote docs/Khazana_v2_Technical_Design.pdf"
