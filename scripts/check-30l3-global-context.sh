#!/usr/bin/env bash
set -euo pipefail

ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-Local-E2E-Administrator-28D!}"
BACKEND_BASE_URL="${ERS_LOCAL_BACKEND_BASE_URL:-http://127.0.0.1:8080/api/v1}"
FRONTEND_BASE_URL="${ERS_LOCAL_FRONTEND_BASE_URL:-http://127.0.0.1:5173/api/v1}"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT INT TERM

catalog_for() {
  local label="$1"
  local base_url="$2"
  local cookie_jar="${tmpdir}/${label}.cookies"
  local login_payload
  local login_response
  local options_response
  local catalog

  login_payload="$(jq -nc --arg login "${ADMIN_EMAIL}" --arg password "${ADMIN_PASSWORD}" '{login:$login,password:$password}')"
  if ! login_response="$(curl -fsS -c "${cookie_jar}" -H 'Content-Type: application/json' -X POST "${base_url}/auth/login" --data "${login_payload}")"; then
    echo "${label}: unable to sign in through ${base_url}" >&2
    return 1
  fi

  if ! options_response="$(curl -fsS -b "${cookie_jar}" "${base_url}/auth/tenant-options")"; then
    echo "${label}: unable to load tenant options through ${base_url}" >&2
    return 1
  fi

  catalog="$(jq -c 'if type == "object" and has("data") then .data else . end' <<<"${options_response}")"
  echo "${label} tenant-options: $(jq -c . <<<"${catalog}")" >&2

  if ! jq -e '
    type == "array" and
    length == 1 and
    .[0].id == "*" and
    .[0].contextKind == "GLOBAL" and
    ((.[0].membershipId // "") == "") and
    ((.[0].supportLeaseId // "") == "") and
    ((.[0].supportLeaseExpiresAt // "") == "")
  ' >/dev/null <<<"${catalog}"; then
    echo "${label}: expected exactly one GLOBAL context and no Tenant identity/Support Lease context." >&2
    return 1
  fi

  jq -S -c . <<<"${catalog}"
}

echo "Checking Bite 30L.3 Application Administrator context through the backend directly..."
backend_catalog="$(catalog_for backend "${BACKEND_BASE_URL}")"

echo "Checking the same context through the Vite frontend proxy..."
if ! frontend_catalog="$(catalog_for frontend "${FRONTEND_BASE_URL}")"; then
  echo >&2
  echo "The direct backend check passed, but the frontend-proxy check failed." >&2
  echo "Restart 'make local-frontend' and confirm ERS_API_PROXY_TARGET points to the intended local backend." >&2
  exit 1
fi

if [[ "${backend_catalog}" != "${frontend_catalog}" ]]; then
  echo "Backend and frontend-proxy tenant-option catalogs differ." >&2
  echo "This means Browser A is not observing the same runtime contract as the backend you reset." >&2
  echo "Restart the frontend and verify ERS_API_PROXY_TARGET before repeating the manual test." >&2
  exit 1
fi

echo "PASS: backend and frontend proxy both expose only Global administration before any Support Access Lease is approved."
