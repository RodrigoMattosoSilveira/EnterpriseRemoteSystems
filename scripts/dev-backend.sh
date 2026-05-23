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

cd "${BACKEND_DIR}"

mkdir -p data

echo "Starting backend..."
echo "APP_ENV=${APP_ENV:-dev}"
echo "PORT=${PORT:-8080}"
echo "DATABASE_PATH=${DATABASE_PATH:-data/app.db}"
echo "DEV_SEED_ADMIN=${DEV_SEED_ADMIN:-}"
echo "DEV_ADMIN_EMAIL=${DEV_ADMIN_EMAIL:-}"
echo "LLM_COACHING_ENABLED=${LLM_COACHING_ENABLED:-}"

go run ./cmd/api
