#!/usr/bin/env bash
set -euo pipefail

BACKEND_ENV="backend/.env"
FRONTEND_ENV="frontend/.env"
mkdir -p backend frontend
touch "$BACKEND_ENV" "$FRONTEND_ENV"

set_or_update_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"
  if grep -qE "^[[:space:]]*${key}=" "$file"; then
    sed -i.bak -E "s|^[[:space:]]*${key}=.*|${key}=${escaped_value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
  rm -f "${file}.bak"
}

set_or_update_env "$BACKEND_ENV" "APP_ENV" "local"
set_or_update_env "$BACKEND_ENV" "PORT" "8080"
set_or_update_env "$BACKEND_ENV" "DATABASE_PATH" "data/app.db"
set_or_update_env "$BACKEND_ENV" "JWT_SECRET" "dev-secret-change-me"
set_or_update_env "$BACKEND_ENV" "JWT_ISSUER" "enterprise-remote-systems"
set_or_update_env "$BACKEND_ENV" "JWT_EXPIRATION_MINUTES" "480"
set_or_update_env "$BACKEND_ENV" "DEV_SEED_ADMIN" "true"
set_or_update_env "$BACKEND_ENV" "DEV_ADMIN_EMAIL" "admin@example.com"
set_or_update_env "$BACKEND_ENV" "DEV_ADMIN_PASSWORD" "admin123"
set_or_update_env "$BACKEND_ENV" "DEV_ADMIN_NAME" "Admin User"
set_or_update_env "$BACKEND_ENV" "LLM_COACHING_ENABLED" "false"
set_or_update_env "$BACKEND_ENV" "OPENAI_API_KEY" ""
set_or_update_env "$BACKEND_ENV" "OPENAI_MODEL" "gpt-5.1-mini"
set_or_update_env "$BACKEND_ENV" "OPENAI_BASE_URL" "https://api.openai.com/v1"
set_or_update_env "$BACKEND_ENV" "OPENAI_TIMEOUT_SECONDS" "20"
set_or_update_env "$BACKEND_ENV" "CORS_ALLOW_ORIGINS" "http://localhost:5173,http://127.0.0.1:5173,http://192.168.2.154:5173"
set_or_update_env "$FRONTEND_ENV" "VITE_API_BASE_URL" "/api/v1"

echo "Initialized local environment files."