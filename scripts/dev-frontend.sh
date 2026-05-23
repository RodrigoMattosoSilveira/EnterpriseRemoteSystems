#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"

cd "${PROJECT_ROOT}"

if [[ ! -f "frontend/.env" ]]; then
  ./scripts/render-env.sh dev frontend/.env
fi

cd "${FRONTEND_DIR}"

npm run dev
