#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"${ROOT_DIR}/scripts/ers-environment-guard.sh" require-non-production "${APP_ENV:-}" "database reset"
DB_PATH="${DB_PATH:-${ROOT_DIR}/backend/data/app.db}"

echo "Resetting database: $DB_PATH"

rm -f "$DB_PATH"
mkdir -p "$(dirname "$DB_PATH")"

"${ROOT_DIR}/scripts/db-migrate.sh"

echo
echo "✅ Database reset complete."

echo
echo "Seeded scenarios:"
sqlite3 "$DB_PATH" "SELECT id, title, status FROM scenarios ORDER BY title;"