#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"

cd "${PROJECT_ROOT}"

if [[ ! -f "frontend/.env" ]]; then
  ./scripts/render-env.sh dev frontend/.env
fi

SOURCE_REVISION="$(git -C "${PROJECT_ROOT}" rev-parse HEAD 2>/dev/null || printf 'unavailable')"
API_PROXY_TARGET="${ERS_API_PROXY_TARGET:-http://127.0.0.1:8080}"
echo "Starting frontend..."
echo "SOURCE_REVISION=${SOURCE_REVISION}"
echo "ERS_API_PROXY_TARGET=${API_PROXY_TARGET}"

cd "${FRONTEND_DIR}"

npm run dev
