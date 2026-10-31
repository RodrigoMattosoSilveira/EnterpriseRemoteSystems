#!/usr/bin/env bash
# Full Docker integration: execute only on a Docker-enabled LOCAL host.
# Creates and removes only containers/image/workspace with a unique 3368A name.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
command -v docker >/dev/null || { echo 'BLOCKED: Docker is required' >&2; exit 2; }
command -v jq >/dev/null || { echo 'BLOCKED: jq is required' >&2; exit 2; }
docker info >/dev/null || { echo 'BLOCKED: Docker engine unavailable' >&2; exit 2; }
umask 077
workspace="$(mktemp -d "${TMPDIR:-/tmp}/ers-3368a-docker.XXXXXXXX")"
stamp="$(basename "$workspace" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
image_tag="ers-3368a-isolation-test:$stamp"
container="ers-3368a-proof-$stamp"
poison_volume="ers-3368a-poison-$stamp"
image_created=false
volume_created=false
cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ "$volume_created" == true ]]; then docker volume rm "$poison_volume" >/dev/null 2>&1 || status=1; fi
  if [[ "$image_created" == true ]]; then docker image rm "$image_tag" >/dev/null 2>&1 || status=1; fi
  rm -rf -- "$workspace" || status=1
  if docker container inspect "$container" >/dev/null 2>&1; then status=1; fi
  if [[ "$status" != 0 ]]; then
    echo 'BLOCKED: Docker isolation test or scoped cleanup failed; inspect only erS-3368a created resources' >&2
  fi
  exit "$status"
}
trap cleanup EXIT
mkdir -p "$workspace/boot-data"
cat > "$workspace/test.env" <<'ENV'
APP_ENV=test
JWT_SECRET=ers-3368a-test-only-not-a-real-secret
CORS_ALLOW_ORIGINS=http://localhost:9999
AUTHZ_ACTOR_HEADER_MODE=disabled
AUTH_SESSION_COOKIE_SECURE=true
ENV

echo 'Building the current backend image for disposable Docker isolation verification.'
docker build -t "$image_tag" "$ROOT/backend" >/dev/null
image_created=true
image_id="$(docker image inspect "$image_tag" --format '{{.Id}}')"
export ERS_RECOVERY_IMAGE="$image_id"
export ERS_RECOVERY_WORKDIR="$workspace"
export ERS_RECOVERY_BOOT_DIR="$workspace/boot-data"
export ERS_RECOVERY_CONTAINER="$container"
export ERS_RECOVERY_ENV_FILE="$workspace/test.env"
export ERS_RECOVERY_ENVIRONMENT=test
ERS_RECOVERY_EXPECTED_MIGRATION="$(ls "$ROOT"/backend/migrations/*.up.sql | sort | tail -n 1)"
export ERS_RECOVERY_EXPECTED_MIGRATION="$(basename "$ERS_RECOVERY_EXPECTED_MIGRATION")"
helper="$ROOT/scripts/ers-recovery-isolated-container.sh"

# Poison a distinct named volume to show the healthy backend is independent.
docker volume create "$poison_volume" >/dev/null
volume_created=true
docker run --rm --network none --mount "type=volume,src=$poison_volume,dst=/app/data" \
  --entrypoint /bin/sh "$image_id" -c 'printf "definitely-not-sqlite" > /app/data/app.db'

: > "$workspace/migrated.db"
"$helper" migrate >/dev/null
"$helper" verify >/dev/null
cp "$workspace/migrated.db" "$workspace/boot-data/app.db"
"$helper" start >/dev/null
"$helper" inspect
healthy=false
for i in {1..15}; do
  if docker exec "$container" curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
    healthy=true; break
  fi
  sleep 2
done
[[ "$healthy" == true ]] || { docker logs "$container" >&2 || true; echo 'BLOCKED: restored test backend did not become healthy' >&2; exit 1; }
"$helper" check-db
"$helper" stop

# Deliberately broken boot DB must fail; it must never fall back to named volume.
printf 'not-a-sqlite-database' > "$workspace/boot-data/app.db"
"$helper" start >/dev/null
"$helper" inspect
bad_healthy=false
for i in {1..5}; do
  if docker exec "$container" curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then bad_healthy=true; break; fi
  sleep 2
done
if [[ "$bad_healthy" == true ]]; then echo 'BLOCKED: corrupt recovered DB became healthy' >&2; exit 1; fi
"$helper" stop
# The decoy live volume must still have its original corrupt sentinel.
poison="$(docker run --rm --network none --mount "type=volume,src=$poison_volume,dst=/app/data" \
  --entrypoint /bin/sh "$image_id" -c 'cat /app/data/app.db')"
[[ "$poison" == 'definitely-not-sqlite' ]] || { echo 'BLOCKED: decoy Test volume was modified' >&2; exit 1; }
echo 'PASS: Docker real-image isolation, recovered DB integrity, invalid DB refusal, and decoy volume preservation.'
