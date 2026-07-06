#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DB_PATH:-${DATABASE_PATH:-${ROOT_DIR}/backend/data/app.db}}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${ROOT_DIR}/backend/migrations}"

mkdir -p "$(dirname "$DB_PATH")"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "❌ sqlite3 is not installed or not on PATH."
  exit 1
fi

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "❌ Missing migrations directory: $MIGRATIONS_DIR"
  exit 1
fi

echo "Applying migrations to: $DB_PATH"
echo

sqlite3 "$DB_PATH" "
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
"

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.up.sql)
shopt -u nullglob

if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "❌ No .up.sql migrations found in: $MIGRATIONS_DIR"
  exit 1
fi

for path in "${migrations[@]}"; do
  filename="$(basename "$path")"
  already_applied="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename = '$filename';")"

  if [[ "$already_applied" == "1" ]]; then
    echo "Skipping already applied migration: $filename"
    continue
  fi

  echo "Applying migration: $filename"
  sqlite3 "$DB_PATH" < "$path"
  sqlite3 "$DB_PATH" "INSERT INTO schema_migrations (filename) VALUES ('$filename');"
done

collaborator_availability_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('collaborator_journeys') WHERE name = 'planning_availability';")"
if [[ "$collaborator_availability_count" == "0" ]]; then
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

echo
echo "✅ Migrations applied."
echo
sqlite3 "$DB_PATH" ".tables"
