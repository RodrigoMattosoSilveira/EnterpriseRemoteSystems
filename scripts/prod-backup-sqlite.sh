#!/usr/bin/env bash
set -euo pipefail

# Legacy convenience entry point retained for operators.  Bite 33.2 routes it
# through the same verified backup/manifest/retention implementation used by
# `make server-prod-backup` so there is no unverified Production backup path.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKUP_DIR="${BACKUP_DIR:-backups}"
CONTAINER="${CONTAINER:-ers-prd-backend}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

BACKUP_ENVIRONMENT=production \
BACKUP_CONTAINER="$CONTAINER" \
BACKUP_DIRECTORY="$BACKUP_DIR" \
BACKUP_RETENTION_COUNT="$BACKUP_RETENTION_COUNT" \
BACKUP_RETENTION_DAYS="$BACKUP_RETENTION_DAYS" \
ERS_BACKUP_ENV_DIR="$ROOT_DIR" \
ERS_BACKUP_ENV_FILE=".env.production" \
ERS_BACKUP_COMPOSE_PROJECT="ers-prd" \
  exec "$ROOT_DIR/scripts/server-sqlite-backup.sh"
