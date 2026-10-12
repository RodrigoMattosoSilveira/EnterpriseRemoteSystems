#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_ENVIRONMENT="${MIGRATION_ENVIRONMENT:-}"
MIGRATION_ENV_DIR="${MIGRATION_ENV_DIR:-}"
MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-}"
MIGRATION_COMPOSE_PROJECT="${MIGRATION_COMPOSE_PROJECT:-}"
MIGRATION_CONTAINER="${MIGRATION_CONTAINER:-}"
MIGRATION_VOLUME="${MIGRATION_VOLUME:-}"
MIGRATION_EXPECTED_FINAL_MIGRATION="${MIGRATION_EXPECTED_FINAL_MIGRATION:-000077_journey_bonus_award_approval.up.sql}"
MIGRATION_PREVIOUS_REVISION="${MIGRATION_PREVIOUS_REVISION:-}"
MIGRATION_PREVIOUS_TREE_SHA="${MIGRATION_PREVIOUS_TREE_SHA:-}"
MIGRATION_TARGET_REVISION="${MIGRATION_TARGET_REVISION:-}"
MIGRATION_TARGET_TREE_SHA="${MIGRATION_TARGET_TREE_SHA:-}"
MIGRATION_BACKUP_RETENTION_COUNT="${MIGRATION_BACKUP_RETENTION_COUNT:-14}"
MIGRATION_BACKUP_RETENTION_DAYS="${MIGRATION_BACKUP_RETENTION_DAYS:-30}"
MIGRATION_STATE_FILE="${MIGRATION_STATE_FILE:-}"

for key in MIGRATION_ENVIRONMENT MIGRATION_ENV_DIR MIGRATION_ENV_FILE MIGRATION_COMPOSE_PROJECT MIGRATION_CONTAINER MIGRATION_VOLUME; do
  if [[ -z "${!key:-}" ]]; then
    echo "$key is required." >&2
    exit 2
  fi
done

case "$(printf '%s' "$MIGRATION_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')" in
  development|dev|local) MIGRATION_ENVIRONMENT="development" ;;
  test|testing|ci) MIGRATION_ENVIRONMENT="test" ;;
  production|prod) MIGRATION_ENVIRONMENT="production" ;;
  *) echo "MIGRATION_ENVIRONMENT must identify development, test, or production." >&2; exit 2 ;;
esac

MIGRATION_ENV_DIR="$(cd "$MIGRATION_ENV_DIR" && pwd -P)"
if [[ -z "$MIGRATION_TARGET_REVISION" ]] && git -C "$MIGRATION_ENV_DIR" rev-parse HEAD >/dev/null 2>&1; then
  MIGRATION_TARGET_REVISION="$(git -C "$MIGRATION_ENV_DIR" rev-parse HEAD)"
  MIGRATION_TARGET_TREE_SHA="$(git -C "$MIGRATION_ENV_DIR" rev-parse HEAD^{tree})"
fi
for revision_value in "$MIGRATION_PREVIOUS_REVISION" "$MIGRATION_PREVIOUS_TREE_SHA" "$MIGRATION_TARGET_REVISION" "$MIGRATION_TARGET_TREE_SHA"; do
  if [[ -n "$revision_value" && ( ${#revision_value} -ne 40 || "$revision_value" == *[!0-9a-fA-F]* ) ]]; then
    echo "Migration recovery revision/tree evidence must be a 40-character Git SHA when provided: $revision_value" >&2
    exit 2
  fi
done
if [[ ! -f "$MIGRATION_ENV_DIR/$MIGRATION_ENV_FILE" ]]; then
  echo "Migration environment file does not exist: $MIGRATION_ENV_DIR/$MIGRATION_ENV_FILE" >&2
  exit 2
fi

recovery_root="$MIGRATION_ENV_DIR/recovery/migration-gates"
mkdir -p "$recovery_root" "$MIGRATION_ENV_DIR/backups"
chmod 700 "$MIGRATION_ENV_DIR/recovery" "$recovery_root" 2>/dev/null || true
if [[ -z "$MIGRATION_STATE_FILE" ]]; then
  MIGRATION_STATE_FILE="$recovery_root/current.state"
fi

read_state_value() {
  local key="$1" file="$2"
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- || true
}
if [[ -f "$MIGRATION_STATE_FILE" && "$(read_state_value status "$MIGRATION_STATE_FILE")" == "armed" ]]; then
  echo "Refusing to create a new migration gate while an earlier gate remains armed: $MIGRATION_STATE_FILE" >&2
  echo "Commit or roll back the existing gate first." >&2
  exit 2
fi

compose() {
  (
    cd "$MIGRATION_ENV_DIR"
    env \
      -u APP_ENV \
      -u APP_AUTO_MIGRATE \
      -u AUTHZ_ACTOR_HEADER_MODE \
      -u DEV_SEED_ADMIN \
      AUTHZ_BOOTSTRAP_ENABLED=false \
      docker compose \
        -p "$MIGRATION_COMPOSE_PROJECT" \
        --env-file "$MIGRATION_ENV_FILE" \
        -f docker-compose.server.yml \
        "$@"
  )
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
gate_dir="$recovery_root/gate-$timestamp"
sequence=1
while [[ -e "$gate_dir" ]]; do
  gate_dir="$recovery_root/gate-$timestamp-$sequence"
  sequence=$((sequence + 1))
done
mkdir -p "$gate_dir"
chmod 700 "$gate_dir" 2>/dev/null || true

backend_running=0
if docker ps --format '{{.Names}}' | grep -qx "$MIGRATION_CONTAINER"; then
  backend_running=1
fi
volume_exists=0
if docker volume inspect "$MIGRATION_VOLUME" >/dev/null 2>&1; then
  volume_exists=1
fi

backup_file=""
recovery_backup=""
source_sha256=""
first_deployment=0

create_offline_backup() {
  local backup_dir="$MIGRATION_ENV_DIR/backups"
  local base="app-$(date -u +%Y%m%dT%H%M%SZ)"
  local target="$backup_dir/${base}.db"
  local n=1
  while [[ -e "$target" || -e "$target.manifest.json" ]]; do
    target="$backup_dir/${base}-${n}.db"
    n=$((n + 1))
  done

  echo "Creating verified offline pre-migration backup from $MIGRATION_VOLUME."
  compose run --rm --no-deps \
    -v "$backup_dir:$backup_dir" \
    --entrypoint sh backend -c \
    "set -eu; test -f /app/data/app.db; sqlite3 /app/data/app.db \".backup '$target'\"; test \"\$(sqlite3 '$target' 'PRAGMA integrity_check;')\" = ok; test -z \"\$(sqlite3 '$target' 'PRAGMA foreign_key_check;')\""

  ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
  ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
  ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
    "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-backup create-manifest \
      --backup "$target" \
      --manifest "$target.manifest.json" \
      --environment "$MIGRATION_ENVIRONMENT" \
      --source-container "offline-$MIGRATION_COMPOSE_PROJECT" \
      --source-database-path /app/data/app.db

  ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
  ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
  ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
    "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-backup prune \
      --directory "$backup_dir" \
      --retention-count "$MIGRATION_BACKUP_RETENTION_COUNT" \
      --retention-days "$MIGRATION_BACKUP_RETENTION_DAYS"
  printf '%s\n' "$target"
}

replicate_if_enabled() {
  local candidate="$1"
  local status
  status="$(ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-offhost-backup status --environment "$MIGRATION_ENVIRONMENT" --env-file "$MIGRATION_ENV_DIR/$MIGRATION_ENV_FILE")"
  if [[ "$status" == "enabled" ]]; then
    ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
    ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
    ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
      "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-offhost-backup replicate \
        --environment "$MIGRATION_ENVIRONMENT" \
        --env-file "$MIGRATION_ENV_DIR/$MIGRATION_ENV_FILE" \
        --backup "$candidate"
  else
    echo "Off-host backup is disabled for $MIGRATION_ENVIRONMENT; verified local recovery evidence will be used by the migration gate."
  fi
}

if [[ $volume_exists -eq 0 ]]; then
  first_deployment=1
  echo "No existing SQLite volume is present; preparing first-deployment migration gate without a rollback source."
  docker volume create "$MIGRATION_VOLUME" >/dev/null
else
  result_file="$gate_dir/backup-result"
  if [[ $backend_running -eq 1 ]]; then
    echo "Creating verified online pre-migration backup before taking the application offline."
    BACKUP_ENVIRONMENT="$MIGRATION_ENVIRONMENT" \
    BACKUP_CONTAINER="$MIGRATION_CONTAINER" \
    BACKUP_DIRECTORY="$MIGRATION_ENV_DIR/backups" \
    BACKUP_RETENTION_COUNT="$MIGRATION_BACKUP_RETENTION_COUNT" \
    BACKUP_RETENTION_DAYS="$MIGRATION_BACKUP_RETENTION_DAYS" \
    BACKUP_RESULT_FILE="$result_file" \
    ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
    ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
    ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
      "$ROOT_DIR/scripts/server-sqlite-backup.sh"
    backup_file="$(cat "$result_file")"
  else
    backup_file="$(create_offline_backup | tail -n 1)"
  fi

  replicate_if_enabled "$backup_file"
  source_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"

  recovery_source_dir="$gate_dir/recovery-source"
  mkdir -p "$recovery_source_dir"
  ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
  ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
  ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
    "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-restore stage \
      --backup "$backup_file" \
      --manifest "$backup_file.manifest.json" \
      --expected-environment "$MIGRATION_ENVIRONMENT" \
      --output-dir "$recovery_source_dir"
  recovery_backup="$recovery_source_dir/$(basename "$backup_file")"
fi

probe="$gate_dir/migration-probe.db"
if [[ -n "$recovery_backup" ]]; then
  cp "$recovery_backup" "$probe"
else
  rm -f "$probe"
fi

echo "Rehearsing repository migrations against an isolated copy before live database mutation."
compose run --rm --no-deps \
  -v "$gate_dir:$gate_dir" \
  -e DATABASE_PATH="$probe" \
  -e EXPECTED_FINAL_MIGRATION="$MIGRATION_EXPECTED_FINAL_MIGRATION" \
  --entrypoint /app/apply-sql-migrations.sh backend
compose run --rm --no-deps \
  -v "$gate_dir:$gate_dir" \
  -e DATABASE_PATH="$probe" \
  -e EXPECTED_FINAL_MIGRATION="$MIGRATION_EXPECTED_FINAL_MIGRATION" \
  --entrypoint /app/verify-migrated-db.sh backend

probe_sha256="$(sha256sum "$probe" | awk '{print $1}')"
echo "Migration rehearsal passed: $probe"

# No service may remain active while the real SQLite file is mutated.
echo "Stopping the deployed application stack before live migration."
compose stop >/dev/null || true

rollback_live_database() {
  local failure_status="$1"
  if [[ -n "$recovery_backup" ]]; then
    echo "Live migration failed; restoring the verified pre-migration database while the application remains stopped." >&2
    confirm="RESTORE-$(printf '%s' "$MIGRATION_ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
    set +e
    ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
    ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
    ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
      "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-restore apply \
        --backup "$recovery_backup" \
        --manifest "$recovery_backup.manifest.json" \
        --target /app/data/app.db \
        --environment "$MIGRATION_ENVIRONMENT" \
        --confirm "$confirm" \
        --pre-restore-copy "$gate_dir/failed-migration-state.db" \
        --report "$gate_dir/migration-failure-rollback.json"
    rollback_status=$?
    set -e
    if [[ $rollback_status -eq 0 ]]; then
      failure_gate_status="rolled_back_after_migration_failure"
      echo "Verified pre-migration database restored after migration failure." >&2
    else
      failure_gate_status="rollback_failed"
      echo "CRITICAL: migration failed and automatic database rollback also failed. Application remains stopped; inspect gate evidence before any restart." >&2
    fi
  else
    failure_gate_status="failed_first_deployment"
    echo "First-deployment migration failed; no prior database exists to restore. The application remains stopped for inspection." >&2
  fi
  {
    echo "status=$failure_gate_status"
    echo "environment=$MIGRATION_ENVIRONMENT"
    echo "gate_dir=$gate_dir"
    echo "backup_file=$backup_file"
    echo "recovery_backup=$recovery_backup"
    echo "source_sha256=$source_sha256"
    echo "probe_sha256=$probe_sha256"
    echo "expected_final_migration=$MIGRATION_EXPECTED_FINAL_MIGRATION"
    echo "previous_revision=$MIGRATION_PREVIOUS_REVISION"
    echo "previous_tree_sha=$MIGRATION_PREVIOUS_TREE_SHA"
    echo "target_revision=$MIGRATION_TARGET_REVISION"
    echo "target_tree_sha=$MIGRATION_TARGET_TREE_SHA"
    echo "failed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$MIGRATION_STATE_FILE"
  exit "$failure_status"
}

set +e
compose run --rm --no-deps \
  -e DATABASE_PATH=/app/data/app.db \
  -e EXPECTED_FINAL_MIGRATION="$MIGRATION_EXPECTED_FINAL_MIGRATION" \
  --entrypoint /app/apply-sql-migrations.sh backend
live_status=$?
if [[ $live_status -eq 0 ]]; then
  compose run --rm --no-deps \
    -e DATABASE_PATH=/app/data/app.db \
    -e EXPECTED_FINAL_MIGRATION="$MIGRATION_EXPECTED_FINAL_MIGRATION" \
    --entrypoint /app/verify-migrated-db.sh backend
  live_status=$?
fi
set -e
if [[ $live_status -ne 0 ]]; then
  rollback_live_database "$live_status"
fi

{
  echo "status=armed"
  echo "environment=$MIGRATION_ENVIRONMENT"
  echo "gate_dir=$gate_dir"
  echo "backup_file=$backup_file"
  echo "recovery_backup=$recovery_backup"
  echo "source_sha256=$source_sha256"
  echo "probe_sha256=$probe_sha256"
  echo "expected_final_migration=$MIGRATION_EXPECTED_FINAL_MIGRATION"
  echo "previous_revision=$MIGRATION_PREVIOUS_REVISION"
  echo "previous_tree_sha=$MIGRATION_PREVIOUS_TREE_SHA"
  echo "target_revision=$MIGRATION_TARGET_REVISION"
  echo "target_tree_sha=$MIGRATION_TARGET_TREE_SHA"
  echo "first_deployment=$first_deployment"
  echo "armed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$MIGRATION_STATE_FILE"
chmod 600 "$MIGRATION_STATE_FILE" 2>/dev/null || true

echo "Migration/deployment recovery gate ARMED."
echo "State: $MIGRATION_STATE_FILE"
echo "Gate evidence: $gate_dir"
if [[ -n "$recovery_backup" ]]; then
  echo "Verified rollback candidate: $recovery_backup"
else
  echo "Verified rollback candidate: none (first deployment)"
fi
echo "The application stack remains stopped until post-migration deployment checks succeed."
