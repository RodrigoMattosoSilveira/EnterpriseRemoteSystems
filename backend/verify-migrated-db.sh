#!/usr/bin/env sh
set -eu

DB_PATH="${DATABASE_PATH:-/app/data/app.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
EXPECTED_BASELINE_LAST_MIGRATION="${EXPECTED_BASELINE_LAST_MIGRATION:-000062_tenant_administrator_cardinality.up.sql}"
EXPECTED_FIRST_REHEARSED_MIGRATION="${EXPECTED_FIRST_REHEARSED_MIGRATION:-000063_global_administration_control_plane.up.sql}"
EXPECTED_FINAL_MIGRATION="${EXPECTED_FINAL_MIGRATION:-000070_revoke_noncanonical_application_admin_grants.up.sql}"

if [ ! -f "$DB_PATH" ]; then
  echo "Missing database for migration verification: $DB_PATH" >&2
  exit 2
fi
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Missing migrations directory: $MIGRATIONS_DIR" >&2
  exit 2
fi

has_schema_migrations="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations';")"
if [ "$has_schema_migrations" != "1" ]; then
  echo "Migrated database does not contain schema_migrations." >&2
  exit 1
fi

expected_seen=0
expected_list=""
expected_count=0
for migration in "$MIGRATIONS_DIR"/*.up.sql; do
  [ -f "$migration" ] || continue
  filename="$(basename "$migration")"
  expected_count=$((expected_count + 1))
  if [ -z "$expected_list" ]; then
    expected_list="$filename"
  else
    expected_list="${expected_list}
${filename}"
  fi
  if [ "$filename" = "$EXPECTED_FINAL_MIGRATION" ]; then
    expected_seen=1
    break
  fi
done

if [ "$expected_seen" != "1" ]; then
  echo "Expected final migration is not present in the repository: $EXPECTED_FINAL_MIGRATION" >&2
  exit 2
fi

actual_list="$(sqlite3 "$DB_PATH" "SELECT filename FROM schema_migrations ORDER BY filename;")"
if [ "$actual_list" != "$expected_list" ]; then
  echo "Migrated database history does not exactly match the repository through ${EXPECTED_FINAL_MIGRATION}." >&2
  echo "Expected:" >&2
  printf '%s\n' "$expected_list" >&2
  echo "Actual:" >&2
  printf '%s\n' "$actual_list" >&2
  exit 1
fi

for required in \
  "$EXPECTED_BASELINE_LAST_MIGRATION" \
  "$EXPECTED_FIRST_REHEARSED_MIGRATION" \
  "$EXPECTED_FINAL_MIGRATION"; do
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename='${required}';")"
  if [ "$count" != "1" ]; then
    echo "Expected exactly one migration record for ${required}; found ${count}." >&2
    exit 1
  fi
done

integrity="$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;")"
if [ "$integrity" != "ok" ]; then
  echo "Migrated database integrity_check failed: $integrity" >&2
  exit 1
fi

foreign_key_violations="$(sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;")"
if [ -n "$foreign_key_violations" ]; then
  echo "Migrated database foreign_key_check failed:" >&2
  printf '%s\n' "$foreign_key_violations" >&2
  exit 1
fi

require_column() {
  table="$1"
  column="$2"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('${table}') WHERE name='${column}';")"
  if [ "$count" != "1" ]; then
    echo "Expected migrated column ${table}.${column}." >&2
    exit 1
  fi
}

require_table() {
  table="$1"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}';")"
  if [ "$count" != "1" ]; then
    echo "Expected migrated table ${table}." >&2
    exit 1
  fi
}

require_index() {
  index="$1"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='${index}';")"
  if [ "$count" != "1" ]; then
    echo "Expected migrated index ${index}." >&2
    exit 1
  fi
}

require_trigger() {
  trigger="$1"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='${trigger}';")"
  if [ "$count" != "1" ]; then
    echo "Expected migrated trigger ${trigger}." >&2
    exit 1
  fi
}

reject_table() {
  table="$1"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}';")"
  if [ "$count" != "0" ]; then
    echo "Retired table ${table} must be absent after 30K.3B." >&2
    exit 1
  fi
}

reject_column() {
  table="$1"
  column="$2"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('${table}') WHERE name='${column}';")"
  if [ "$count" != "0" ]; then
    echo "Retired column ${table}.${column} must be absent after 30K.3B." >&2
    exit 1
  fi
}

reject_trigger() {
  trigger="$1"
  count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='${trigger}';")"
  if [ "$count" != "0" ]; then
    echo "Retired trigger ${trigger} must be absent after 30K.3B." >&2
    exit 1
  fi
}

require_column global_people operational_active
require_column auth_user_accounts security_suspended
require_column authz_actor_role_grants lifecycle_suspended
require_table tenant_support_access_leases
require_table tenant_support_access_lease_permissions
require_table tenant_support_access_lease_events
require_column authz_audit_logs support_lease_id
require_index idx_authz_audit_logs_support_lease_id
require_trigger trg_application_admin_control_plane_permission_insert
require_trigger trg_application_admin_control_plane_permission_update
require_trigger trg_support_access_lease_request_global_application_actor
require_trigger trg_support_access_lease_open_conflict_insert
require_trigger trg_support_access_lease_approval_tenant_administrator
require_trigger trg_support_access_lease_termination_tenant_administrator
require_trigger trg_support_access_lease_permission_allowlist
require_trigger trg_support_access_lease_no_delete
require_trigger trg_authz_audit_logs_no_update
require_trigger trg_authz_audit_logs_no_delete

audit_identity_migration_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename='000067_audit_identity_lifecycle_hardening.up.sql';")"
if [ "$audit_identity_migration_count" = "1" ]; then
  for column in \
    account_id \
    actor_scope \
    person_id \
    membership_id \
    session_id \
    correlation_id \
    authorization_source \
    authorization_source_id \
    authorization_role_code; do
    require_column authz_audit_logs "$column"
  done
  require_index idx_authz_audit_logs_account_id
  require_index idx_authz_audit_logs_session_id
  require_index idx_authz_audit_logs_correlation_id
  require_index idx_authz_audit_logs_authorization_source
  require_trigger trg_authz_audit_identity_required_insert
fi

legacy_identity_bridge_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename='000068_legacy_identity_dependency_elimination.up.sql';")"
physical_legacy_removal_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM schema_migrations WHERE filename='000069_physical_legacy_identity_schema_removal.up.sql';")"
if [ "$physical_legacy_removal_count" = "1" ]; then
  # 30K.3B physically removes every legacy identity storage path retained by
  # 30K.3A. Current schema verification must prove they cannot silently return.
  reject_table people
  reject_column auth_user_accounts actor_id
  reject_column auth_account_actors is_primary
  reject_column authz_actors person_id
  reject_column authz_actors collaborator_id
  reject_column person_tenant_memberships legacy_person_id
  reject_column collaborator_journeys person_id
  require_column collaborator_journeys membership_id

  journey_membership_notnull="$(sqlite3 "$DB_PATH" "SELECT [notnull] FROM pragma_table_info('collaborator_journeys') WHERE name='membership_id';")"
  if [ "$journey_membership_notnull" != "1" ]; then
    echo "30K.3B requires collaborator_journeys.membership_id to remain NOT NULL." >&2
    exit 1
  fi

  for trigger in \
    trg_auth_user_accounts_legacy_actor_insert_prohibited \
    trg_auth_user_accounts_legacy_actor_update_prohibited \
    trg_auth_account_actors_legacy_primary_insert_prohibited \
    trg_auth_account_actors_legacy_primary_update_prohibited \
    trg_authz_actors_legacy_identity_insert_prohibited \
    trg_authz_actors_legacy_identity_update_prohibited \
    trg_person_membership_legacy_projection_insert_prohibited \
    trg_person_membership_legacy_projection_update_prohibited \
    trg_collaborator_journeys_legacy_person_insert_prohibited \
    trg_collaborator_journeys_legacy_person_update_prohibited; do
    reject_trigger "$trigger"
  done

  for column in membership_id person_id tenant_id search_text; do
    require_column people_search_index "$column"
  done

  obsolete_person_self_roles="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM authz_roles WHERE code='PERSON' OR scope_type='SELF';")"
  if [ "$obsolete_person_self_roles" != "0" ]; then
    echo "30K.3B retained obsolete PERSON/SELF authorization catalog state." >&2
    exit 1
  fi
elif [ "$legacy_identity_bridge_count" = "1" ]; then
  # 30K.3A bridge verification remains useful for databases intentionally
  # stopped before 000069.
  require_table people
  require_column auth_user_accounts actor_id
  require_column auth_account_actors is_primary
  require_column authz_actors person_id
  require_column authz_actors collaborator_id
  require_column person_tenant_memberships legacy_person_id
  require_column collaborator_journeys person_id
  require_column collaborator_journeys membership_id

  account_actor_notnull="$(sqlite3 "$DB_PATH" "SELECT [notnull] FROM pragma_table_info('auth_user_accounts') WHERE name='actor_id';")"
  journey_person_notnull="$(sqlite3 "$DB_PATH" "SELECT [notnull] FROM pragma_table_info('collaborator_journeys') WHERE name='person_id';")"
  journey_membership_notnull="$(sqlite3 "$DB_PATH" "SELECT [notnull] FROM pragma_table_info('collaborator_journeys') WHERE name='membership_id';")"
  if [ "$account_actor_notnull" != "0" ] || [ "$journey_person_notnull" != "0" ] || [ "$journey_membership_notnull" != "1" ]; then
    echo "30K.3A compatibility-column nullability is incorrect." >&2
    exit 1
  fi

  for trigger in \
    trg_auth_user_accounts_legacy_actor_insert_prohibited \
    trg_auth_user_accounts_legacy_actor_update_prohibited \
    trg_auth_account_actors_legacy_primary_insert_prohibited \
    trg_auth_account_actors_legacy_primary_update_prohibited \
    trg_authz_actors_legacy_identity_insert_prohibited \
    trg_authz_actors_legacy_identity_update_prohibited \
    trg_person_membership_legacy_projection_insert_prohibited \
    trg_person_membership_legacy_projection_update_prohibited \
    trg_collaborator_journeys_legacy_person_insert_prohibited \
    trg_collaborator_journeys_legacy_person_update_prohibited; do
    require_trigger "$trigger"
  done
fi

application_admin_permission_count="$(sqlite3 "$DB_PATH" "
SELECT COUNT(*)
FROM authz_role_permissions
WHERE role_id='authz-role-application-admin'
  AND permission_code IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'tenants.read',
    'tenants.create',
    'tenants.update',
    'support_access_leases.read',
    'support_access_leases.request'
  );
")"
application_admin_unexpected_permissions="$(sqlite3 "$DB_PATH" "
SELECT COUNT(*)
FROM authz_role_permissions
WHERE role_id='authz-role-application-admin'
  AND permission_code NOT IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'tenants.read',
    'tenants.create',
    'tenants.update',
    'support_access_leases.read',
    'support_access_leases.request'
  );
")"
if [ "$application_admin_permission_count" != "8" ] || [ "$application_admin_unexpected_permissions" != "0" ]; then
  echo "Application Administrator standing permissions do not match the post-30I control-plane allowlist." >&2
  echo "Expected allowlisted permissions present: ${application_admin_permission_count}/8" >&2
  echo "Unexpected standing permissions: ${application_admin_unexpected_permissions}" >&2
  exit 1
fi

application_admin_identity_violations="$(sqlite3 "$DB_PATH" "
SELECT COUNT(*)
FROM authz_actor_role_grants g
JOIN authz_roles r
  ON r.id = g.role_id
 AND r.code = 'APPLICATION_ADMIN'
WHERE g.tenant_id='*'
  AND g.active=1
  AND g.lifecycle_suspended=0
  AND (
    NOT EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      JOIN auth_user_accounts a ON a.id = aa.account_id
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'GLOBAL'
        AND aa.tenant_id IS NULL
        AND aa.membership_id IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'TENANT'
    )
    OR EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      JOIN auth_account_people ap ON ap.account_id = aa.account_id
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'GLOBAL'
    )
  );
")"
if [ "$application_admin_identity_violations" != "0" ]; then
  echo "Post-30I Application Administrator identity invariant failed: found ${application_admin_identity_violations} canonical identity violation(s) (missing GLOBAL AccountActor, TENANT AccountActor present, or Person-linked GLOBAL Account)." >&2
  exit 1
fi

historical_audit_present="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM authz_audit_logs WHERE id='test-rehearsal-pre30i-audit';")"
if [ "$historical_audit_present" = "1" ]; then
  historical_support_lease="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM authz_audit_logs WHERE id='test-rehearsal-pre30i-audit' AND support_lease_id IS NULL;")"
  if [ "$historical_support_lease" != "1" ]; then
    echo "Historical pre-30I audit row was not preserved with NULL support_lease_id." >&2
    exit 1
  fi
fi

inactive_fixture_present="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM auth_user_accounts WHERE id='test-rehearsal-inactive-account';")"
if [ "$inactive_fixture_present" = "1" ]; then
  inactive_fixture_migrated="$(sqlite3 "$DB_PATH" "
SELECT COUNT(*)
FROM auth_user_accounts a
JOIN auth_account_people ap ON ap.account_id=a.id
JOIN global_people gp ON gp.id=ap.person_id
JOIN auth_account_actors aa ON aa.account_id=a.id AND aa.actor_id='test-rehearsal-inactive-actor'
JOIN authz_actors az ON az.id=aa.actor_id
JOIN authz_actor_role_grants g ON g.actor_id=az.id AND g.id='test-rehearsal-inactive-expense-grant'
WHERE a.id='test-rehearsal-inactive-account'
  AND a.active=0
  AND a.security_suspended=0
  AND gp.operational_active=0
  AND az.active=0
  AND g.active=1
  AND g.lifecycle_suspended=1;
")"
  if [ "$inactive_fixture_migrated" != "1" ]; then
    echo "Historical inactive Person/Account/Actor/Role Grant was not normalized by migration 000064." >&2
    exit 1
  fi
fi

printf '%s\n' \
  "Migrated database verification passed." \
  "Database: ${DB_PATH}" \
  "Expected migrations: ${expected_count}" \
  "Baseline last migration: ${EXPECTED_BASELINE_LAST_MIGRATION}" \
  "First rehearsed migration: ${EXPECTED_FIRST_REHEARSED_MIGRATION}" \
  "Final migration: ${EXPECTED_FINAL_MIGRATION}" \
  "Integrity check: ok" \
  "Foreign key check: clean" \
  "Application Administrator standing authority: control-plane only" \
  "Application Administrator tenant-identity violations: 0" \
  "Audit history guards: append-only" \
  "30J audit identity schema: $([ "$audit_identity_migration_count" = "1" ] && printf 'present' || printf 'not-yet-applied')" \
  "30K.3A legacy identity bridge: $([ "$legacy_identity_bridge_count" = "1" ] && printf 'present' || printf 'not-yet-applied')" \
  "30K.3B physical legacy identity removal: $([ "$physical_legacy_removal_count" = "1" ] && printf 'present' || printf 'not-yet-applied')"
