#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  scripts/ers-environment-guard.sh require-non-production <environment> <operation>
  scripts/ers-environment-guard.sh require-server-identity <expected-environment> <env-file>
  scripts/ers-environment-guard.sh require-server-contract <expected-environment> <env-file>
USAGE
}

lowercase() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'
}

normalize_environment() {
  local raw="${1:-}"
  case "$(lowercase "$raw")" in
    local|dev|development) printf '%s\n' development ;;
    test|testing|ci) printf '%s\n' test ;;
    production|prod) printf '%s\n' production ;;
    '') return 2 ;;
    *) return 3 ;;
  esac
}

require_non_production() {
  local raw="${1:-}"
  local operation="${2:-destructive ERS operation}"
  local normalized
  if ! normalized="$(normalize_environment "$raw")"; then
    echo "Refusing ${operation}: APP_ENV/ENV must explicitly identify local/development/test; got '${raw:-unset}'." >&2
    exit 2
  fi
  if [[ "$normalized" == "production" ]]; then
    echo "Refusing ${operation}: Production data must not be modified by reset/demo/test tooling." >&2
    exit 2
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line count value
  count="$(grep -Ec "^[[:space:]]*${key}=" "$file" || true)"
  if [[ "$count" -gt 1 ]]; then
    echo "Environment contract violation: ${file} defines ${key} more than once." >&2
    exit 2
  fi
  if [[ "$count" -eq 0 ]]; then
    return 1
  fi
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1)"
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s\n' "$value"
}

require_server_identity() {
  local expected="${1:-}"
  local env_file="${2:-}"
  case "$expected" in
    development|test|production) ;;
    *) echo "Environment contract violation: expected server environment must be development, test, or production; got '${expected:-unset}'." >&2; exit 2 ;;
  esac
  [[ -f "$env_file" ]] || { echo "Environment contract violation: missing server environment file: $env_file" >&2; exit 2; }

  local actual
  actual="$(read_env_value "$env_file" APP_ENV || true)"
  if [[ -z "$actual" ]]; then
    echo "Environment contract violation: ${env_file} must explicitly define APP_ENV=${expected}." >&2
    exit 2
  fi
  if [[ "$actual" != "$expected" ]]; then
    echo "Environment contract violation: selected ENV=${expected} but ${env_file} declares APP_ENV=${actual}." >&2
    exit 2
  fi

  local database_path
  database_path="$(read_env_value "$env_file" DATABASE_PATH || true)"
  if [[ -n "$database_path" && "$database_path" != "/app/data/app.db" ]]; then
    echo "Environment contract violation: deployed DATABASE_PATH must be /app/data/app.db; got ${database_path}." >&2
    exit 2
  fi
}


validate_production_offhost_backup_contract() {
  local env_file="$1"
  local value
  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_ENABLED || true)"
  if [[ "$(lowercase "$value")" != "true" && "$value" != "1" ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_ENABLED must be true." >&2
    exit 2
  fi

  local key
  for key in SERVER_OFFHOST_BACKUP_HOST SERVER_OFFHOST_BACKUP_USER SERVER_OFFHOST_BACKUP_DIRECTORY SERVER_OFFHOST_BACKUP_IDENTITY_FILE SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE; do
    value="$(read_env_value "$env_file" "$key" || true)"
    if [[ -z "$value" ]]; then
      echo "Production environment contract violation: ${key} must be configured for off-host backup protection." >&2
      exit 2
    fi
  done

  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_HOST || true)"
  case "$(lowercase "$value")" in
    localhost|localhost.|localhost.localdomain|localhost.localdomain.|127.*|::1|\[::1\])
      echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_HOST must identify a distinct non-loopback host." >&2
      exit 2
      ;;
  esac

  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_DIRECTORY || true)"
  if [[ "$value" != /* || "$value" == "/" ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_DIRECTORY must be an absolute remote directory other than /." >&2
    exit 2
  fi
  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_IDENTITY_FILE || true)"
  if [[ "$value" != /* ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_IDENTITY_FILE must be an absolute path." >&2
    exit 2
  fi
  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE || true)"
  if [[ "$value" != /* ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE must be an absolute path." >&2
    exit 2
  fi
  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_PORT || true)"
  value="${value:-22}"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || (( value < 1 || value > 65535 )); then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_PORT must be an integer from 1 through 65535." >&2
    exit 2
  fi
}

require_server_contract() {
  local expected="${1:-}"
  local env_file="${2:-}"
  require_server_identity "$expected" "$env_file"

  if [[ "$expected" == "production" ]]; then
    local value
    value="$(read_env_value "$env_file" APP_AUTO_MIGRATE || true)"
    if [[ -n "$value" && "$(lowercase "$value")" != "false" && "$value" != "0" ]]; then
      echo "Production environment contract violation: APP_AUTO_MIGRATE must be false." >&2
      exit 2
    fi
    value="$(read_env_value "$env_file" AUTHZ_ACTOR_HEADER_MODE || true)"
    if [[ -n "$value" && "$(lowercase "$value")" != "disabled" ]]; then
      echo "Production environment contract violation: AUTHZ_ACTOR_HEADER_MODE must be disabled." >&2
      exit 2
    fi
    value="$(read_env_value "$env_file" DEV_SEED_ADMIN || true)"
    if [[ -n "$value" && "$(lowercase "$value")" != "false" && "$value" != "0" ]]; then
      echo "Production environment contract violation: DEV_SEED_ADMIN must be false." >&2
      exit 2
    fi
    validate_production_offhost_backup_contract "$env_file"
  fi
}

command="${1:-}"
case "$command" in
  require-non-production)
    [[ $# -eq 3 ]] || { usage; exit 2; }
    require_non_production "$2" "$3"
    ;;
  require-server-identity)
    [[ $# -eq 3 ]] || { usage; exit 2; }
    require_server_identity "$2" "$3"
    ;;
  require-server-contract)
    [[ $# -eq 3 ]] || { usage; exit 2; }
    require_server_contract "$2" "$3"
    ;;
  *)
    usage
    exit 2
    ;;
esac
