#!/usr/bin/env bash
# One-shot: serve the static build, capture, compose, stop.
# Safe to launch detached:  nohup ./run.sh > run.log 2>&1 &
# STAGE=compose ./run.sh skips the server and capture.
#
# Uses webapp/out (rebuild with `cd webapp && npm run build` if the UI changed)
# rather than `next dev`, which needs far more memory to compile.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../webapp/out"
PORT="${PORT:-3200}"
STAGE="${STAGE:-all}"
cd "$HERE"

if [ "$STAGE" != "compose" ]; then
  echo "[run] serving $OUT on :$PORT"
  python3 -m http.server "$PORT" --bind 127.0.0.1 -d "$OUT" > "$HERE/server.log" 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  for i in $(seq 1 30); do
    curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/" && break
    sleep 1
  done

  BASE_URL="http://localhost:$PORT" node capture.mjs || { echo "[run] capture FAILED"; exit 1; }
  echo "[run] capture done"
fi

[ -f compose.mjs ] || { echo "[run] no compose.mjs yet"; exit 0; }
node compose.mjs || { echo "[run] compose FAILED"; exit 1; }
echo "[run] ALL DONE"
