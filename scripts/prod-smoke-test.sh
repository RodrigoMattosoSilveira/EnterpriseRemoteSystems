#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-${BASE_URL:-http://localhost:8080}}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"
CHECK_FRONTEND="${CHECK_FRONTEND:-true}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

echo "Running smoke tests..."
echo "  API_BASE_URL=${API_BASE_URL}"
echo "  FRONTEND_URL=${FRONTEND_URL}"
echo "  CHECK_FRONTEND=${CHECK_FRONTEND}"
echo

echo "Testing API health..."
curl -fsS "${API_BASE_URL}/api/v1/healthz" | jq .

echo
echo "Testing public scenarios..."
curl -fsS "${API_BASE_URL}/api/v1/scenarios" | jq .

echo
echo "Testing login..."
TOKEN="$(
  curl -fsS -X POST "${API_BASE_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${ADMIN_EMAIL}\",
      \"password\": \"${ADMIN_PASSWORD}\"
    }" | jq -r '.data.token'
)"

if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "Login failed: token was empty"
  exit 1
fi

echo "Login OK."

echo
echo "Testing admin scenarios..."
curl -fsS "${API_BASE_URL}/api/v1/admin/scenarios" \
  -H "Authorization: Bearer ${TOKEN}" | jq .

if [[ "${CHECK_FRONTEND}" == "true" ]]; then
  echo
  echo "Testing frontend..."
  curl -fsS "${FRONTEND_URL}/" >/dev/null
  echo "Frontend OK."
else
  echo
  echo "Skipping frontend check."
fi

echo
echo "Smoke tests passed."