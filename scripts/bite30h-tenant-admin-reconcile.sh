#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-report}"
if [[ $# -gt 0 ]]; then
  shift
fi

COMPOSE_PROJECT="${COMPOSE_PROJECT:-}"
ENV_FILE="${ENV_FILE:-}"
ENV_NAME="${ENV_NAME:-${ENV:-server}}"
DB_PATH="${DB_PATH:-/app/data/app.db}"
OPERATOR="${RECONCILIATION_OPERATOR:-${USER:-offline-operator}}"

if [[ -z "$COMPOSE_PROJECT" || -z "$ENV_FILE" ]]; then
  echo "COMPOSE_PROJECT and ENV_FILE are required." >&2
  echo "Use the Makefile targets, for example:" >&2
  echo "  make server-bite30h-admin-report ENV=development" >&2
  echo "  make server-bite30h-admin-revoke ENV=development GRANT_IDS='grant-id-1 grant-id-2'" >&2
  exit 2
fi

if [[ ! -f "docker-compose.server.yml" ]]; then
  echo "Run this command from the server environment directory containing docker-compose.server.yml." >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 2
fi

compose=(docker compose -p "$COMPOSE_PROJECT" --env-file "$ENV_FILE" -f docker-compose.server.yml)

running_services="$(${compose[@]} ps --status running -q 2>/dev/null || true)"
if [[ -n "$running_services" ]]; then
  echo "Refusing offline Bite 30H reconciliation while application services are running." >&2
  echo "Stop the stack first (volumes are preserved):" >&2
  echo "  make server-down ENV=${ENV_NAME}" >&2
  exit 2
fi

sqlite() {
  "${compose[@]}" run --rm --no-deps --entrypoint sqlite3 backend "$@"
}

sqlite_scalar() {
  sqlite -noheader "$DB_PATH" "$1" | tr -d '\r'
}

report() {
  echo "Bite 30H Tenant Administrator reconciliation report"
  echo "Environment: $ENV_NAME"
  echo "Database:    $DB_PATH"
  echo

  echo "----- Active TENANT_ADMIN Role Grants -----"
  sqlite -header -column "$DB_PATH" "
SELECT
  g.id AS grant_id,
  g.tenant_id,
  a.actor_key,
  a.display_name,
  a.active AS actor_active,
  COALESCE(u.login, '') AS login,
  COALESCE(aa.membership_id, '') AS membership_id,
  COALESCE(m.person_id, '') AS global_person_id,
  CASE
    WHEN m.person_id IS NULL OR TRIM(m.person_id) = '' THEN 'MISSING_CANONICAL_PERSON'
    ELSE 'OK'
  END AS identity_state
FROM authz_actor_role_grants g
JOIN authz_actors a ON a.id = g.actor_id
LEFT JOIN auth_account_actors aa
  ON aa.actor_id = g.actor_id
 AND aa.scope_type = 'TENANT'
 AND aa.tenant_id = g.tenant_id
LEFT JOIN auth_user_accounts u ON u.id = aa.account_id
LEFT JOIN person_tenant_memberships m
  ON m.id = aa.membership_id
 AND m.tenant_id = aa.tenant_id
WHERE g.role_id = 'authz-role-tenant-admin'
  AND g.active = 1
ORDER BY g.tenant_id, a.actor_key, g.id;
"
  echo

  echo "----- Violation: active Tenant Administrator without canonical global Person -----"
  sqlite -header -column "$DB_PATH" "
SELECT
  g.id AS grant_id,
  g.tenant_id,
  a.actor_key,
  a.display_name,
  COALESCE(aa.account_id, '') AS account_id,
  COALESCE(aa.membership_id, '') AS membership_id
FROM authz_actor_role_grants g
JOIN authz_actors a ON a.id = g.actor_id
LEFT JOIN auth_account_actors aa
  ON aa.actor_id = g.actor_id
 AND aa.scope_type = 'TENANT'
 AND aa.tenant_id = g.tenant_id
LEFT JOIN person_tenant_memberships m
  ON m.id = aa.membership_id
 AND m.tenant_id = aa.tenant_id
WHERE g.role_id = 'authz-role-tenant-admin'
  AND g.active = 1
  AND (m.person_id IS NULL OR TRIM(m.person_id) = '')
ORDER BY g.tenant_id, a.actor_key, g.id;
"
  echo

  echo "----- Violation: more than two active Tenant Administrator assignments -----"
  sqlite -header -column "$DB_PATH" "
SELECT g.tenant_id, COUNT(*) AS active_assignments
FROM authz_actor_role_grants g
WHERE g.role_id = 'authz-role-tenant-admin'
  AND g.active = 1
GROUP BY g.tenant_id
HAVING COUNT(*) > 2
ORDER BY g.tenant_id;
"
  echo

  echo "----- Violation: same global Person occupies multiple slots in one Tenant -----"
  sqlite -header -column "$DB_PATH" "
SELECT
  g.tenant_id,
  m.person_id AS global_person_id,
  COUNT(*) AS active_assignments,
  GROUP_CONCAT(a.actor_key, ', ') AS actor_keys
FROM authz_actor_role_grants g
JOIN authz_actors a ON a.id = g.actor_id
JOIN auth_account_actors aa
  ON aa.actor_id = g.actor_id
 AND aa.scope_type = 'TENANT'
 AND aa.tenant_id = g.tenant_id
JOIN person_tenant_memberships m
  ON m.id = aa.membership_id
 AND m.tenant_id = aa.tenant_id
WHERE g.role_id = 'authz-role-tenant-admin'
  AND g.active = 1
GROUP BY g.tenant_id, m.person_id
HAVING COUNT(*) > 1
ORDER BY g.tenant_id, m.person_id;
"
  echo

  echo "----- Violation: same global Person administers multiple Tenants -----"
  sqlite -header -column "$DB_PATH" "
SELECT
  m.person_id AS global_person_id,
  COUNT(DISTINCT g.tenant_id) AS tenant_count,
  GROUP_CONCAT(DISTINCT g.tenant_id) AS tenant_ids
FROM authz_actor_role_grants g
JOIN auth_account_actors aa
  ON aa.actor_id = g.actor_id
 AND aa.scope_type = 'TENANT'
 AND aa.tenant_id = g.tenant_id
JOIN person_tenant_memberships m
  ON m.id = aa.membership_id
 AND m.tenant_id = aa.tenant_id
WHERE g.role_id = 'authz-role-tenant-admin'
  AND g.active = 1
GROUP BY m.person_id
HAVING COUNT(DISTINCT g.tenant_id) > 1
ORDER BY m.person_id;
"
}

revoke_one() {
  local grant_id="$1"
  if [[ ! "$grant_id" =~ ^[A-Za-z0-9._:-]+$ ]]; then
    echo "Invalid Role Grant ID: $grant_id" >&2
    exit 2
  fi

  local matches
  matches="$(sqlite_scalar "SELECT COUNT(*) FROM authz_actor_role_grants WHERE id = '$grant_id' AND role_id = 'authz-role-tenant-admin' AND active = 1;")"
  if [[ "$matches" != "1" ]]; then
    echo "Refusing to revoke '$grant_id': it is not exactly one active TENANT_ADMIN Role Grant." >&2
    exit 2
  fi

  local escaped_operator="${OPERATOR//\'/\'\'}"
  sqlite "$DB_PATH" "
BEGIN IMMEDIATE;
INSERT INTO authz_audit_logs (
  id, occurred_at, actor_id, actor_record_id, tenant_id, permission_code,
  operation, target_type, target_id, decision, reason,
  request_method, request_path, created_at
)
SELECT
  'bite30h-offline-' || lower(hex(randomblob(16))),
  CURRENT_TIMESTAMP,
  NULL,
  g.actor_id,
  g.tenant_id,
  'authz.manage',
  'REVOKE_TENANT_ADMIN_ROLE_GRANT',
  'authz_actor_role_grant',
  g.id,
  'ALLOW',
  'Explicit Bite 30H offline reconciliation by ${escaped_operator}',
  'OFFLINE',
  'offline:bite30h-tenant-admin-reconcile',
  CURRENT_TIMESTAMP
FROM authz_actor_role_grants g
WHERE g.id = '$grant_id'
  AND g.role_id = 'authz-role-tenant-admin'
  AND g.active = 1;

UPDATE authz_actor_role_grants
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE id = '$grant_id'
  AND role_id = 'authz-role-tenant-admin'
  AND active = 1;
COMMIT;
"
  echo "Revoked TENANT_ADMIN Role Grant: $grant_id"
}

case "$ACTION" in
  report)
    if [[ $# -ne 0 ]]; then
      echo "report does not accept Role Grant IDs." >&2
      exit 2
    fi
    report
    ;;

  revoke)
    if [[ $# -eq 0 ]]; then
      echo "revoke requires one or more explicit Role Grant IDs." >&2
      exit 2
    fi

    mkdir -p backups
    timestamp="$(date +%Y%m%d-%H%M%S)"
    backup_name="app-${ENV_NAME}-pre-bite30h-reconcile-${timestamp}.db"
    echo "Creating backup before revocation: backups/${backup_name}"
    "${compose[@]}" run --rm --no-deps \
      -v "$PWD/backups:/backup" \
      --entrypoint sqlite3 backend \
      "$DB_PATH" ".backup '/backup/${backup_name}'"

    echo
    echo "Selected Role Grants will be explicitly revoked:"
    printf '  %s\n' "$@"
    echo

    for grant_id in "$@"; do
      revoke_one "$grant_id"
    done

    echo
    echo "Post-revocation cardinality report:"
    echo
    report
    ;;

  *)
    echo "Usage:" >&2
    echo "  $0 report" >&2
    echo "  $0 revoke <grant-id> [<grant-id> ...]" >&2
    exit 2
    ;;
esac
