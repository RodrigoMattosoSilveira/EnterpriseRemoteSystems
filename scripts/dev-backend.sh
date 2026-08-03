#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

cd "${PROJECT_ROOT}"

# Preserve explicit command-level runtime overrides across dotenv loading.
# Local Playwright uses these values to start an isolated test backend even when
# the developer's backend/.env contains normal local-development settings.
EXPLICIT_HTTP_ADDR="${HTTP_ADDR:-}"
EXPLICIT_APP_ENV="${APP_ENV:-}"
EXPLICIT_ERS_DATABASE_PATH="${ERS_DATABASE_PATH:-}"
EXPLICIT_ERS_RESET_DATABASE="${ERS_RESET_DATABASE:-}"
EXPLICIT_AUTHZ_ACTOR_HEADER_MODE="${AUTHZ_ACTOR_HEADER_MODE:-}"
EXPLICIT_AUTHZ_BOOTSTRAP_ENABLED="${AUTHZ_BOOTSTRAP_ENABLED:-}"
EXPLICIT_AUTHZ_BOOTSTRAP_ACTOR_KEY="${AUTHZ_BOOTSTRAP_ACTOR_KEY:-}"
EXPLICIT_AUTHZ_BOOTSTRAP_DISPLAY_NAME="${AUTHZ_BOOTSTRAP_DISPLAY_NAME:-}"
EXPLICIT_AUTHZ_BOOTSTRAP_ROLE_CODE="${AUTHZ_BOOTSTRAP_ROLE_CODE:-}"
EXPLICIT_AUTHZ_BOOTSTRAP_TENANT_ID="${AUTHZ_BOOTSTRAP_TENANT_ID:-}"
EXPLICIT_AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE="${AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE:-}"

if [[ ! -f "backend/.env" ]]; then
  ./scripts/render-env.sh dev backend/.env
fi

set -a
source backend/.env
set +a

if [[ -n "${EXPLICIT_HTTP_ADDR}" ]]; then
  export HTTP_ADDR="${EXPLICIT_HTTP_ADDR}"
fi
if [[ -n "${EXPLICIT_APP_ENV}" ]]; then
  export APP_ENV="${EXPLICIT_APP_ENV}"
fi
if [[ -n "${EXPLICIT_ERS_DATABASE_PATH}" ]]; then
  export ERS_DATABASE_PATH="${EXPLICIT_ERS_DATABASE_PATH}"
fi
if [[ -n "${EXPLICIT_ERS_RESET_DATABASE}" ]]; then
  export ERS_RESET_DATABASE="${EXPLICIT_ERS_RESET_DATABASE}"
fi
if [[ -n "${EXPLICIT_AUTHZ_ACTOR_HEADER_MODE}" ]]; then
  export AUTHZ_ACTOR_HEADER_MODE="${EXPLICIT_AUTHZ_ACTOR_HEADER_MODE}"
fi
if [[ -n "${EXPLICIT_AUTHZ_BOOTSTRAP_ENABLED}" ]]; then
  export AUTHZ_BOOTSTRAP_ENABLED="${EXPLICIT_AUTHZ_BOOTSTRAP_ENABLED}"
fi
if [[ -n "${EXPLICIT_AUTHZ_BOOTSTRAP_ACTOR_KEY}" ]]; then
  export AUTHZ_BOOTSTRAP_ACTOR_KEY="${EXPLICIT_AUTHZ_BOOTSTRAP_ACTOR_KEY}"
fi
if [[ -n "${EXPLICIT_AUTHZ_BOOTSTRAP_DISPLAY_NAME}" ]]; then
  export AUTHZ_BOOTSTRAP_DISPLAY_NAME="${EXPLICIT_AUTHZ_BOOTSTRAP_DISPLAY_NAME}"
fi
if [[ -n "${EXPLICIT_AUTHZ_BOOTSTRAP_ROLE_CODE}" ]]; then
  export AUTHZ_BOOTSTRAP_ROLE_CODE="${EXPLICIT_AUTHZ_BOOTSTRAP_ROLE_CODE}"
fi
if [[ -n "${EXPLICIT_AUTHZ_BOOTSTRAP_TENANT_ID}" ]]; then
  export AUTHZ_BOOTSTRAP_TENANT_ID="${EXPLICIT_AUTHZ_BOOTSTRAP_TENANT_ID}"
fi
if [[ -n "${EXPLICIT_AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE}" ]]; then
  export AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE="${EXPLICIT_AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE}"
fi

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

# Local browser development uses a persisted bootstrap actor until the real
# authenticated session layer is wired in. The frontend sends only the actor
# key and tenant; permissions are always loaded from persisted role grants.
export AUTHZ_BOOTSTRAP_ENABLED="${AUTHZ_BOOTSTRAP_ENABLED:-true}"
export AUTHZ_BOOTSTRAP_ACTOR_KEY="${AUTHZ_BOOTSTRAP_ACTOR_KEY:-bootstrap-admin}"
export AUTHZ_BOOTSTRAP_DISPLAY_NAME="${AUTHZ_BOOTSTRAP_DISPLAY_NAME:-Bootstrap Admin}"
export AUTHZ_BOOTSTRAP_ROLE_CODE="${AUTHZ_BOOTSTRAP_ROLE_CODE:-APPLICATION_ADMIN}"
export AUTHZ_BOOTSTRAP_TENANT_ID="${AUTHZ_BOOTSTRAP_TENANT_ID:-*}"
export AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE="${AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE:-false}"
export AUTHZ_ACTOR_HEADER_MODE="${AUTHZ_ACTOR_HEADER_MODE:-bootstrap}"

echo "Starting backend..."
echo "APP_ENV=${APP_ENV:-dev}"
echo "HTTP_ADDR=${HTTP_ADDR:-:8080}"
echo "DATABASE_PATH=${DATABASE_PATH}"
echo "APP_AUTO_MIGRATE=${APP_AUTO_MIGRATE}"
echo "DEV_SEED_ADMIN=${DEV_SEED_ADMIN:-}"
echo "DEV_ADMIN_EMAIL=${DEV_ADMIN_EMAIL:-}"
echo "LLM_COACHING_ENABLED=${LLM_COACHING_ENABLED:-}"

go run ./cmd/api
