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
docker run -d --name "$mq" -e RABBITMQ_DEFAULT_USER=openapi -e RABBITMQ_DEFAULT_PASS=openapi -p 127.0.0.1::5672 rabbitmq:4-alpine >/dev/null
pg_port=$(docker port "$pg" 5432/tcp | head -1 | sed 's/.*://')
mq_port=$(docker port "$mq" 5672/tcp | head -1 | sed 's/.*://')
until docker exec "$pg" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
until docker exec "$mq" rabbitmq-diagnostics -q ping >/dev/null 2>&1; do sleep 2; done
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
  for name in identity devices sync notification catalog marketdata reporting; do
    export "ConnectionStrings__${name}=${cs}"
  done
  echo "openapi: ${svc}"
  dotnet build "$proj" --configuration Release -p:GenerateOpenApi=true -v:q -nologo
done
