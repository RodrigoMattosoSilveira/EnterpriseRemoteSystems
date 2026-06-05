#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

cd "${PROJECT_ROOT}"

if [[ ! -f "backend/.env" ]]; then
  ./scripts/render-env.sh dev backend/.env
fi

set -a
source backend/.env
set +a

# ERS_DATABASE_PATH is intentionally checked after sourcing backend/.env so
# Playwright and other local commands can override the generated dotenv file.
EFFECTIVE_DATABASE_PATH="${ERS_DATABASE_PATH:-${DB_PATH:-${DATABASE_PATH:-data/app.db}}}"
export DATABASE_PATH="$EFFECTIVE_DATABASE_PATH"
export DB_PATH="$EFFECTIVE_DATABASE_PATH"

if [[ "${ERS_RESET_DATABASE:-false}" == "true" ]]; then
  echo "Resetting local backend database: ${DATABASE_PATH}"
  rm -f "${BACKEND_DIR}/${DATABASE_PATH}"
fi

DB_PATH="${BACKEND_DIR}/${DATABASE_PATH}" \
MIGRATIONS_DIR="${BACKEND_DIR}/migrations" \
  ./scripts/db-migrate.sh

cd "${BACKEND_DIR}"

mkdir -p data

# Runtime schema changes are disabled by default. SQL migrations above own
# local/dev/prod schema creation. Set APP_AUTO_MIGRATE=true only for explicit
# local experiments.
export APP_AUTO_MIGRATE="${APP_AUTO_MIGRATE:-false}"

echo "Starting backend..."
echo "APP_ENV=${APP_ENV:-dev}"
echo "PORT=${PORT:-8080}"
echo "DATABASE_PATH=${DATABASE_PATH}"
echo "APP_AUTO_MIGRATE=${APP_AUTO_MIGRATE}"
echo "DEV_SEED_ADMIN=${DEV_SEED_ADMIN:-}"
echo "DEV_ADMIN_EMAIL=${DEV_ADMIN_EMAIL:-}"
echo "LLM_COACHING_ENABLED=${LLM_COACHING_ENABLED:-}"

go run ./cmd/api
