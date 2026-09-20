#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${ENV:-development}"
SERVER_ROOT="${SERVER_ROOT:-/opt/EnterpriseRemoteSystems}"
AS_OF="${BRAZILIAN_DEMO_AS_OF:-2026-09-18}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
HEALTH_ATTEMPTS="${BRAZILIAN_DEMO_HEALTH_ATTEMPTS:-60}"
HEALTH_DELAY_SECONDS="${BRAZILIAN_DEMO_HEALTH_DELAY_SECONDS:-2}"

usage() {
  cat <<'USAGE'
Usage:
  ENV=development scripts/brazilian-demo-server-reset.sh
  ENV=test scripts/brazilian-demo-server-reset.sh

Environment variables:
  SERVER_ROOT=/opt/EnterpriseRemoteSystems
  BRAZILIAN_DEMO_AS_OF=YYYY-MM-DD

This operation is destructive to the selected Development/Test backend database
volume. Production is always refused. The Make target takes a verified backup
before invoking this script.
USAGE
}

fail() {
  echo "❌ $*" >&2
  exit 2
}

case "$ENVIRONMENT" in
  development)
    env_dir="${SERVER_ROOT}/development"
    env_file=".env.development"
    compose_project="ers-dev"
    container_prefix="ers-dev"
    ;;
  test)
    env_dir="${SERVER_ROOT}/test"
    env_file=".env.test"
    compose_project="ers-tst"
    container_prefix="ers-tst"
    ;;
  production|prod)
    fail "Refusing to reset Brazilian demo data in Production."
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    fail "Brazilian demo server reset supports ENV=development or ENV=test. Got ENV=${ENVIRONMENT}."
    ;;
esac

command -v "$DOCKER_BIN" >/dev/null 2>&1 || fail "docker is not installed or not on PATH."
"$DOCKER_BIN" compose version >/dev/null 2>&1 || fail "docker compose is not available."
command -v "$PYTHON_BIN" >/dev/null 2>&1 || fail "python3 is not installed or not on PATH."

[[ -d "$env_dir" ]] || fail "Missing deployed environment directory: ${env_dir}"
[[ -f "$env_dir/docker-compose.server.yml" ]] || fail "Missing ${env_dir}/docker-compose.server.yml"
[[ -f "$env_dir/$env_file" ]] || fail "Missing ${env_dir}/${env_file}"
[[ -f "$env_dir/scripts/seed-brazilian-demo.py" ]] || fail "Missing deployed Brazilian demo seeder: ${env_dir}/scripts/seed-brazilian-demo.py"

backend_container="${container_prefix}-backend"
backend_volume="${compose_project}_backend-data"
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/ers-brazilian-demo-${ENVIRONMENT}.XXXXXX")"
base_db="${tmpdir}/migrated.db"
verify_db="${tmpdir}/verify.db"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

compose() {
  (
    cd "$env_dir"
    AUTHZ_BOOTSTRAP_ENABLED=false "$DOCKER_BIN" compose \
      -p "$compose_project" \
      --env-file "$env_file" \
      -f docker-compose.server.yml \
      "$@"
  )
}

wait_for_backend() {
  local attempt
  echo "Waiting for ${backend_container} to become healthy..."
  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    if "$DOCKER_BIN" exec "$backend_container" curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
      echo "${backend_container} is healthy."
      return 0
    fi
    sleep "$HEALTH_DELAY_SECONDS"
  done
  echo "Backend did not become healthy after ${HEALTH_ATTEMPTS} attempts." >&2
  "$DOCKER_BIN" logs --tail=200 "$backend_container" >&2 || true
  return 1
}

snapshot_server_db() {
  local destination="$1"
  local remote="/tmp/ers-brazilian-demo-snapshot.db"
  "$DOCKER_BIN" exec "$backend_container" rm -f "$remote" "$remote-wal" "$remote-shm"
  "$DOCKER_BIN" exec "$backend_container" sqlite3 /app/data/app.db ".backup '${remote}'"
  # Stream the snapshot through the invoking shell so the temporary file is
  # owned and writable by the operator running the reset, independent of the
  # UID/GID used inside the container.
  "$DOCKER_BIN" exec "$backend_container" cat "$remote" > "$destination"
  "$DOCKER_BIN" exec "$backend_container" rm -f "$remote" "$remote-wal" "$remote-shm"
}

echo "Preparing deterministic Brazilian demo in ${ENVIRONMENT}."
echo "Environment directory: ${env_dir}"
echo "Scenario anchor: ${AS_OF}"
echo "Backend volume: ${backend_volume}"

echo "Stopping ${ENVIRONMENT} services..."
compose down

if "$DOCKER_BIN" volume inspect "$backend_volume" >/dev/null 2>&1; then
  echo "Removing existing backend database volume: ${backend_volume}"
  "$DOCKER_BIN" volume rm "$backend_volume" >/dev/null
fi

echo "Starting backend with a fresh database volume using the already-deployed image..."
compose up -d --no-build backend
wait_for_backend

# Capture the freshly migrated database with SQLite's online backup API. This
# avoids depending on host sqlite3 and preserves the exact schema prepared by
# the deployed backend image.
snapshot_server_db "$base_db"
backend_image="$($DOCKER_BIN inspect "$backend_container" --format '{{.Image}}')"
[[ -n "$backend_image" ]] || fail "Unable to determine deployed backend image."

echo "Seeding deterministic Brazilian demo scenario into the migrated database..."
APP_ENV="$ENVIRONMENT" BRAZILIAN_DEMO_AS_OF="$AS_OF" \
  "$PYTHON_BIN" "$env_dir/scripts/seed-brazilian-demo.py" \
  --db-path "$base_db" --as-of "$AS_OF"
APP_ENV="$ENVIRONMENT" BRAZILIAN_DEMO_AS_OF="$AS_OF" \
  "$PYTHON_BIN" "$env_dir/scripts/seed-brazilian-demo.py" \
  --db-path "$base_db" --as-of "$AS_OF" --verify-only

echo "Stopping backend before replacing the database file..."
compose down

echo "Installing seeded database into ${backend_volume}..."
"$DOCKER_BIN" run --rm \
  --entrypoint sh \
  -v "${backend_volume}:/app/data" \
  -v "${base_db}:/tmp/brazilian-demo.db:ro" \
  "$backend_image" \
  -c 'set -eu; rm -f /app/data/app.db /app/data/app.db-wal /app/data/app.db-shm; cp /tmp/brazilian-demo.db /app/data/app.db'

echo "Starting complete ${ENVIRONMENT} stack using already-deployed images..."
compose up -d --no-build
wait_for_backend

# Verify a fresh online snapshot of the actual server database rather than only
# trusting the temporary file that was copied into the volume.
echo "Verifying the actual ${ENVIRONMENT} server database..."
snapshot_server_db "$verify_db"
APP_ENV="$ENVIRONMENT" BRAZILIAN_DEMO_AS_OF="$AS_OF" \
  "$PYTHON_BIN" "$env_dir/scripts/seed-brazilian-demo.py" \
  --db-path "$verify_db" --as-of "$AS_OF" --verify-only

echo
echo "✅ ${ENVIRONMENT} Brazilian demo is reset, seeded, and verified."
echo "Tenant: Mineração Serra Dourada — DEMO"
echo "Scenario anchor: ${AS_OF}"
echo "Presenter login: demo.tenant-admin@example.test"
