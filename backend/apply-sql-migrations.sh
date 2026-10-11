#!/usr/bin/env sh
set -eu

DB_PATH="${DATABASE_PATH:-/app/data/app.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
EXPECTED_FINAL_MIGRATION="${EXPECTED_FINAL_MIGRATION:-}"

mkdir -p "$(dirname "$DB_PATH")"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Missing migrations directory: $MIGRATIONS_DIR" >&2
  exit 2
fi
if [ -z "$EXPECTED_FINAL_MIGRATION" ]; then
  latest_migration="$(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.up.sql' | sort | tail -n 1)"
  if [ -z "$latest_migration" ]; then
    echo "No .up.sql migrations found in: $MIGRATIONS_DIR" >&2
    exit 2
  fi
  EXPECTED_FINAL_MIGRATION="$(basename "$latest_migration")"
fi

sqlite3 -bail "$DB_PATH" "
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
"

expected_final_seen=0
for migration in "$MIGRATIONS_DIR"/*.up.sql; do
  [ -f "$migration" ] || continue
  filename="$(basename "$migration")"
  already_applied="$(sqlite3 -bail "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename';")"

  if [ "$already_applied" = "1" ]; then
    echo "Skipping already applied migration: $filename"
  else
    echo "Applying migration: $filename"
    sqlite3 -bail "$DB_PATH" < "$migration"
    escaped_filename="$(printf '%s' "$filename" | sed "s/'/''/g")"
    sqlite3 -bail "$DB_PATH" "INSERT OR IGNORE INTO schema_migrations(filename) VALUES ('$escaped_filename');"
  fi

  if [ "$filename" = "$EXPECTED_FINAL_MIGRATION" ]; then
    expected_final_seen=1
    break
  fi
done

if [ "$expected_final_seen" != "1" ]; then
  echo "Expected final migration is not present in the repository: $EXPECTED_FINAL_MIGRATION" >&2
  exit 2
fi

final_count="$(sqlite3 -bail "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename='$EXPECTED_FINAL_MIGRATION';")"
if [ "$final_count" != "1" ]; then
  echo "Expected final migration was not recorded exactly once: $EXPECTED_FINAL_MIGRATION" >&2
  exit 1
fi

# Preserve the established repair that predates explicit migration ownership.
collaborator_availability_count="$(sqlite3 -bail "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('collaborator_journeys') WHERE name = 'planning_availability';")"
if [ "$collaborator_availability_count" = "0" ]; then
  echo "Repairing missing collaborator_journeys.planning_availability column..."
  sqlite3 -bail "$DB_PATH" "
    ALTER TABLE collaborator_journeys
      ADD COLUMN planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (planning_availability IN ('ACTIVE', 'DAY_OFF', 'LEAVE_OF_ABSENCE'));
  "
fi

sqlite3 -bail "$DB_PATH" "
  UPDATE collaborator_journeys
     SET planning_availability = 'ACTIVE'
   WHERE planning_availability IS NULL OR planning_availability = '';
"

integrity="$(sqlite3 -bail "$DB_PATH" 'PRAGMA integrity_check;')"
if [ "$integrity" != "ok" ]; then
  echo "Migrated database integrity_check failed: $integrity" >&2
  exit 1
fi

foreign_keys="$(sqlite3 -bail "$DB_PATH" 'PRAGMA foreign_key_check;')"
if [ -n "$foreign_keys" ]; then
  echo "Migrated database foreign_key_check failed:" >&2
  printf '%s\n' "$foreign_keys" >&2
  exit 1
fi

latest="$(sqlite3 -bail "$DB_PATH" 'SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1;')"
echo "SQL migrations applied and verified."
echo "Database: $DB_PATH"
echo "Latest migration: $latest"
