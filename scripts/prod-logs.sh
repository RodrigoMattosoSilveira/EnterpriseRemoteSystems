#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-prd}"
ENV_FILE=".env.${ENV_NAME}"

docker compose --env-file "${ENV_FILE}" -f docker-compose.prod.yml logs -f --tail=200
