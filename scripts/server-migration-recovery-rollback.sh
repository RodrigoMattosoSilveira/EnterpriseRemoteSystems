#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_ENVIRONMENT="${MIGRATION_ENVIRONMENT:-}"
MIGRATION_ENV_DIR="${MIGRATION_ENV_DIR:-}"
MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-}"
MIGRATION_COMPOSE_PROJECT="${MIGRATION_COMPOSE_PROJECT:-}"
MIGRATION_STATE_FILE="${MIGRATION_STATE_FILE:-}"

for key in MIGRATION_ENVIRONMENT MIGRATION_ENV_DIR MIGRATION_ENV_FILE MIGRATION_COMPOSE_PROJECT MIGRATION_STATE_FILE; do
  [[ -n "${!key:-}" ]] || { echo "$key is required." >&2; exit 2; }
done
MIGRATION_ENV_DIR="$(cd "$MIGRATION_ENV_DIR" && pwd -P)"
[[ -f "$MIGRATION_STATE_FILE" ]] || { echo "Migration gate state does not exist: $MIGRATION_STATE_FILE" >&2; exit 2; }
read_state_value() { grep -E "^$1=" "$MIGRATION_STATE_FILE" | tail -n 1 | cut -d= -f2- || true; }
status="$(read_state_value status)"
[[ "$status" == "armed" ]] || { echo "Migration gate is not armed; current status: ${status:-unknown}" >&2; exit 2; }
state_env="$(read_state_value environment)"
[[ "$state_env" == "$MIGRATION_ENVIRONMENT" ]] || { echo "Migration gate environment mismatch: state=$state_env requested=$MIGRATION_ENVIRONMENT" >&2; exit 2; }
gate_dir="$(read_state_value gate_dir)"
recovery_backup="$(read_state_value recovery_backup)"

compose() {
  (cd "$MIGRATION_ENV_DIR" && env -u APP_ENV -u APP_AUTO_MIGRATE -u AUTHZ_ACTOR_HEADER_MODE -u DEV_SEED_ADMIN AUTHZ_BOOTSTRAP_ENABLED=false docker compose -p "$MIGRATION_COMPOSE_PROJECT" --env-file "$MIGRATION_ENV_FILE" -f docker-compose.server.yml "$@")
}

echo "Stopping deployed application stack before migration rollback."
compose stop >/dev/null || true

if [[ -n "$recovery_backup" ]]; then
  [[ -f "$recovery_backup" && -f "$recovery_backup.manifest.json" ]] || { echo "Verified rollback candidate is incomplete: $recovery_backup" >&2; exit 2; }
  confirm="RESTORE-$(printf '%s' "$MIGRATION_ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
  ERS_BACKUP_ENV_DIR="$MIGRATION_ENV_DIR" \
  ERS_BACKUP_ENV_FILE="$MIGRATION_ENV_FILE" \
  ERS_BACKUP_COMPOSE_PROJECT="$MIGRATION_COMPOSE_PROJECT" \
    "$ROOT_DIR/scripts/run-backup-go-tool.sh" ers-restore apply \
      --backup "$recovery_backup" \
      --manifest "$recovery_backup.manifest.json" \
      --target /app/data/app.db \
      --environment "$MIGRATION_ENVIRONMENT" \
      --confirm "$confirm" \
      --pre-restore-copy "$gate_dir/post-migration-before-rollback.db" \
      --report "$gate_dir/deployment-rollback.json"
  new_status="rolled_back"
  echo "Verified pre-migration database restored."
else
  new_status="failed_first_deployment"
  echo "No prior database existed for this first-deployment gate; application remains stopped and the new database is preserved for inspection."
fi

awk -v value="$new_status" 'BEGIN{done=0} /^status=/{print "status=" value; done=1; next} {print} END{if(!done) print "status=" value}' "$MIGRATION_STATE_FILE" > "$MIGRATION_STATE_FILE.tmp"
printf 'rolled_back_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$MIGRATION_STATE_FILE.tmp"
mv "$MIGRATION_STATE_FILE.tmp" "$MIGRATION_STATE_FILE"

echo "Migration/deployment recovery gate rollback completed."
echo "The application stack remains stopped. Review evidence before retrying or starting another revision."
