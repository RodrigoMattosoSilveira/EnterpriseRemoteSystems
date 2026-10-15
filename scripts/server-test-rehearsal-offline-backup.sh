#!/usr/bin/env bash
set -euo pipefail

# Only the disposable Test release rehearsal may use this offline pre-reset
# backup path. Production's existing backup/migration guards are unchanged.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_dir="${TEST_REHEARSAL_ENV_DIR:?missing Test environment directory}"
env_file="${TEST_REHEARSAL_ENV_FILE:?missing Test environment file}"
project="${TEST_REHEARSAL_COMPOSE_PROJECT:?missing Test Compose project}"
volume="${TEST_REHEARSAL_VOLUME:?missing Test SQLite volume}"
retention_count="${TEST_REHEARSAL_BACKUP_RETENTION_COUNT:-14}"
retention_days="${TEST_REHEARSAL_BACKUP_RETENTION_DAYS:-30}"
[[ "$project" == "ers-tst" && "$volume" == "${project}_backend-data" ]] || {
  echo "Refusing offline backup outside the known Test Compose project/volume." >&2; exit 2;
}
[[ "$retention_count" =~ ^[1-9][0-9]*$ && "$retention_days" =~ ^[1-9][0-9]*$ ]] || {
  echo "Invalid backup retention policy." >&2; exit 2;
}
env_dir="$(cd "$env_dir" && pwd -P)"
[[ -f "$env_dir/$env_file" ]] || { echo "Missing Test environment contract." >&2; exit 2; }
./scripts/ers-environment-guard.sh require-server-identity test "$env_dir/$env_file"
docker volume inspect "$volume" >/dev/null
# The offline backup is valid only while the named backend is stopped.
if docker ps --format '{{.Names}}' | grep -qx "${project}-backend"; then
  echo "Backend started during offline-backup preparation; aborting." >&2; exit 2
fi
backup_dir="$env_dir/backups"
mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/app-$stamp.db"
n=1
while [[ -e "$file" || -e "$file.manifest.json" ]]; do
  file="$backup_dir/app-$stamp-$n.db"
  n=$((n+1))
done
compose() {
  (cd "$env_dir" && env -u APP_ENV -u APP_AUTO_MIGRATE -u AUTHZ_ACTOR_HEADER_MODE -u DEV_SEED_ADMIN \
    AUTHZ_BOOTSTRAP_ENABLED=false docker compose -p "$project" --env-file "$env_file" -f docker-compose.server.yml "$@")
}
# The SQLite online-backup API can copy a quiescent database safely. Keep
# the backup readable only by the invoking deployment identity.
compose run --rm --no-deps -v "$backup_dir:$backup_dir" \
  --entrypoint sh backend -c '
  set -eu
  db=/app/data/app.db
  out="$1"; uid="$2"; gid="$3"
  test -f "$db"
  sqlite3 "$db" ".backup \"$out\""
  test "$(sqlite3 "$out" "PRAGMA integrity_check;")" = ok
  test -z "$(sqlite3 "$out" "PRAGMA foreign_key_check;")"
  chown "$uid:$gid" "$out"
  chmod 600 "$out"
' sh "$file" "$(id -u)" "$(id -g)"
[[ -f "$file" && -r "$file" ]] || { echo "Offline Test backup is not readable." >&2; exit 2; }
manifest_args=()
if git -C "$env_dir" rev-parse HEAD >/dev/null 2>&1; then
  manifest_args+=(--repository-revision "$(git -C "$env_dir" rev-parse HEAD)" \
    --repository-tree-sha "$(git -C "$env_dir" rev-parse 'HEAD^{tree}')")
fi
ERS_BACKUP_ENV_DIR="$env_dir" ERS_BACKUP_ENV_FILE="$env_file" ERS_BACKUP_COMPOSE_PROJECT="$project" \
  "$root/scripts/run-backup-go-tool.sh" ers-backup create-manifest \
    --backup "$file" --manifest "$file.manifest.json" \
    --environment test --source-container "offline-$project" \
    --source-database-path /app/data/app.db "${manifest_args[@]}"
ERS_BACKUP_ENV_DIR="$env_dir" ERS_BACKUP_ENV_FILE="$env_file" ERS_BACKUP_COMPOSE_PROJECT="$project" \
  "$root/scripts/run-backup-go-tool.sh" ers-backup prune \
    --directory "$backup_dir" --retention-count "$retention_count" --retention-days "$retention_days"
status="$(ERS_BACKUP_ENV_DIR="$env_dir" ERS_BACKUP_ENV_FILE="$env_file" ERS_BACKUP_COMPOSE_PROJECT="$project" \
  "$root/scripts/run-backup-go-tool.sh" ers-offhost-backup status --environment test --env-file "$env_dir/$env_file")"
if [[ "$status" == enabled ]]; then
  ERS_BACKUP_ENV_DIR="$env_dir" ERS_BACKUP_ENV_FILE="$env_file" ERS_BACKUP_COMPOSE_PROJECT="$project" \
    "$root/scripts/run-backup-go-tool.sh" ers-offhost-backup replicate \
    --environment test --env-file "$env_dir/$env_file" --backup "$file"
else
  echo "Off-host backup disabled for Test; retained verified offline backup."
fi
echo "Verified offline Test pre-rehearsal backup: $file"
