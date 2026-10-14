#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESTORE_ENVIRONMENT="${RESTORE_ENVIRONMENT:-}"
RESTORE_ENV_DIR="${RESTORE_ENV_DIR:-}"
RESTORE_ENV_FILE="${RESTORE_ENV_FILE:-}"
RESTORE_COMPOSE_PROJECT="${RESTORE_COMPOSE_PROJECT:-}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-}"
RESTORE_BACKUP_FILE="${RESTORE_BACKUP_FILE:-}"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-}"
RESTORE_REPORT_FILE="${RESTORE_REPORT_FILE:-}"
RESTORE_PREVIOUS_COPY="${RESTORE_PREVIOUS_COPY:-}"

for key in RESTORE_ENVIRONMENT RESTORE_ENV_DIR RESTORE_ENV_FILE RESTORE_COMPOSE_PROJECT RESTORE_CONTAINER RESTORE_BACKUP_FILE RESTORE_CONFIRM; do
  if [[ -z "${!key:-}" ]]; then
    echo "$key is required." >&2
    exit 2
  fi
done

normalized_environment="$(printf '%s' "$RESTORE_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')"
case "$normalized_environment" in
  development|dev|local) RESTORE_ENVIRONMENT="development" ;;
  test|testing|ci) RESTORE_ENVIRONMENT="test" ;;
  production|prod) RESTORE_ENVIRONMENT="production" ;;
  *) echo "RESTORE_ENVIRONMENT must identify development, test, or production." >&2; exit 2 ;;
esac

expected_confirm="RESTORE-$(printf '%s' "$RESTORE_ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
if [[ "$RESTORE_CONFIRM" != "$expected_confirm" ]]; then
  echo "Restore confirmation mismatch: expected $expected_confirm" >&2
  exit 2
fi

RESTORE_ENV_DIR="$(cd "$RESTORE_ENV_DIR" && pwd -P)"
if [[ ! -f "$RESTORE_ENV_DIR/$RESTORE_ENV_FILE" ]]; then
  echo "Restore environment file does not exist: $RESTORE_ENV_DIR/$RESTORE_ENV_FILE" >&2
  exit 2
fi
if [[ ! -f "$RESTORE_BACKUP_FILE" || ! -f "$RESTORE_BACKUP_FILE.manifest.json" ]]; then
  echo "Verified recovery candidate pair is incomplete: $RESTORE_BACKUP_FILE" >&2
  exit 2
fi

backup_dir="$(cd "$(dirname "$RESTORE_BACKUP_FILE")" && pwd -P)"
backup_name="$(basename "$RESTORE_BACKUP_FILE")"
RESTORE_BACKUP_FILE="$backup_dir/$backup_name"
case "$RESTORE_BACKUP_FILE" in
  "$RESTORE_ENV_DIR"/recovery/*) ;;
  *)
    echo "Refusing restore candidate outside $RESTORE_ENV_DIR/recovery/: $RESTORE_BACKUP_FILE" >&2
    exit 2
    ;;
esac

mkdir -p "$RESTORE_ENV_DIR/recovery/reports" "$RESTORE_ENV_DIR/recovery/pre-restore"
chmod 700 "$RESTORE_ENV_DIR/recovery" "$RESTORE_ENV_DIR/recovery/reports" "$RESTORE_ENV_DIR/recovery/pre-restore" 2>/dev/null || true
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "$RESTORE_REPORT_FILE" ]]; then
  RESTORE_REPORT_FILE="$RESTORE_ENV_DIR/recovery/reports/restore-${stamp}.json"
fi
if [[ -z "$RESTORE_PREVIOUS_COPY" ]]; then
  RESTORE_PREVIOUS_COPY="$RESTORE_ENV_DIR/recovery/pre-restore/app-before-${stamp}.db"
fi

# Re-verify before any service is stopped or live data is touched.
ERS_BACKUP_ENV_DIR="$RESTORE_ENV_DIR" \
ERS_BACKUP_ENV_FILE="$RESTORE_ENV_FILE" \
ERS_BACKUP_COMPOSE_PROJECT="$RESTORE_COMPOSE_PROJECT" \
  "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-restore verify \
    --backup "$RESTORE_BACKUP_FILE" \
    --manifest "$RESTORE_BACKUP_FILE.manifest.json" \
    --expected-environment "$RESTORE_ENVIRONMENT"

restore_guard_active=1
if docker ps --format '{{.Names}}' | grep -qx "$RESTORE_CONTAINER"; then
  echo "Stopping $RESTORE_CONTAINER before SQLite replacement."
  docker stop "$RESTORE_CONTAINER" >/dev/null
fi

restore_failure_guard() {
  status=$?
  trap - EXIT INT TERM
  if [[ $status -ne 0 && $restore_guard_active -eq 1 ]]; then
    if docker ps --format '{{.Names}}' | grep -qx "$RESTORE_CONTAINER"; then
      docker stop "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
    fi
    echo "Restore failed after entering the destructive recovery phase. The backend is being left stopped so the database state can be inspected safely." >&2
    echo "Do not restart it until the recovery candidate, live database, restore report, and pre-restore evidence have been reviewed." >&2
  fi
  exit "$status"
}
trap restore_failure_guard EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ERS_BACKUP_ENV_DIR="$RESTORE_ENV_DIR" \
ERS_BACKUP_ENV_FILE="$RESTORE_ENV_FILE" \
ERS_BACKUP_COMPOSE_PROJECT="$RESTORE_COMPOSE_PROJECT" \
  "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-restore apply \
    --backup "$RESTORE_BACKUP_FILE" \
    --manifest "$RESTORE_BACKUP_FILE.manifest.json" \
    --target /app/data/app.db \
    --environment "$RESTORE_ENVIRONMENT" \
    --confirm "$RESTORE_CONFIRM" \
    --pre-restore-copy "$RESTORE_PREVIOUS_COPY" \
    --report "$RESTORE_REPORT_FILE"
# Bring the backend back from the same deployed image/config after replacement.
cd "$RESTORE_ENV_DIR"
env \
  -u APP_ENV \
  -u APP_AUTO_MIGRATE \
  -u AUTHZ_ACTOR_HEADER_MODE \
  -u DEV_SEED_ADMIN \
  AUTHZ_BOOTSTRAP_ENABLED=false \
  docker compose \
    -p "$RESTORE_COMPOSE_PROJECT" \
    --env-file "$RESTORE_ENV_FILE" \
    -f docker-compose.server.yml \
    up -d backend >/dev/null

healthy=0
for ((attempt=1; attempt<=12; attempt++)); do
  if docker exec "$RESTORE_CONTAINER" curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 5
done
if [[ $healthy -ne 1 ]]; then
  echo "Restored database was installed, but backend health did not recover. Preserve $RESTORE_REPORT_FILE and $RESTORE_PREVIOUS_COPY for investigation." >&2
  exit 1
fi

integrity="$(docker exec "$RESTORE_CONTAINER" sqlite3 /app/data/app.db 'PRAGMA integrity_check;')"
if [[ "$integrity" != "ok" ]]; then
  echo "Post-restart restored database integrity_check failed: $integrity" >&2
  exit 1
fi
foreign_keys="$(docker exec "$RESTORE_CONTAINER" sqlite3 /app/data/app.db 'PRAGMA foreign_key_check;')"
if [[ -n "$foreign_keys" ]]; then
  echo "Post-restart restored database foreign_key_check returned violations:" >&2
  printf '%s\n' "$foreign_keys" >&2
  exit 1
fi

trap - EXIT INT TERM
echo "Restore completed and post-restart database verification passed."
echo "Recovery candidate: $RESTORE_BACKUP_FILE"
echo "Pre-restore database copy: $RESTORE_PREVIOUS_COPY"
echo "Restore verification report: $RESTORE_REPORT_FILE"
