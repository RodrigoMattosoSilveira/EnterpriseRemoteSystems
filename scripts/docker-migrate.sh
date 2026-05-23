#!/usr/bin/env bash
set -euo pipefail

SERVICE="${SERVICE:-backend}"
DB_PATH="${DATABASE_PATH:-/app/data/app.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"

docker compose exec "$SERVICE" sh -lc "
  set -e
  mkdir -p \"\$(dirname '$DB_PATH')\"

  for migration in \
    000001_init_schema.up.sql \
    000002_seed_reference_data.up.sql \
    000003_create_sessions.up.sql \
    000004_create_trainee_actions.up.sql \
    000005_create_action_evaluations.up.sql \
    000006_create_session_scores.up.sql \
    000007_create_users.up.sql \
    000008_seed_more_scenarios.up.sql
  do
    echo \"→ Applying \$migration\"
    sqlite3 '$DB_PATH' < '$MIGRATIONS_DIR/'\"\$migration\"
  done

  echo
  echo '✅ Container database migrations applied.'
  sqlite3 '$DB_PATH' '.tables'
"