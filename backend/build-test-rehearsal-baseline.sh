#!/usr/bin/env sh
set -eu

ENVIRONMENT="${APP_ENV:-}"
TARGET_DB="${TEST_RELEASE_BASELINE_DB:-/rehearsal-baseline/pre-bite30i.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
EXPECTED_LAST_MIGRATION="${EXPECTED_LAST_MIGRATION:-000062_tenant_administrator_cardinality.up.sql}"
MIGRATION_UNDER_REHEARSAL="${MIGRATION_UNDER_REHEARSAL:-000063_global_administration_control_plane.up.sql}"
EXPECTED_FINAL_MIGRATION="${EXPECTED_FINAL_MIGRATION:-000069_physical_legacy_identity_schema_removal.up.sql}"
VERIFY_MIGRATED_DB_SCRIPT="${VERIFY_MIGRATED_DB_SCRIPT:-$(dirname "$0")/verify-migrated-db.sh}"
TMP_DB="${TARGET_DB}.building.$$"
PROBE_DB="${TARGET_DB}.probe.$$"

if [ "$ENVIRONMENT" != "test" ]; then
  echo "Refusing Test release-baseline build for APP_ENV=${ENVIRONMENT:-unset}. Only Test may build this baseline." >&2
  exit 2
fi
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Missing migrations directory: $MIGRATIONS_DIR" >&2
  exit 2
fi
if [ -e "$TARGET_DB" ]; then
  echo "Refusing to overwrite existing Test release baseline: $TARGET_DB" >&2
  exit 2
fi

mkdir -p "$(dirname "$TARGET_DB")"
rm -f "$TMP_DB" "$TMP_DB-wal" "$TMP_DB-shm" "$PROBE_DB" "$PROBE_DB-wal" "$PROBE_DB-shm"
cleanup() {
  rm -f "$TMP_DB" "$TMP_DB-wal" "$TMP_DB-shm" "$PROBE_DB" "$PROBE_DB-wal" "$PROBE_DB-shm"
}
trap cleanup EXIT INT TERM

sqlite3 "$TMP_DB" <<'SQL'
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL

applied_count=0
expected_seen=0
for migration in "$MIGRATIONS_DIR"/*.up.sql; do
  filename="$(basename "$migration")"
  if [ "$filename" = "$MIGRATION_UNDER_REHEARSAL" ]; then
    break
  fi

  echo "Applying migration to Test rehearsal baseline: $filename"
  # Match the established ERS migration-runner contract: execute the migration
  # file to EOF, then record the filename in a separate sqlite3 invocation.
  sqlite3 -bail "$TMP_DB" < "$migration"
  escaped_filename="$(printf '%s' "$filename" | sed "s/'/''/g")"
  sqlite3 -bail "$TMP_DB" "INSERT OR IGNORE INTO schema_migrations(filename) VALUES ('$escaped_filename');"
  applied_count=$((applied_count + 1))

  if [ "$filename" = "$EXPECTED_LAST_MIGRATION" ]; then
    expected_seen=1
    break
  fi
done

if [ "$expected_seen" != "1" ]; then
  echo "Expected last pre-release migration was not reached: $EXPECTED_LAST_MIGRATION" >&2
  exit 2
fi

# Seed a small deterministic pre-30I authorization shape. Bite 30H is already
# present in this baseline, so two distinct global Persons validly occupy both
# Tenant Administrator slots in the default Tenant. One slot deliberately uses
# the same stable identity as deployed Playwright. The baseline also retains a
# legacy Application Administrator tenant-data permission and one historical
# audit row so the 30I probe proves those records migrate to the final 30I model.
sqlite3 -bail "$TMP_DB" <<'SQL'
PRAGMA foreign_keys = ON;

-- Preserve the tenant-local Person compatibility projection as a real
-- pre-30I database does. The later canonical AccountActor/Membership bindings
-- deliberately agree with that historical projection so the release rehearsal
-- proves migrations through 000069 preserve canonical identity while current startup
-- validates only the canonical graph.
INSERT INTO people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  country, profile_completion_status, can_create_collaborator,
  status_id, notes, created_at, updated_at, tenant_id
) VALUES
  (
    'e2e-default-tenant-admin-legacy-person', 'E2E', 'Tenant Administrator', 'e2e-default-tenant-admin',
    'e2e-default-tenant-admin-cpf', 'e2e-default-tenant-admin-rg', 'e2e-default-tenant-admin-cellular', 'tenant-admin@example.com',
    'Brasil', 'COMPLETE', 1, 'ref-person-status-active',
    'Pre-30I deterministic E2E default Tenant Administrator legacy Person projection',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'default'
  ),
  (
    'test-rehearsal-legacy-person-b', 'Release', 'Rehearsal B', 'Rehearsal Admin B',
    '99000000002', 'REHEARSAL-RG-B', '+5599000000002', 'release-rehearsal-admin-b@example.test',
    'Brasil', 'COMPLETE', 1, 'ref-person-status-active',
    'Pre-30I release-rehearsal legacy Person projection B',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'default'
  );

INSERT INTO global_people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  country, profile_completion_status, can_create_collaborator,
  created_at, updated_at
) VALUES
  (
    'e2e-default-tenant-admin-person', 'E2E', 'Tenant Administrator', 'e2e-default-tenant-admin',
    'e2e-default-tenant-admin-cpf', 'e2e-default-tenant-admin-rg', 'e2e-default-tenant-admin-cellular', 'tenant-admin@example.com',
    'Brasil', 'COMPLETE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'test-rehearsal-global-person-b', 'Release', 'Rehearsal B', 'Rehearsal Admin B',
    '99000000002', 'REHEARSAL-RG-B', '+5599000000002', 'release-rehearsal-admin-b@example.test',
    'Brasil', 'COMPLETE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO person_tenant_memberships (
  id, created_at, updated_at, tenant_id, person_id, status_id, notes, legacy_person_id
) VALUES
  (
    'e2e-default-tenant-admin-membership', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    'default', 'e2e-default-tenant-admin-person', 'ref-person-status-active',
    'Pre-30I deterministic E2E default Tenant Administrator', 'e2e-default-tenant-admin-legacy-person'
  ),
  (
    'test-rehearsal-membership-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    'default', 'test-rehearsal-global-person-b', 'ref-person-status-active',
    'Pre-30I release-rehearsal Tenant Administrator B', 'test-rehearsal-legacy-person-b'
  );

INSERT INTO authz_actors (
  id, actor_key, display_name, person_id, collaborator_id, active, created_at, updated_at
) VALUES
  (
    'e2e-default-tenant-admin-actor', 'e2e-default-tenant-admin',
    'e2e-default-tenant-admin', 'e2e-default-tenant-admin-legacy-person', NULL, 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'test-rehearsal-actor-b', 'test-rehearsal-tenant-admin-b',
    'Release Rehearsal Tenant Administrator B', 'test-rehearsal-legacy-person-b', NULL, 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO auth_user_accounts (
  id, actor_id, login, password_hash, active, must_change_password, created_at, updated_at
) VALUES
  (
    'e2e-default-tenant-admin-account', 'e2e-default-tenant-admin-actor',
    'tenant-admin@example.com', 'release-rehearsal-placeholder-hash-a',
    1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'test-rehearsal-account-b', 'test-rehearsal-actor-b',
    'release-rehearsal-admin-b@example.test', 'release-rehearsal-placeholder-hash-b',
    1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO auth_account_people (account_id, person_id, created_at, updated_at) VALUES
  ('e2e-default-tenant-admin-account', 'e2e-default-tenant-admin-person', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('test-rehearsal-account-b', 'test-rehearsal-global-person-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO auth_account_actors (
  account_id, actor_id, scope_type, tenant_id, membership_id, is_primary, created_at, updated_at
) VALUES
  (
    'e2e-default-tenant-admin-account', 'e2e-default-tenant-admin-actor', 'TENANT', 'default',
    'e2e-default-tenant-admin-membership', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'test-rehearsal-account-b', 'test-rehearsal-actor-b', 'TENANT', 'default',
    'test-rehearsal-membership-b', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO authz_actor_role_grants (
  id, actor_id, role_id, tenant_id, active, created_at, updated_at
) VALUES
  (
    'authz-grant-e2e-default-tenant-admin-actor-TENANT_ADMIN-default', 'e2e-default-tenant-admin-actor',
    'authz-role-tenant-admin', 'default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'test-rehearsal-tenant-admin-grant-b', 'test-rehearsal-actor-b',
    'authz-role-tenant-admin', 'default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

-- Make the pre-30I standing Tenant-data authority explicit. Migration 000063
-- must remove this from APPLICATION_ADMIN while retaining control-plane access.
INSERT OR IGNORE INTO authz_role_permissions(role_id, permission_code, created_at)
VALUES ('authz-role-application-admin', 'people.read', CURRENT_TIMESTAMP);

-- Migration 000066 must preserve historical append-only audit rows and add a
-- NULL support_lease_id attribution column rather than rewriting old history.
INSERT INTO authz_audit_logs(
  id, occurred_at, actor_id, actor_record_id, tenant_id, permission_code, operation,
  target_type, target_id, decision, reason, request_method, request_path, created_at
) VALUES (
  'test-rehearsal-pre30i-audit', CURRENT_TIMESTAMP, NULL, NULL, '*', 'people.read',
  'pre30i.application_admin.tenant_data', 'release_rehearsal', 'pre30i', 'AUTHORIZED',
  'Historical pre-30I standing Tenant-data authority', 'GET', '/api/v1/people', CURRENT_TIMESTAMP
);

-- Exercise the 000064 lifecycle backfill with a historical ordinary Account
-- whose only Membership is explicitly INACTIVE while its Account, Actor, and
-- delegated Role Grant are still marked active in the pre-30I schema.
INSERT INTO people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  country, profile_completion_status, can_create_collaborator,
  status_id, notes, created_at, updated_at, tenant_id
) VALUES (
  'test-rehearsal-inactive-legacy-person', 'Release', 'Inactive', 'Rehearsal Inactive',
  '99000000003', 'REHEARSAL-RG-INACTIVE', '+5599000000003', 'release-rehearsal-inactive@example.test',
  'Brasil', 'COMPLETE', 1, 'ref-person-status-inactive',
  'Pre-30I inactive lifecycle migration fixture', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'default'
);

INSERT INTO global_people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  country, profile_completion_status, can_create_collaborator, created_at, updated_at
) VALUES (
  'test-rehearsal-inactive-global-person', 'Release', 'Inactive', 'Rehearsal Inactive',
  '99000000003', 'REHEARSAL-RG-INACTIVE', '+5599000000003', 'release-rehearsal-inactive@example.test',
  'Brasil', 'COMPLETE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO person_tenant_memberships (
  id, created_at, updated_at, tenant_id, person_id, status_id, notes, legacy_person_id
) VALUES (
  'test-rehearsal-inactive-membership', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'default',
  'test-rehearsal-inactive-global-person', 'ref-person-status-inactive',
  'Pre-30I inactive lifecycle migration fixture', 'test-rehearsal-inactive-legacy-person'
);

INSERT INTO authz_actors (
  id, actor_key, display_name, person_id, collaborator_id, active, created_at, updated_at
) VALUES (
  'test-rehearsal-inactive-actor', 'test-rehearsal-inactive', 'Release Rehearsal Inactive',
  'test-rehearsal-inactive-legacy-person', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO auth_user_accounts (
  id, actor_id, login, password_hash, active, must_change_password, created_at, updated_at
) VALUES (
  'test-rehearsal-inactive-account', 'test-rehearsal-inactive-actor',
  'release-rehearsal-inactive@example.test', 'release-rehearsal-placeholder-hash-inactive',
  1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO auth_account_people(account_id, person_id, created_at, updated_at) VALUES (
  'test-rehearsal-inactive-account', 'test-rehearsal-inactive-global-person', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO auth_account_actors(
  account_id, actor_id, scope_type, tenant_id, membership_id, is_primary, created_at, updated_at
) VALUES (
  'test-rehearsal-inactive-account', 'test-rehearsal-inactive-actor', 'TENANT', 'default',
  'test-rehearsal-inactive-membership', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO authz_actor_role_grants(
  id, actor_id, role_id, tenant_id, active, created_at, updated_at
) VALUES (
  'test-rehearsal-inactive-expense-grant', 'test-rehearsal-inactive-actor',
  'authz-role-expense-operator', 'default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SQL

integrity="$(sqlite3 "$TMP_DB" "PRAGMA integrity_check;")"
if [ "$integrity" != "ok" ]; then
  echo "Generated Test release baseline integrity_check failed: $integrity" >&2
  exit 1
fi
foreign_key_violations="$(sqlite3 "$TMP_DB" "PRAGMA foreign_key_check;")"
if [ -n "$foreign_key_violations" ]; then
  echo "Generated Test release baseline foreign_key_check failed:" >&2
  printf '%s\n' "$foreign_key_violations" >&2
  exit 1
fi

actual_last="$(sqlite3 "$TMP_DB" "SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1;")"
if [ "$actual_last" != "$EXPECTED_LAST_MIGRATION" ]; then
  echo "Generated Test release baseline ended at $actual_last; expected $EXPECTED_LAST_MIGRATION." >&2
  exit 1
fi
forbidden_present="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM schema_migrations WHERE filename='$MIGRATION_UNDER_REHEARSAL';")"
if [ "$forbidden_present" != "0" ]; then
  echo "Generated Test release baseline unexpectedly contains $MIGRATION_UNDER_REHEARSAL." >&2
  exit 1
fi
admin_count="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM authz_actor_role_grants WHERE role_id='authz-role-tenant-admin' AND tenant_id='default' AND active=1;")"
distinct_people="$(sqlite3 "$TMP_DB" "SELECT COUNT(DISTINCT m.person_id) FROM authz_actor_role_grants g JOIN auth_account_actors aa ON aa.actor_id=g.actor_id AND aa.scope_type='TENANT' AND aa.tenant_id=g.tenant_id JOIN person_tenant_memberships m ON m.id=aa.membership_id AND m.tenant_id=aa.tenant_id WHERE g.role_id='authz-role-tenant-admin' AND g.tenant_id='default' AND g.active=1;")"
if [ "$admin_count" != "2" ] || [ "$distinct_people" != "2" ]; then
  echo "Generated Test release baseline does not contain the expected two distinct valid Tenant Administrators." >&2
  exit 1
fi
fixture_slot_count="$(sqlite3 "$TMP_DB" "
SELECT COUNT(*)
FROM authz_actor_role_grants g
JOIN authz_actors az ON az.id = g.actor_id
JOIN auth_account_actors aa
  ON aa.actor_id = az.id
 AND aa.scope_type = 'TENANT'
 AND aa.tenant_id = g.tenant_id
JOIN auth_user_accounts a ON a.id = aa.account_id
JOIN person_tenant_memberships m
  ON m.id = aa.membership_id
 AND m.tenant_id = aa.tenant_id
WHERE g.role_id = 'authz-role-tenant-admin'
  AND g.tenant_id = 'default'
  AND g.active = 1
  AND az.id = 'e2e-default-tenant-admin-actor'
  AND az.actor_key = 'e2e-default-tenant-admin'
  AND a.id = 'e2e-default-tenant-admin-account'
  AND a.login = 'tenant-admin@example.com'
  AND aa.membership_id = 'e2e-default-tenant-admin-membership'
  AND m.person_id = 'e2e-default-tenant-admin-person';
")"
if [ "$fixture_slot_count" != "1" ]; then
  echo "Generated Test release baseline does not reserve one valid default-Tenant slot for the deterministic E2E Tenant Administrator." >&2
  exit 1
fi

# The deterministic pre-30I baseline deliberately contains both its historical
# compatibility links and the canonical 30C AccountActor/Membership graph. They
# must agree before the later migrations are rehearsed; 30K.3A then preserves
# the historical values while current runtime identity uses only the canonical graph.
legacy_explicit_alignment="$(sqlite3 "$TMP_DB" "
SELECT COUNT(*)
FROM auth_user_accounts a
JOIN authz_actors az ON az.id = a.actor_id
JOIN person_tenant_memberships legacy_m ON legacy_m.legacy_person_id = az.person_id
JOIN auth_account_people ap ON ap.account_id = a.id AND ap.person_id = legacy_m.person_id
JOIN auth_account_actors aa
  ON aa.account_id = a.id
 AND aa.actor_id = az.id
 AND aa.scope_type = 'TENANT'
 AND aa.tenant_id = legacy_m.tenant_id
 AND aa.membership_id = legacy_m.id
WHERE a.id IN ('e2e-default-tenant-admin-account', 'test-rehearsal-account-b');
")"
if [ "$legacy_explicit_alignment" != "2" ]; then
  echo "Generated Test release baseline has inconsistent legacy and explicit Account/Actor Membership bindings." >&2
  exit 1
fi

legacy_tenant_permission="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM authz_role_permissions WHERE role_id='authz-role-application-admin' AND permission_code='people.read';")"
if [ "$legacy_tenant_permission" != "1" ]; then
  echo "Generated pre-30I baseline does not contain the legacy Application Administrator Tenant-data permission." >&2
  exit 1
fi
historical_audit_count="$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM authz_audit_logs WHERE id='test-rehearsal-pre30i-audit';")"
if [ "$historical_audit_count" != "1" ]; then
  echo "Generated pre-30I baseline does not contain the historical audit fixture." >&2
  exit 1
fi

# Prove a copy of the baseline can take the complete 30I migration sequence,
# without mutating the saved pre-release snapshot.
cp "$TMP_DB" "$PROBE_DB"

probe_started=0
probe_final_seen=0
probe_count=0
for migration in "$MIGRATIONS_DIR"/*.up.sql; do
  filename="$(basename "$migration")"
  if [ "$filename" = "$MIGRATION_UNDER_REHEARSAL" ]; then
    probe_started=1
  fi
  if [ "$probe_started" != "1" ]; then
    continue
  fi

  echo "Applying migration to release rehearsal probe: $filename"
  sqlite3 -bail "$PROBE_DB" < "$migration"
  escaped_filename="$(printf '%s' "$filename" | sed "s/'/''/g")"
  sqlite3 -bail "$PROBE_DB" "INSERT OR IGNORE INTO schema_migrations(filename) VALUES ('$escaped_filename');"
  probe_count=$((probe_count + 1))

  if [ "$filename" = "$EXPECTED_FINAL_MIGRATION" ]; then
    probe_final_seen=1
    break
  fi
done

if [ "$probe_started" != "1" ]; then
  echo "Missing first migration under rehearsal: $MIGRATION_UNDER_REHEARSAL" >&2
  exit 2
fi
if [ "$probe_final_seen" != "1" ]; then
  echo "Expected final rehearsal migration was not reached: $EXPECTED_FINAL_MIGRATION" >&2
  exit 2
fi
if [ ! -x "$VERIFY_MIGRATED_DB_SCRIPT" ]; then
  echo "Missing migrated-database verifier: $VERIFY_MIGRATED_DB_SCRIPT" >&2
  exit 2
fi

APP_ENV=test \
DATABASE_PATH="$PROBE_DB" \
MIGRATIONS_DIR="$MIGRATIONS_DIR" \
EXPECTED_BASELINE_LAST_MIGRATION="$EXPECTED_LAST_MIGRATION" \
EXPECTED_FIRST_REHEARSED_MIGRATION="$MIGRATION_UNDER_REHEARSAL" \
EXPECTED_FINAL_MIGRATION="$EXPECTED_FINAL_MIGRATION" \
  "$VERIFY_MIGRATED_DB_SCRIPT"

mv "$TMP_DB" "$TARGET_DB"
trap - EXIT INT TERM
rm -f "$PROBE_DB" "$PROBE_DB-wal" "$PROBE_DB-shm"

printf '%s\n' \
  "Deterministic pre-30I Test release baseline is ready." \
  "Baseline: ${TARGET_DB}" \
  "Applied baseline migrations: ${applied_count}" \
  "Baseline last migration: ${EXPECTED_LAST_MIGRATION}" \
  "First rehearsed migration: ${MIGRATION_UNDER_REHEARSAL}" \
  "Final rehearsed migration: ${EXPECTED_FINAL_MIGRATION}" \
  "Rehearsed migrations: ${probe_count}" \
  "Integrity check: ok" \
  "Foreign key check: clean"
