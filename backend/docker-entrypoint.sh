#!/usr/bin/env sh
set -eu

DB_PATH="${DATABASE_PATH:-/app/data/app.db}"

mkdir -p "$(dirname "$DB_PATH")"

echo "Preparing database at ${DB_PATH}..."

sqlite3 "$DB_PATH" "
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"

for migration in /app/migrations/*.up.sql; do
  filename="$(basename "$migration")"

  already_applied="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename';")"

  if [ "$already_applied" = "1" ]; then
    echo "Skipping already applied migration: ${filename}"
    continue
  fi

  echo "Applying migration: ${filename}"

  sqlite3 "$DB_PATH" < "$migration"

  sqlite3 "$DB_PATH" "INSERT INTO schema_migrations (filename) VALUES ('$filename');"
done

collaborator_availability_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('collaborator_journeys') WHERE name = 'planning_availability';")"
if [ "$collaborator_availability_count" = "0" ]; then
  echo "Repairing missing collaborator_journeys.planning_availability column..."
  sqlite3 "$DB_PATH" "
    ALTER TABLE collaborator_journeys
      ADD COLUMN planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (planning_availability IN ('ACTIVE', 'DAY_OFF', 'LEAVE_OF_ABSENCE'));
  "
fi

sqlite3 "$DB_PATH" "
  UPDATE collaborator_journeys
     SET planning_availability = 'ACTIVE'
   WHERE planning_availability IS NULL OR planning_availability = '';
"

echo "Starting API..."
exec /app/enterprise-remote-systems-api