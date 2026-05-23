#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-dev}"

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

./scripts/render-env.sh "${ENV_NAME}" "${TMP_FILE}" >/dev/null

cat "${TMP_FILE}"
