#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATASET_DIR="${DATASET_DIR:-${ROOT_DIR}/backend/testdata/datasets}"
DATASET="${DATASET:-all}"
MODE="${1:-local}"
ENVIRONMENT="${ENV:-development}"
DB_PATH="${DB_PATH:-${DATABASE_PATH:-${ROOT_DIR}/backend/data/app.db}}"

usage() {
  cat <<USAGE
Usage:
  scripts/testdata-reset.sh local
  ENV=development scripts/testdata-reset.sh server
  ENV=test scripts/testdata-reset.sh server

Environment variables:
  DATASET=all|<dataset-name-without-.sql>   Default: all
  DB_PATH=<path>                            Local SQLite database path
  SERVER_ROOT=<path>                        Server repo root, default /opt/EnterpriseRemoteSystems

This script is destructive. It resets the selected local/dev/test database,
applies migrations, and loads resettable ERS test data. Production is refused.
USAGE
}

require_sqlite3() {
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "❌ sqlite3 is not installed or not on PATH."
    exit 1
  fi
}

selected_datasets() {
  shopt -s nullglob
  if [[ "$DATASET" == "all" ]]; then
    local files=("$DATASET_DIR"/*.sql)
  else
    local files=("$DATASET_DIR/${DATASET}.sql")
  fi
  shopt -u nullglob

  if [[ ${#files[@]} -eq 0 ]]; then
    echo "❌ No dataset SQL files found for DATASET=${DATASET} in ${DATASET_DIR}."
    exit 1
  fi

  printf '%s\n' "${files[@]}"
}

apply_datasets_to_local_db() {
  local db_path="$1"
  while IFS= read -r sql_file; do
    echo "Applying test dataset: ${sql_file}"
    sqlite3 "$db_path" < "$sql_file"
  done < <(selected_datasets)
}

reset_local() {
  require_sqlite3
  echo "Resetting local database: ${DB_PATH}"
  rm -f "$DB_PATH"
  mkdir -p "$(dirname "$DB_PATH")"

  DB_PATH="$DB_PATH" "${ROOT_DIR}/scripts/db-migrate.sh"
  apply_datasets_to_local_db "$DB_PATH"

  echo
  echo "✅ Local test database reset and seeded."
  echo
  sqlite3 "$DB_PATH" <<'SQL'
.headers on
.mode column
SELECT cj.id AS collaborator_id, p.nickname, cj.notes
FROM collaborator_journeys cj
JOIN people p ON p.id = cj.person_id
WHERE cj.id LIKE 'ers-testdata-collab-%'
ORDER BY cj.id;
SQL
}

reset_server() {
  if [[ "$ENVIRONMENT" == "production" || "$ENVIRONMENT" == "prod" ]]; then
    echo "❌ Refusing to reset production test data. Use local, development, or test only."
    exit 1
  fi

  if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "test" ]]; then
    echo "❌ Server test-data reset supports ENV=development or ENV=test. Got ENV=${ENVIRONMENT}."
    exit 1
  fi

  local server_root="${SERVER_ROOT:-/opt/EnterpriseRemoteSystems}"
  local env_dir
  local compose_project
  local container_prefix

  case "$ENVIRONMENT" in
    development)
      env_dir="${server_root}/development"
      compose_project="ers-dev"
      container_prefix="ers-dev"
      ;;
    test)
      env_dir="${server_root}/test"
      compose_project="ers-tst"
      container_prefix="ers-tst"
      ;;
  esac

  if [[ ! -d "$env_dir" ]]; then
    echo "❌ Missing environment directory: ${env_dir}"
    exit 1
  fi

  echo "Resetting ${ENVIRONMENT} server database volume and loading test data."
  echo "Environment directory: ${env_dir}"

  (
    cd "$env_dir"
    docker compose -p "$compose_project" --env-file ".env.${ENVIRONMENT/test/test}" -f docker-compose.server.yml down
    docker volume rm "${compose_project}_backend-data" >/dev/null 2>&1 || true
    docker compose -p "$compose_project" --env-file ".env.${ENVIRONMENT/test/test}" -f docker-compose.server.yml up -d --build
  )

  local backend_container="${container_prefix}-backend"
  echo "Waiting for ${backend_container} to become healthy..."
  for _ in $(seq 1 60); do
    if docker exec "$backend_container" curl -fsS http://localhost:8080/api/v1/healthz >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  docker exec "$backend_container" curl -fsS http://localhost:8080/api/v1/healthz >/dev/null

  while IFS= read -r sql_file; do
    local remote_file="/tmp/$(basename "$sql_file")"
    echo "Applying test dataset to ${backend_container}: ${sql_file}"
    docker cp "$sql_file" "${backend_container}:${remote_file}"
    docker exec "$backend_container" sh -lc "sqlite3 /app/data/app.db < '${remote_file}'"
  done < <(selected_datasets)

  echo
  echo "✅ ${ENVIRONMENT} server test database reset and seeded."
}

case "$MODE" in
  local)
    reset_local
    ;;
  server)
    reset_server
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "❌ Unknown mode: ${MODE}"
    usage
    exit 1
    ;;
esac
