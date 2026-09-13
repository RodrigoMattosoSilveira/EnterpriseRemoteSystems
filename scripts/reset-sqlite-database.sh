#!/usr/bin/env bash
set -euo pipefail

DATABASE_FILE="${1:-}"
if [[ -z "${DATABASE_FILE}" ]]; then
  echo "Usage: $0 <sqlite-database-file>" >&2
  exit 2
fi

# ERS opens SQLite in WAL mode. A database reset is incomplete if the main
# database file is removed while its WAL/shared-memory (or rollback journal)
# sidecars remain at the same path.
rm -f \
  "${DATABASE_FILE}" \
  "${DATABASE_FILE}-wal" \
  "${DATABASE_FILE}-shm" \
  "${DATABASE_FILE}-journal"
