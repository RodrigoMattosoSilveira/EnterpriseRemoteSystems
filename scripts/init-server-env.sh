#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-}"

if [[ -z "$ENV_NAME" ]]; then
  echo "Usage: $0 development|test|production"
  exit 1
fi

case "$ENV_NAME" in
  development)
    ENV_FILE=".env.development"
    APP_ENV="development"
    APP_DOMAIN="dev.enterpriseremotesystems.com"
    CONTAINER_PREFIX="ers-dev"
    JWT_ISSUER="enterprise-remote-systems-development"
    DEV_ADMIN_EMAIL="admin-dev@enterpriseremotesystems.com"
    DEV_ADMIN_NAME="Development Admin"
    ;;
  test)
    ENV_FILE=".env.test"
    APP_ENV="test"
    APP_DOMAIN="tst.enterpriseremotesystems.com"
    CONTAINER_PREFIX="ers-tst"
    JWT_ISSUER="enterprise-remote-systems-test"
    DEV_ADMIN_EMAIL="admin-tst@enterpriseremotesystems.com"
    DEV_ADMIN_NAME="Test Admin"
    ;;
  production)
    ENV_FILE=".env.production"
    APP_ENV="production"
    APP_DOMAIN="app.enterpriseremotesystems.com"
    CONTAINER_PREFIX="ers-prd"
    JWT_ISSUER="enterprise-remote-systems"
    DEV_ADMIN_EMAIL="admin@enterpriseremotesystems.com"
    DEV_ADMIN_NAME="Production Admin"
    ;;
  *)
    echo "Invalid environment: $ENV_NAME"
    echo "Usage: $0 development|test|production"
    exit 1
    ;;
esac

touch "$ENV_FILE"

set_or_update_env() {
  local key="$1"
  local value="$2"

  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"

  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
    sed -i.bak -E "s|^[[:space:]]*${key}=.*|${key}=${escaped_value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_or_update_env "APP_ENV" "$APP_ENV"
set_or_update_env "APP_DOMAIN" "$APP_DOMAIN"
set_or_update_env "CONTAINER_PREFIX" "$CONTAINER_PREFIX"

set_or_update_env "PORT" "8080"
set_or_update_env "DATABASE_PATH" "/app/data/app.db"

if ! grep -qE "^[[:space:]]*JWT_SECRET=.+" "$ENV_FILE"; then
  set_or_update_env "JWT_SECRET" "$(openssl rand -base64 48)"
fi

set_or_update_env "JWT_ISSUER" "$JWT_ISSUER"
set_or_update_env "JWT_EXPIRATION_MINUTES" "480"

set_or_update_env "DEV_SEED_ADMIN" "true"
set_or_update_env "DEV_ADMIN_EMAIL" "$DEV_ADMIN_EMAIL"
set_or_update_env "DEV_ADMIN_PASSWORD" "change-this-password-immediately"
set_or_update_env "DEV_ADMIN_NAME" "$DEV_ADMIN_NAME"

set_or_update_env "LLM_COACHING_ENABLED" "false"
set_or_update_env "OPENAI_API_KEY" ""
set_or_update_env "OPENAI_MODEL" "gpt-5.1-mini"
set_or_update_env "OPENAI_BASE_URL" "https://api.openai.com/v1"
set_or_update_env "OPENAI_TIMEOUT_SECONDS" "20"

set_or_update_env "CORS_ALLOW_ORIGINS" "https://${APP_DOMAIN}"

set_or_update_env "AUTHZ_BOOTSTRAP_ENABLED" "false"
set_or_update_env "AUTHZ_BOOTSTRAP_ACTOR_KEY" ""
set_or_update_env "AUTHZ_BOOTSTRAP_DISPLAY_NAME" ""
set_or_update_env "AUTHZ_BOOTSTRAP_ROLE_CODE" "APPLICATION_ADMIN"
set_or_update_env "AUTHZ_BOOTSTRAP_TENANT_ID" "*"
set_or_update_env "AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE" "false"

AUTHZ_ACTOR_HEADER_MODE="disabled"
if [[ "$APP_ENV" == "development" ]]; then
    AUTHZ_ACTOR_HEADER_MODE="bootstrap"
elif [[ "$APP_ENV" == "test" ]]; then
    AUTHZ_ACTOR_HEADER_MODE="test"
fi
set_or_update_env "AUTHZ_ACTOR_HEADER_MODE" "$AUTHZ_ACTOR_HEADER_MODE"

rm -f "${ENV_FILE}.bak"

echo "Created/updated ${ENV_FILE}"
echo
echo "IMPORTANT:"
echo "  1. Edit ${ENV_FILE}."
echo "  2. Set a strong DEV_ADMIN_PASSWORD."
echo "  3. For production, after first successful admin login, set DEV_SEED_ADMIN=false."