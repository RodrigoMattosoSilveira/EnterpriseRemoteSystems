#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"
cd "${BACKEND_DIR}"

export PORT="${PORT:-8080}"
export DATABASE_PATH="${DATABASE_PATH:-data/app.db}"
export DEV_SEED_ADMIN="${DEV_SEED_ADMIN:-true}"
export DEV_ADMIN_EMAIL="${DEV_ADMIN_EMAIL:-admin@example.com}"
export DEV_ADMIN_PASSWORD="${DEV_ADMIN_PASSWORD:-admin123}"
export DEV_ADMIN_NAME="${DEV_ADMIN_NAME:-Admin User}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}"
export JWT_ISSUER="${JWT_ISSUER:-call-it-cure-it}"
export JWT_EXPIRATION_MINUTES="${JWT_EXPIRATION_MINUTES:-480}"
export LLM_COACHING_ENABLED="${LLM_COACHING_ENABLED:-false}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export OPENAI_MODEL="${OPENAI_MODEL:-gpt-5.1-mini}"
export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
export OPENAI_TIMEOUT_SECONDS="${OPENAI_TIMEOUT_SECONDS:-20}"
export CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-http://localhost:5173,http://127.0.0.1:5173,http://192.168.2.154:5173}"

mkdir -p data

go run ./cmd/api