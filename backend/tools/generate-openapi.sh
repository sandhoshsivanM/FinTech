#!/usr/bin/env bash
# Regenerates contracts/openapi/<service>.json from each service's real endpoints.
#
# Each *.Api project is built with -p:GenerateOpenApi=true. The OpenAPI build
# tool starts the app against a no-op web server, so hosted services run and the
# service needs a real Postgres and RabbitMQ: this script starts throwaway
# containers for them (the same ones CI uses), gives every service its own empty
# database, and removes the containers on exit. Nothing here is a real secret.
#
# CI runs this and fails on `git diff --exit-code contracts/openapi`.
set -euo pipefail
cd "$(dirname "$0")/.."

pg=khazana-openapi-pg-$$
mq=khazana-openapi-mq-$$
cleanup() { docker rm -f "$pg" "$mq" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$pg" -e POSTGRES_PASSWORD=openapi -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
# Same image the Testcontainers tests use in CI. The cookie is passed on the
# command line: without it RabbitMQ reads /var/lib/rabbitmq/.erlang.cookie,
# which fails with eacces on the GitHub runner and crashes the broker.
docker run -d --name "$mq" -e RABBITMQ_DEFAULT_USER=openapi -e RABBITMQ_DEFAULT_PASS=openapi \
  -e RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS="-setcookie openapi-generation-only" \
  -p 127.0.0.1::5672 rabbitmq:4-management-alpine >/dev/null
pg_port=$(docker port "$pg" 5432/tcp | head -1 | sed 's/.*://')
mq_port=$(docker port "$mq" 5672/tcp | head -1 | sed 's/.*://')
# Bounded waits: a container that never comes up must fail the job, not hang it.
wait_for() { # <what> <seconds> <command...>
  local what=$1 limit=$2; shift 2
  local start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    if (( SECONDS - start > limit )); then echo "openapi: $what not ready after ${limit}s" >&2; docker logs "${what}" 2>&1 | tail -20 >&2; exit 1; fi
    sleep 2
  done
}
wait_for "$pg" 90 docker exec "$pg" pg_isready -U postgres
wait_for "$mq" 180 docker exec "$mq" rabbitmq-diagnostics --erlang-cookie openapi-generation-only -q ping
sleep 2 # postgres restarts once after initdb; pg_isready can answer during that

export ASPNETCORE_ENVIRONMENT=Development
export ConnectionStrings__rabbitmq="amqp://openapi:openapi@127.0.0.1:${mq_port}"
dummy="openapi-generation-only-not-a-secret-0123456789"
export Catalog__InternalKey="$dummy" Reporting__InternalKey="$dummy" Reporting__AuditKey="$dummy"
export Identity__Secrets__FieldKey="$dummy"

for proj in services/*/*.Api/*.Api.csproj; do
  svc=$(basename "$proj" .csproj | sed -e 's/^Khazana\.//' -e 's/\.Api$//' | tr 'A-Z' 'a-z')
  docker exec "$pg" psql -U postgres -qc "CREATE DATABASE openapi_${svc}"
  cs="Host=127.0.0.1;Port=${pg_port};Database=openapi_${svc};Username=postgres;Password=openapi"
  for name in identity devices sync notification catalog marketdata reporting aa credit; do
    export "ConnectionStrings__${name}=${cs}"
  done
  echo "openapi: ${svc}"
  # The build starts the app to read its endpoints; one that never returns
  # (a hosted service waiting on something) must not stall CI for hours.
  if ! timeout 600 dotnet build "$proj" --configuration Release -p:GenerateOpenApi=true -v:q -nologo; then
    echo "openapi: ${svc} failed or timed out" >&2
    exit 1
  fi
done
