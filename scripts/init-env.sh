#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_EXAMPLE_FILE="${1:-backend/.env.example}"
ENV_FILE="${2:-backend/.env}"

if [[ ! -f "$ENV_EXAMPLE_FILE" ]]; then
  echo "Error: ${ENV_EXAMPLE_FILE} does not exist." >&2
  exit 1
fi

APP_ENV_VALUE="$(grep -E '^[[:space:]]*APP_ENV=' "$ENV_EXAMPLE_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
"${ROOT_DIR}/scripts/ers-environment-guard.sh" require-non-production "$APP_ENV_VALUE" "legacy development/test environment initialization"

if [[ ! -s "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  echo "Created ${ENV_FILE} from ${ENV_EXAMPLE_FILE}"
else
  echo "Updating existing ${ENV_FILE}"
fi

set_or_update_env() {
  local key="$1"
  local value="$2"

  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"

  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
    sed -i.bak -E "s|^[[:space:]]*${key}=.*|${key}=${escaped_value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_or_update_env "JWT_SECRET" "dev-secret-change-me"
set_or_update_env "DEV_ADMIN_EMAIL" "admin@example.com"
set_or_update_env "DEV_ADMIN_PASSWORD" "admin123"
set_or_update_env "DEV_ADMIN_NAME" "Admin User"
set_or_update_env "DEV_SEED_ADMIN" "true"
set_or_update_env "LLM_COACHING_ENABLED" "false"

rm -f "${ENV_FILE}.bak"

echo
echo "Updated ${ENV_FILE}:"
grep -E "^(APP_ENV|JWT_SECRET|DEV_ADMIN_EMAIL|DEV_ADMIN_PASSWORD|DEV_ADMIN_NAME|DEV_SEED_ADMIN|LLM_COACHING_ENABLED)=" "$ENV_FILE"
