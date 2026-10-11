#!/usr/bin/env sh
set -eu

DB_PATH="${DATABASE_PATH:-/app/data/app.db}"
AUTO_MIGRATE="$(printf '%s' "${APP_AUTO_MIGRATE:-false}" | tr '[:upper:]' '[:lower:]')"

mkdir -p "$(dirname "$DB_PATH")"

case "$AUTO_MIGRATE" in
  1|true|yes|on)
    echo "APP_AUTO_MIGRATE=true: applying SQL migrations before API startup."
    DATABASE_PATH="$DB_PATH" /app/apply-sql-migrations.sh
    ;;
  0|false|no|off|'')
    echo "APP_AUTO_MIGRATE=false: refusing implicit schema mutation; verifying deployed database before API startup."
    DATABASE_PATH="$DB_PATH" /app/verify-migrated-db.sh
    ;;
  *)
    echo "APP_AUTO_MIGRATE must be a boolean value; got: ${APP_AUTO_MIGRATE:-}" >&2
    exit 2
    ;;
esac

echo "Starting API..."
exec /app/enterprise-remote-systems-api
