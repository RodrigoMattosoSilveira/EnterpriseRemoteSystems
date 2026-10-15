#!/usr/bin/env bash
set -euo pipefail

MIGRATION_ENVIRONMENT="${MIGRATION_ENVIRONMENT:-}"
MIGRATION_ENV_DIR="${MIGRATION_ENV_DIR:-}"
MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-}"
MIGRATION_COMPOSE_PROJECT="${MIGRATION_COMPOSE_PROJECT:-}"
MIGRATION_CONTAINER="${MIGRATION_CONTAINER:-}"
MIGRATION_EXPECTED_FINAL_MIGRATION="${MIGRATION_EXPECTED_FINAL_MIGRATION:-000077_journey_bonus_award_approval.up.sql}"
MIGRATION_STATE_FILE="${MIGRATION_STATE_FILE:-}"
for key in MIGRATION_ENVIRONMENT MIGRATION_ENV_DIR MIGRATION_ENV_FILE MIGRATION_COMPOSE_PROJECT MIGRATION_CONTAINER MIGRATION_STATE_FILE; do
  [[ -n "${!key:-}" ]] || { echo "$key is required." >&2; exit 2; }
done
MIGRATION_ENV_DIR="$(cd "$MIGRATION_ENV_DIR" && pwd -P)"
[[ -f "$MIGRATION_STATE_FILE" ]] || { echo "Migration gate state does not exist: $MIGRATION_STATE_FILE" >&2; exit 2; }
read_state_value() { grep -E "^$1=" "$MIGRATION_STATE_FILE" | tail -n 1 | cut -d= -f2- || true; }
status="$(read_state_value status)"
[[ "$status" == "armed" ]] || { echo "Migration gate is not armed; current status: ${status:-unknown}" >&2; exit 2; }
[[ "$(read_state_value environment)" == "$MIGRATION_ENVIRONMENT" ]] || { echo "Migration gate environment mismatch." >&2; exit 2; }

if ! docker ps --format '{{.Names}}' | grep -qx "$MIGRATION_CONTAINER"; then
  echo "Cannot commit migration gate: backend is not running: $MIGRATION_CONTAINER" >&2
  exit 1
fi
if ! docker exec "$MIGRATION_CONTAINER" curl -fsS http://localhost:8080/healthz >/dev/null; then
  echo "Cannot commit migration gate: backend health check failed." >&2
  exit 1
fi
integrity="$(docker exec "$MIGRATION_CONTAINER" sqlite3 /app/data/app.db 'PRAGMA integrity_check;')"
[[ "$integrity" == "ok" ]] || { echo "Cannot commit migration gate: integrity_check failed: $integrity" >&2; exit 1; }
foreign_keys="$(docker exec "$MIGRATION_CONTAINER" sqlite3 /app/data/app.db 'PRAGMA foreign_key_check;')"
[[ -z "$foreign_keys" ]] || { echo "Cannot commit migration gate: foreign_key_check returned violations:" >&2; printf '%s\n' "$foreign_keys" >&2; exit 1; }
docker exec -e EXPECTED_FINAL_MIGRATION="$MIGRATION_EXPECTED_FINAL_MIGRATION" "$MIGRATION_CONTAINER" /app/verify-migrated-db.sh >/dev/null

awk 'BEGIN{done=0} /^status=/{print "status=committed"; done=1; next} {print} END{if(!done) print "status=committed"}' "$MIGRATION_STATE_FILE" > "$MIGRATION_STATE_FILE.tmp"
printf 'committed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$MIGRATION_STATE_FILE.tmp"
mv "$MIGRATION_STATE_FILE.tmp" "$MIGRATION_STATE_FILE"

echo "Migration/deployment recovery gate COMMITTED."
echo "Backend health, SQLite integrity/foreign keys, and migration history are verified."
