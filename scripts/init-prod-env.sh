#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.production}"

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

# Application
set_or_update_env "APP_ENV" "production"
set_or_update_env "APP_DOMAIN" "app.yourdomain.com"

# Backend
set_or_update_env "PORT" "8080"
set_or_update_env "DATABASE_PATH" "/app/data/app.db"
set_or_update_env "APP_AUTO_MIGRATE" "false"
set_or_update_env "AUTHZ_DISABLE_ROUTE_AUTHORIZATION" "false"

# JWT
set_or_update_env "JWT_SECRET" "$(openssl rand -base64 48)"
set_or_update_env "JWT_ISSUER" "call-it-cure-it"
set_or_update_env "JWT_EXPIRATION_MINUTES" "480"

# Production must not use development/test administrator seeding.
set_or_update_env "DEV_SEED_ADMIN" "false"
set_or_update_env "DEV_ADMIN_EMAIL" ""
set_or_update_env "DEV_ADMIN_PASSWORD" ""
set_or_update_env "DEV_ADMIN_NAME" ""

# LLM
set_or_update_env "LLM_COACHING_ENABLED" "false"
set_or_update_env "OPENAI_API_KEY" ""
set_or_update_env "OPENAI_MODEL" "gpt-5.1-mini"
set_or_update_env "OPENAI_BASE_URL" "https://api.openai.com/v1"
set_or_update_env "OPENAI_TIMEOUT_SECONDS" "20"

# CORS
set_or_update_env "CORS_ALLOW_ORIGINS" "https://app.yourdomain.com"

# Bite 33.3.2: Production backups replicate to Hetzner Object Storage via S3.
set_or_update_env "SERVER_OFFHOST_BACKUP_ENABLED" "true"
set_or_update_env "SERVER_OFFHOST_BACKUP_TRANSPORT" "s3"
set_or_update_env "SERVER_OFFHOST_BACKUP_S3_ENDPOINT" ""
set_or_update_env "SERVER_OFFHOST_BACKUP_S3_REGION" ""
set_or_update_env "SERVER_OFFHOST_BACKUP_S3_BUCKET" ""
set_or_update_env "SERVER_OFFHOST_BACKUP_S3_PREFIX" "ers-backups"
set_or_update_env "AWS_SHARED_CREDENTIALS_FILE" "/opt/EnterpriseRemoteSystems/secrets/aws-credentials"
set_or_update_env "AWS_PROFILE" "ers-backup"

rm -f "${ENV_FILE}.bak"

echo "Created/updated ${ENV_FILE}"
echo
echo "IMPORTANT: Edit ${ENV_FILE} before production use:"
echo "  1. Set APP_DOMAIN to your real domain."
echo "  2. Set CORS_ALLOW_ORIGINS to https://your-real-domain."
echo "  3. Keep DEV_SEED_ADMIN=false; Production administrator lifecycle is handled outside demo/test seeding."
echo "  4. Configure the Hetzner S3 endpoint/region/bucket and install AWS_SHARED_CREDENTIALS_FILE before Production build/up/deploy."
