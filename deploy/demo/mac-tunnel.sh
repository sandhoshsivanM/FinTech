#!/usr/bin/env bash
# The demo backend on this Mac, reachable from anywhere through a free
# Cloudflare quick tunnel (no account, no card). Then the online web app is
# rebuilt to use it and deployed.
#
#   deploy/demo/mac-tunnel.sh            # backend + tunnel + web app
#   deploy/demo/mac-tunnel.sh --no-web   # backend + tunnel only
#
# Works while this Mac is on (the script keeps it awake). The tunnel's address
# changes every run, which is why the web app is rebuilt each time. Ctrl-C
# closes the tunnel; the backend keeps running in Docker until
#   docker compose -f deploy/demo/compose.yaml --env-file deploy/demo/.env down
set -euo pipefail
cd "$(dirname "$0")/../.."

NETLIFY_SITE="${NETLIFY_SITE:-3a6e44cc-b3cf-45ce-b444-a45204efe44f}"   # khazana-online
env_file=deploy/demo/.env
compose=(docker compose -f deploy/demo/compose.yaml --env-file "$env_file")

command -v cloudflared >/dev/null || { echo "Install cloudflared first: brew install cloudflared" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop first." >&2; exit 1; }
[[ -e "$env_file" ]] || deploy/demo/secrets.sh pending.invalid

# 1. The tunnel, to Caddy on this Mac's port 80.
log=$(mktemp)
cloudflared tunnel --no-autoupdate --url http://localhost:80 >"$log" 2>&1 &
tunnel=$!
trap 'kill "$tunnel" 2>/dev/null || true' EXIT
url=""
for _ in $(seq 1 60); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)
  [[ -n "$url" ]] && break
  sleep 1
done
[[ -n "$url" ]] || { echo "The tunnel didn't start:"; tail -20 "$log"; exit 1; }
host=${url#https://}
echo "Tunnel: $url"

# 2. The backend, told its public address (DPoP proofs name it).
sed -i '' "s/^API_HOST=.*/API_HOST=${host}/" "$env_file"
grep -q '^CADDY_SITE=' "$env_file" || echo 'CADDY_SITE=:80' >>"$env_file"
"${compose[@]}" up -d --build --remove-orphans
"${compose[@]}" restart caddy >/dev/null
echo "Waiting for ${url}/v1/catalog ..."
for _ in $(seq 1 90); do
  curl -fsS -o /dev/null "${url}/v1/catalog" && break
  sleep 3
done
curl -fsS -o /dev/null "${url}/v1/catalog" || { echo "The backend isn't answering through the tunnel." >&2; exit 1; }
echo "Backend up: $url"

# 3. The online web app, rebuilt for this address (its CSP names it) and deployed.
if [[ "${1:-}" != "--no-web" ]]; then
  # --no-build: upload exactly this build. Without it the Netlify CLI runs the
  # build again from netlify.toml, without this address, and the app calls localhost.
  (cd webapp-online && export NEXT_PUBLIC_GATEWAY_URL="$url" && npm ci --silent && npm run build >/dev/null &&
    grep -rqF "$url" out/_next/static && npx --yes netlify-cli deploy --prod --no-build --dir=out --site "$NETLIFY_SITE" >/dev/null)
  echo "Web app deployed: https://khazana-online.netlify.app (talks to $url)"
fi

echo "Ready. Keep this window open; Ctrl-C to close the tunnel."
caffeinate -dims -w "$tunnel"
