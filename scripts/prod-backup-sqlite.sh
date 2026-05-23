#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
CONTAINER="${CONTAINER:-callitcureit-backend}"
DB_PATH="${DB_PATH:-/app/data/app.db}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/app-${TIMESTAMP}.db"

echo "Creating SQLite backup: ${BACKUP_FILE}"

docker exec "$CONTAINER" sqlite3 "$DB_PATH" ".backup '/tmp/app-backup.db'"
docker cp "${CONTAINER}:/tmp/app-backup.db" "$BACKUP_FILE"
docker exec "$CONTAINER" rm -f /tmp/app-backup.db

echo "Backup created: ${BACKUP_FILE}"