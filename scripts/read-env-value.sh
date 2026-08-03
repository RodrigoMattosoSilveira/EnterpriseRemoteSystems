#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-}"
KEY="${2:-}"

if [[ -z "$ENV_FILE" || -z "$KEY" ]]; then
  echo "Usage: $0 <env-file> <key>" >&2
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 2
fi

if [[ ! "$KEY" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid environment key: $KEY" >&2
  exit 2
fi

line="$(grep -E "^[[:space:]]*${KEY}=" "$ENV_FILE" | tail -n 1 || true)"
if [[ -z "$line" ]]; then
  exit 1
fi

value="${line#*=}"
value="${value%$'\r'}"

if [[ ${#value} -ge 2 ]]; then
  first="${value:0:1}"
  last="${value: -1}"
  if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
    value="${value:1:${#value}-2}"
  fi
fi

printf '%s' "$value"
