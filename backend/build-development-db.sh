#!/usr/bin/env sh
set -eu

ENVIRONMENT="${APP_ENV:-development}"
DB_PATH="${DATABASE_PATH:-/app/data/app.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
TMP_DB="${DB_PATH}.building.$$"

if [ "$ENVIRONMENT" != "development" ]; then
  echo "Refusing disposable database build for APP_ENV=${ENVIRONMENT}. Only Development is replaced on deployment." >&2
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

sqlite3 "$TMP_DB" "
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
"

migration_count=0
for migration in "$MIGRATIONS_DIR"/*.up.sql; do
  if [ ! -f "$migration" ]; then
    echo "No .up.sql migrations found in: $MIGRATIONS_DIR" >&2
    exit 2
  fi

  filename="$(basename "$migration")"
  echo "Applying migration to fresh Development database: ${filename}"
  # Match the established runtime/local migration contract: execute each
  # migration file in its own sqlite3 invocation, then record it only after
  # that invocation succeeds. Some historical migration files rely on EOF to
  # terminate their final statement and therefore must not have bookkeeping SQL
  # concatenated onto the same input stream.
  sqlite3 -bail "$TMP_DB" < "$migration"
  sqlite3 -bail "$TMP_DB" "INSERT INTO schema_migrations (filename) VALUES ('$filename');"
  migration_count=$((migration_count + 1))
done

# Keep parity with the runtime/local migration compatibility repair.
collaborator_availability_count="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM pragma_table_info('collaborator_journeys') WHERE name = 'planning_availability';")"
if [ "$collaborator_availability_count" = "0" ]; then
  echo "Repairing missing collaborator_journeys.planning_availability column..."
  sqlite3 -bail "$TMP_DB" "
    ALTER TABLE collaborator_journeys
      ADD COLUMN planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (planning_availability IN ('ACTIVE', 'DAY_OFF', 'LEAVE_OF_ABSENCE'));
  "
fi

sqlite3 -bail "$TMP_DB" "
  UPDATE collaborator_journeys
     SET planning_availability = 'ACTIVE'
   WHERE planning_availability IS NULL OR planning_availability = '';
"

applied_count="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM schema_migrations;")"
if [ "$applied_count" -ne "$migration_count" ]; then
  echo "Development database migration validation failed: expected ${migration_count}, found ${applied_count}." >&2
  exit 1
fi

integrity="$(sqlite3 "$TMP_DB" "PRAGMA integrity_check;")"
if [ "$integrity" != "ok" ]; then
  echo "Development database integrity_check failed: ${integrity}" >&2
  exit 1
fi

foreign_key_violations="$(sqlite3 "$TMP_DB" "PRAGMA foreign_key_check;")"
if [ -n "$foreign_key_violations" ]; then
  echo "Development database foreign_key_check failed:" >&2
  printf '%s\n' "$foreign_key_violations" >&2
  exit 1
fi

rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
mv "$TMP_DB" "$DB_PATH"
trap - EXIT INT TERM

printf '%s\n' \
  "Fresh Development database is ready." \
  "Database: ${DB_PATH}" \
  "Applied migrations: ${migration_count}" \
  "Integrity check: ok" \
  "Foreign key check: clean"
