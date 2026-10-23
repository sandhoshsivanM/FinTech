#!/usr/bin/env bash
# Builds and (re)starts the demo backend on the VM, then checks it answers.
#   deploy/demo/up.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

git pull --ff-only
compose=(docker compose -f deploy/demo/compose.yaml --env-file deploy/demo/.env)
"${compose[@]}" up -d --build --remove-orphans
# Caddy reads its Caddyfile at start; reload it so a changed one applies.
"${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile

host=$(grep '^API_HOST=' deploy/demo/.env | cut -d= -f2)
echo "Waiting for https://${host}/v1/catalog ..."
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "https://${host}/v1/catalog"; then
    echo "Up: https://${host}"
    "${compose[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
    exit 0
  fi
  sleep 5
done
echo "Not answering after 5 minutes. Logs: ${compose[*]} logs --tail=50" >&2
exit 1
