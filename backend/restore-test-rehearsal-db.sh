#!/usr/bin/env sh
set -eu

ENVIRONMENT="${APP_ENV:-}"
SOURCE_DB="${REHEARSAL_BASELINE_DB:-/rehearsal-baseline/pre-bite30h.db}"
DB_PATH="${DATABASE_PATH:-/app/data/app.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
EXPECTED_LAST_MIGRATION="${EXPECTED_LAST_MIGRATION:-000061_expand_final_settlement_database_checks.up.sql}"
FORBIDDEN_MIGRATION="${FORBIDDEN_MIGRATION:-000062_tenant_administrator_cardinality.up.sql}"
TMP_DB="${DB_PATH}.rehearsal.$$"

if [ "$ENVIRONMENT" != "test" ]; then
  echo "Refusing release-rehearsal restore for APP_ENV=${ENVIRONMENT:-unset}. Only Test may restore a release baseline." >&2
  exit 2
fi

if [ ! -f "$SOURCE_DB" ]; then
  echo "Missing Test release-rehearsal baseline: $SOURCE_DB" >&2
  exit 2
fi
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Missing migrations directory: $MIGRATIONS_DIR" >&2
  exit 2
fi

mkdir -p "$(dirname "$DB_PATH")"
rm -f "$TMP_DB" "$TMP_DB-wal" "$TMP_DB-shm"

cleanup() {
  rm -f "$TMP_DB" "$TMP_DB-wal" "$TMP_DB-shm"
}
trap cleanup EXIT INT TERM

cp "$SOURCE_DB" "$TMP_DB"

integrity="$(sqlite3 "$TMP_DB" "PRAGMA integrity_check;")"
if [ "$integrity" != "ok" ]; then
  echo "Test release baseline integrity_check failed: ${integrity}" >&2
  exit 1
fi

foreign_key_violations="$(sqlite3 "$TMP_DB" "PRAGMA foreign_key_check;")"
if [ -n "$foreign_key_violations" ]; then
  echo "Test release baseline foreign_key_check failed:" >&2
  printf '%s\n' "$foreign_key_violations" >&2
  exit 1
fi

has_schema_migrations="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations';")"
if [ "$has_schema_migrations" != "1" ]; then
  echo "Test release baseline does not contain schema_migrations." >&2
  exit 1
fi

expected_seen=0
expected_count=0
expected_list=""
for migration in "$MIGRATIONS_DIR"/*.up.sql; do
  filename="$(basename "$migration")"
  expected_count=$((expected_count + 1))
  if [ -z "$expected_list" ]; then
    expected_list="$filename"
  else
    expected_list="${expected_list}
${filename}"
  fi
  if [ "$filename" = "$EXPECTED_LAST_MIGRATION" ]; then
    expected_seen=1
    break
  fi
done

if [ "$expected_seen" != "1" ]; then
  echo "Expected last pre-release migration is not present in repository: $EXPECTED_LAST_MIGRATION" >&2
  exit 2
fi

actual_list="$(sqlite3 "$TMP_DB" "SELECT filename FROM schema_migrations WHERE filename <= '$EXPECTED_LAST_MIGRATION' ORDER BY filename;")"
if [ "$actual_list" != "$expected_list" ]; then
  echo "Test release baseline migration history does not exactly match the repository through ${EXPECTED_LAST_MIGRATION}." >&2
  echo "Expected:" >&2
  printf '%s\n' "$expected_list" >&2
  echo "Actual:" >&2
  printf '%s\n' "$actual_list" >&2
  exit 1
fi

forbidden_present="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$FORBIDDEN_MIGRATION';")"
if [ "$forbidden_present" != "0" ]; then
  echo "Test release baseline already contains the migration under rehearsal: $FORBIDDEN_MIGRATION" >&2
  exit 1
fi

newer_count="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM schema_migrations WHERE filename > '$EXPECTED_LAST_MIGRATION';")"
if [ "$newer_count" != "0" ]; then
  echo "Test release baseline contains migrations newer than ${EXPECTED_LAST_MIGRATION}; it is not the expected pre-release baseline." >&2
  exit 1
fi

baseline_sha256="$(sha256sum "$SOURCE_DB" | awk '{print $1}')"
rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
mv "$TMP_DB" "$DB_PATH"
trap - EXIT INT TERM

printf '%s\n' \
  "Test release-rehearsal baseline restored." \
  "Baseline: ${SOURCE_DB}" \
  "Baseline SHA-256: ${baseline_sha256}" \
  "Expected last migration: ${EXPECTED_LAST_MIGRATION}" \
  "Migration under rehearsal: ${FORBIDDEN_MIGRATION}" \
  "Pre-release migrations validated: ${expected_count}" \
  "Integrity check: ok" \
  "Foreign key check: clean" \
  "The normal Test backend startup must now migrate this database in place."
