#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${DB_PATH:-${ROOT_DIR}/backend/data/app.db}"
MIGRATIONS_DIR="${ROOT_DIR}/backend/migrations"

mkdir -p "$(dirname "$DB_PATH")"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "❌ sqlite3 is not installed or not on PATH."
  exit 1
fi

echo "Applying migrations to: $DB_PATH"
echo

migrations=(
  "000001_init_schema.up.sql"
  "000002_seed_reference_data.up.sql"
  "000003_create_sessions.up.sql"
  "000004_create_trainee_actions.up.sql"
  "000005_create_action_evaluations.up.sql"
  "000006_create_session_scores.up.sql"
  "000007_create_users.up.sql"
  "000008_seed_more_scenarios.up.sql"
)

for migration in "${migrations[@]}"; do
  path="${MIGRATIONS_DIR}/${migration}"

  if [[ ! -f "$path" ]]; then
    echo "❌ Missing migration: $path"
    exit 1
  fi

  echo "→ Applying $migration"
  sqlite3 "$DB_PATH" < "$path"
done

echo
echo "✅ Migrations applied."
echo
echo "Tables:"
sqlite3 "$DB_PATH" ".tables"