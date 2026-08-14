#!/usr/bin/env bash

set -euo pipefail

source /tmp/ers-b28c-manual-env.sh

REPORT_DIR="/tmp"
OUTPUT_FILE="${REPORT_DIR}/tenant-people.txt"

mkdir -p "$REPORT_DIR"

sqlite3 -header -column backend/data/app.db >"$OUTPUT_FILE" <<SQL
SELECT
    t.name AS tenant,
    p.nickname,
    p.first_name || ' ' || p.last_name AS legal_name,
    p.email
FROM people p
JOIN tenants t
  ON t.id = p.tenant_id
WHERE p.tenant_id IN ('default', '$SECOND_TENANT_ID')
ORDER BY
    t.name,
    p.nickname;
SQL

printf 'People-by-tenant report written to:\n%s\n' "$OUTPUT_FILE"
