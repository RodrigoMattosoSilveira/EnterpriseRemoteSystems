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
    training) printf '%s\n' training ;;
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
  if [[ "$normalized" == "production" || "$normalized" == "training" ]]; then
    echo "Refusing ${operation}: Production or Training data must not be modified by reset/demo/test tooling." >&2
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
    development|test|production|training) ;;
    *) echo "Environment contract violation: expected server environment must be development, test, training, or production; got '${expected:-unset}'." >&2; exit 2 ;;
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

  value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_TRANSPORT || true)"
  if [[ "$(lowercase "$value")" != "s3" ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_TRANSPORT must be s3 for Hetzner Object Storage." >&2
    exit 2
  fi

  local endpoint region bucket prefix credentials_file profile expected_endpoint key
  endpoint="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_S3_ENDPOINT || true)"
  region="$(lowercase "$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_S3_REGION || true)")"
  bucket="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_S3_BUCKET || true)"
  prefix="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_S3_PREFIX || true)"
  credentials_file="$(read_env_value "$env_file" AWS_SHARED_CREDENTIALS_FILE || true)"
  profile="$(read_env_value "$env_file" AWS_PROFILE || true)"

  for key in SERVER_OFFHOST_BACKUP_S3_ENDPOINT SERVER_OFFHOST_BACKUP_S3_REGION SERVER_OFFHOST_BACKUP_S3_BUCKET SERVER_OFFHOST_BACKUP_S3_PREFIX AWS_SHARED_CREDENTIALS_FILE AWS_PROFILE; do
    value="$(read_env_value "$env_file" "$key" || true)"
    if [[ -z "$value" ]]; then
      echo "Production environment contract violation: ${key} must be configured for Hetzner S3 off-host backup protection." >&2
      exit 2
    fi
  done

  case "$region" in
    fsn1|nbg1|hel1) ;;
    *)
      echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_S3_REGION must be fsn1, nbg1, or hel1." >&2
      exit 2
      ;;
  esac
  expected_endpoint="https://${region}.your-objectstorage.com"
  endpoint="${endpoint%/}"
  if [[ "$endpoint" != "$expected_endpoint" ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_S3_ENDPOINT must be ${expected_endpoint} for region ${region}." >&2
    exit 2
  fi
  if [[ "$bucket" =~ [[:space:]/] ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_S3_BUCKET must be a bucket name without whitespace or slashes." >&2
    exit 2
  fi
  if [[ "$prefix" == /* || "$prefix" == */ || "$prefix" == *//* ]]; then
    echo "Production environment contract violation: SERVER_OFFHOST_BACKUP_S3_PREFIX must be a normalized non-empty object prefix without leading/trailing slash." >&2
    exit 2
  fi
  if [[ "$credentials_file" != /* ]]; then
    echo "Production environment contract violation: AWS_SHARED_CREDENTIALS_FILE must be an absolute path." >&2
    exit 2
  fi
}

require_server_contract() {
  local expected="${1:-}"
  local env_file="${2:-}"
  require_server_identity "$expected" "$env_file"

  if [[ "$expected" == "production" || "$expected" == "training" ]]; then
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
    value="$(read_env_value "$env_file" AUTHZ_BOOTSTRAP_ENABLED || true)"
    if [[ "$(lowercase "$value")" != "false" && "$value" != "0" ]]; then
      echo "Production environment contract violation: AUTHZ_BOOTSTRAP_ENABLED must explicitly be false." >&2
      exit 2
    fi
    if [[ "$expected" == "production" ]]; then
      validate_production_offhost_backup_contract "$env_file"
    else
      validate_production_offhost_backup_contract "$env_file"
      for key in AUTHZ_DISABLE_ROUTE_AUTHORIZATION AUTH_LOCAL_SESSION_HEADER_ENABLED AUTH_SESSION_COOKIE_SECURE; do
        value="$(read_env_value "$env_file" "$key" || true)"
        case "$key:$value" in
          AUTHZ_DISABLE_ROUTE_AUTHORIZATION:false|AUTH_LOCAL_SESSION_HEADER_ENABLED:false|AUTH_SESSION_COOKIE_SECURE:true) ;;
          *) echo "Training contract violation: $key has an unsafe or missing value." >&2; exit 2 ;;
        esac
      done
      value="$(read_env_value "$env_file" SERVER_OFFHOST_BACKUP_S3_PREFIX || true)"
      [[ "$value" == ers-backups/training ]] || {
        echo "Training contract violation: S3 prefix must be exclusively scoped to training." >&2; exit 2;
      }
      for item in "CONTAINER_PREFIX:ers-trn" "APP_DOMAIN:trn.enterpriseremotesystems.com" "JWT_ISSUER:enterprise-remote-systems-training" "AUTH_SESSION_COOKIE_NAME:ers_trn_session" "AWS_PROFILE:ers-training-backup"; do
        key="${item%%:*}"; required="${item#*:}"
        value="$(read_env_value "$env_file" "$key" || true)"
        [[ "$value" == "$required" ]] || {
          echo "Training contract violation: $key has a missing or mismatched value." >&2; exit 2;
        }
      done
      value="$(read_env_value "$env_file" AWS_SHARED_CREDENTIALS_FILE || true)"
      [[ "$value" == /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials ]] || {
        echo "Training contract violation: AWS credentials must use the separate training secrets file." >&2; exit 2;
      }
      value="$(read_env_value "$env_file" CORS_ALLOW_ORIGINS || true)"
      [[ "$value" == https://trn.enterpriseremotesystems.com ]] || {
        echo "Training contract violation: CORS origin must be exclusively TRN HTTPS." >&2; exit 2;
      }
    fi
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
