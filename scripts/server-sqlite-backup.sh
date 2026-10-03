#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ENVIRONMENT="${BACKUP_ENVIRONMENT:-}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-}"
BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_RESULT_FILE="${BACKUP_RESULT_FILE:-}"

if [[ -z "$BACKUP_ENVIRONMENT" ]]; then
  echo "BACKUP_ENVIRONMENT is required (development, test, or production)." >&2
  exit 2
fi
if [[ -z "$BACKUP_CONTAINER" ]]; then
  echo "BACKUP_CONTAINER is required." >&2
  exit 2
fi
if [[ -z "$BACKUP_DIRECTORY" ]]; then
  echo "BACKUP_DIRECTORY is required." >&2
  exit 2
fi

normalized_environment="$(printf '%s' "$BACKUP_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')"
case "$normalized_environment" in
  development|dev|local) BACKUP_ENVIRONMENT="development" ;;
  test|testing|ci) BACKUP_ENVIRONMENT="test" ;;
  production|prod) BACKUP_ENVIRONMENT="production" ;;
  *)
    echo "BACKUP_ENVIRONMENT must explicitly identify development, test, or production." >&2
    exit 2
    ;;
esac

if ! [[ "$BACKUP_RETENTION_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_COUNT must be an integer >= 1." >&2
  exit 2
fi
if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be an integer >= 1." >&2
  exit 2
fi

mkdir -p "$BACKUP_DIRECTORY"
BACKUP_DIRECTORY="$(cd "$BACKUP_DIRECTORY" && pwd)"
if [[ -n "$BACKUP_RESULT_FILE" ]]; then
  mkdir -p "$(dirname "$BACKUP_RESULT_FILE")"
  rm -f "$BACKUP_RESULT_FILE"
fi

source_db="$(docker exec "$BACKUP_CONTAINER" sh -c 'printf "%s" "${DATABASE_PATH:-}"')"
if [[ -z "$source_db" ]]; then
  echo "Cannot create backup: $BACKUP_CONTAINER does not declare DATABASE_PATH." >&2
  exit 2
fi

created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="app-${stamp}"
target="$BACKUP_DIRECTORY/${base}.db"
sequence=1
while [[ -e "$target" || -e "${target}.manifest.json" ]]; do
  target="$BACKUP_DIRECTORY/${base}-${sequence}.db"
  sequence=$((sequence + 1))
done
manifest="${target}.manifest.json"
partial="${target}.partial-$$"
container_tmp="/tmp/ers-backup-$$.db"
committed=0

cleanup() {
  status=$?
  trap - EXIT INT TERM
  docker exec "$BACKUP_CONTAINER" rm -f "$container_tmp" "${container_tmp}-wal" "${container_tmp}-shm" >/dev/null 2>&1 || true
  rm -f "$partial"
  if [[ $status -ne 0 && $committed -eq 0 ]]; then
    rm -f "$target" "$manifest"
  fi
  return "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# SQLite's online backup API produces a transactionally consistent snapshot of
# a live WAL/rollback-journal database without copying mutable sidecar files.
docker exec "$BACKUP_CONTAINER" rm -f "$container_tmp" "${container_tmp}-wal" "${container_tmp}-shm"
docker exec "$BACKUP_CONTAINER" sqlite3 "$source_db" ".backup '$container_tmp'"

integrity="$(docker exec "$BACKUP_CONTAINER" sqlite3 "$container_tmp" 'PRAGMA integrity_check;')"
if [[ "$integrity" != "ok" ]]; then
  echo "Backup integrity_check failed inside $BACKUP_CONTAINER: $integrity" >&2
  exit 1
fi
foreign_keys="$(docker exec "$BACKUP_CONTAINER" sqlite3 "$container_tmp" 'PRAGMA foreign_key_check;')"
if [[ -n "$foreign_keys" ]]; then
  echo "Backup foreign_key_check failed inside $BACKUP_CONTAINER:" >&2
  printf '%s\n' "$foreign_keys" >&2
  exit 1
fi

docker cp "$BACKUP_CONTAINER:$container_tmp" "$partial"
mv "$partial" "$target"

python3 "$ROOT_DIR/scripts/ers-backup.py" create-manifest \
  --backup "$target" \
  --manifest "$manifest" \
  --environment "$BACKUP_ENVIRONMENT" \
  --source-container "$BACKUP_CONTAINER" \
  --source-database-path "$source_db" \
  --created-at "$created_at"

# A successful create-manifest already re-verifies the host copy. Mark the pair
# committed before retention: if pruning fails, keep the newly verified backup
# and fail the command so the operator can investigate without losing evidence.
committed=1

python3 "$ROOT_DIR/scripts/ers-backup.py" prune \
  --directory "$BACKUP_DIRECTORY" \
  --retention-count "$BACKUP_RETENTION_COUNT" \
  --retention-days "$BACKUP_RETENTION_DAYS"

if [[ -n "$BACKUP_RESULT_FILE" ]]; then
  result_tmp="${BACKUP_RESULT_FILE}.tmp-$$"
  printf '%s\n' "$target" > "$result_tmp"
  mv -f "$result_tmp" "$BACKUP_RESULT_FILE"
fi

echo "Verified backup: $target"
echo "Backup manifest: $manifest"
echo "Source database: $source_db"
echo "Retention policy: keep at least $BACKUP_RETENTION_COUNT verified backup(s) and all verified backups from the last $BACKUP_RETENTION_DAYS day(s)."
