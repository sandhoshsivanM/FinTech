#!/usr/bin/env bash
# Build the technical case study, in both the versions it needs to exist in.
#
#   ./docs/case-study/build.sh
#
# Two audiences, two artefacts, one source file:
#
#   1. The PDF — the complete document, appendices included. This is the version
#      you attach to an application or hand to an interviewer. Nothing is
#      stripped, because the appendices are the parts you wrote for yourself.
#
#   2. site/case-study/ — the version that goes on the web, written straight
#      into the marketing site's deploy directory so one `netlify deploy --dir=site`
#      publishes the landing page and the case study together. Every section
#      marked data-audience="private" is removed: the LinkedIn drafts, the
#      website copy and the interview question bank. A recruiter who finds your
#      prepared answers is reading the wrong document, and the body of the case
#      study is the portfolio piece on its own.
#
# The stripping is done here rather than with CSS `display:none` on purpose —
# hidden text is still in the file, still copied, still indexed by search
# engines. It has to be absent, not invisible.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Full PDF.
weasyprint "$here/index.html" "$here/../Khazana_Technical_Case_Study.pdf"
echo "wrote docs/Khazana_Technical_Case_Study.pdf  (full, with appendices)"

# 2. Public web build, into the site's deploy directory.
out="$here/../../site/case-study"
mkdir -p "$out"
cp "$here/print.css" "$out/print.css"

python3 - "$here/index.html" "$out/index.html" <<'PY'
import re, sys

src, dest = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()

# Sections and list items carrying data-audience="private". The document's
# <section> elements do not nest, so a non-greedy match to the next closing tag
# is exact rather than merely convenient.
patterns = [
    r'<section data-audience="private">.*?</section>\s*',
    r'<li[^>]*data-audience="private"[^>]*>.*?</li>\s*',
]
for p in patterns:
    html, n = re.subn(p, "", html, flags=re.S)
    print(f"  stripped {n} × {p.split(' ')[0].lstrip('<')}", file=sys.stderr)

# Every comment in this document is an authoring note — section dividers and
# notes-to-self about what the build does. None of it is for a reader, and one
# of them explains the stripping itself, which is not a thing to publish.
html, n = re.subn(r'<!--.*?-->\s*', "", html, flags=re.S)
print(f"  stripped {n} × comment", file=sys.stderr)

# A private section that somehow survived would publish exactly what this
# script exists to withhold, so fail loudly rather than write the file.
if "data-audience=\"private\"" in html:
    sys.exit("REFUSING TO WRITE: private content still present in the public build")

open(dest, "w", encoding="utf-8").write(html)
PY

echo "wrote site/case-study/index.html  (public, appendices stripped)"
echo
echo "Publish the whole site with:  netlify deploy --prod --dir=site"
