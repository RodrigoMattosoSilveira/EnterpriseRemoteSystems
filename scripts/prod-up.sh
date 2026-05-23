#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-prd}"
ENV_FILE=".env.${ENV_NAME}"

if [[ ! -f "${ENV_FILE}" ]]; then
  ./scripts/render-env.sh "${ENV_NAME}" "${ENV_FILE}"
fi

docker compose --env-file "${ENV_FILE}" -f docker-compose.prod.yml up -d
