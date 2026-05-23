#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Backend tests"
cd "${ROOT_DIR}/backend"
go test ./...

echo
echo "==> Frontend check"
cd "${ROOT_DIR}/frontend"
npm run check

echo
echo "==> OpenAPI lint"
cd "${ROOT_DIR}"

if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx is not installed or not on PATH."
  exit 1
fi

npx @redocly/cli lint backend/api/openapi.yaml

echo
echo "✅ All non-e2e checks passed."