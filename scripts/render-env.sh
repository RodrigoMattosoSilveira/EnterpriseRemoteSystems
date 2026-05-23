#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/render-env.sh dev
#   ./scripts/render-env.sh tst
#   ./scripts/render-env.sh prd
#   ./scripts/render-env.sh dev backend/.env
#
# Default output:
#   dev -> .env.dev
#   tst -> .env.tst
#   prd -> .env.prd

ENV_NAME="${1:-}"
OUTPUT_FILE="${2:-}"

if [[ -z "${ENV_NAME}" ]]; then
  echo "Usage: $0 <dev|tst|prd> [output-file]"
  exit 1
fi

COMMON_FILE="env/common.env"
ENV_FILE="env/${ENV_NAME}.env"

if [[ ! -f "${COMMON_FILE}" ]]; then
  echo "Error: missing ${COMMON_FILE}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: missing ${ENV_FILE}"
  exit 1
fi

if [[ -z "${OUTPUT_FILE}" ]]; then
  OUTPUT_FILE=".env.${ENV_NAME}"
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

# Merge dotenv files.
# Later files override earlier files.
awk '
  function trim(s) {
    gsub(/^[ \t]+|[ \t]+$/, "", s)
    return s
  }

  /^[ \t]*$/ { next }
  /^[ \t]*#/ { next }

  {
    line=$0
    eq=index(line, "=")
    if (eq == 0) {
      next
    }

    key=trim(substr(line, 1, eq - 1))
    value=substr(line, eq + 1)

    if (key == "") {
      next
    }

    order[++n]=key
    values[key]=value
    seen[key]=1
  }

  END {
    print "# Generated file. Do not edit directly."
    print "# Source files: env/common.env + " ENV_FILE
    print ""

    for (i = 1; i <= n; i++) {
      key=order[i]
      if (printed[key] == 1) {
        continue
      }

      # Print keys in final value order. If repeated, value is latest.
      print key "=" values[key]
      printed[key]=1
    }
  }
' ENV_FILE="${ENV_FILE}" "${COMMON_FILE}" "${ENV_FILE}" > "${TMP_FILE}"

mkdir -p "$(dirname "${OUTPUT_FILE}")"
cp "${TMP_FILE}" "${OUTPUT_FILE}"

echo "Rendered ${OUTPUT_FILE}"
echo "Sources:"
echo "  ${COMMON_FILE}"
echo "  ${ENV_FILE}"
echo
echo "Preview:"
grep -E "^(APP_ENV|APP_DOMAIN|PORT|DATABASE_PATH|JWT_ISSUER|DEV_SEED_ADMIN|DEV_ADMIN_EMAIL|LLM_COACHING_ENABLED|VITE_API_BASE_URL|CORS_ALLOW_ORIGINS)=" "${OUTPUT_FILE}" || true
