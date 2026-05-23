#!/usr/bin/env bash
set -euo pipefail

ENV_EXAMPLE_FILE="${1:-backend/.env.production.example}"
ENV_FILE="${2:-.env.production}"

if [[ ! -f "$ENV_EXAMPLE_FILE" ]]; then
  echo "Error: ${ENV_EXAMPLE_FILE} does not exist."
  exit 1
fi

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
grep -E "^(JWT_SECRET|DEV_ADMIN_EMAIL|DEV_ADMIN_PASSWORD|DEV_ADMIN_NAME|DEV_SEED_ADMIN|LLM_COACHING_ENABLED)=" "$ENV_FILE"e