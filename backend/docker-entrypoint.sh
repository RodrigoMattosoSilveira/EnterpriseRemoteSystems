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

echo "Starting API..."
exec /app/enterprise-remote-systems-api