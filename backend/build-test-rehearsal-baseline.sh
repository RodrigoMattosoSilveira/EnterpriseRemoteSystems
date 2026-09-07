#!/usr/bin/env sh
set -eu

ENVIRONMENT="${APP_ENV:-}"
TARGET_DB="${TEST_RELEASE_BASELINE_DB:-/rehearsal-baseline/pre-bite30h.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"
EXPECTED_LAST_MIGRATION="${EXPECTED_LAST_MIGRATION:-000061_expand_final_settlement_database_checks.up.sql}"
MIGRATION_UNDER_REHEARSAL="${MIGRATION_UNDER_REHEARSAL:-000062_tenant_administrator_cardinality.up.sql}"
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
  sqlite3 -bail "$TMP_DB" "INSERT INTO schema_migrations(filename) VALUES ('$escaped_filename');"
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

# Seed a small, deterministic *valid* pre-30H authorization shape. Two distinct
# global Persons occupy both Tenant Administrator slots in the default Tenant.
# One slot deliberately uses the same stable identity as the post-migration E2E
# default Tenant Administrator fixture. This preserves the upper valid Bite 30H
# boundary while allowing deployed Playwright provisioning to reconcile that
# existing slot instead of attempting to create an invalid third administrator.
# The second slot remains a release-rehearsal-only Person so 000062 still proves
# the two-distinct-Person upper boundary. Local migration tests continue to
# exercise all deliberate rejection cases (>2, duplicate Person, cross-Tenant
# Person, and missing canonical Person).
sqlite3 -bail "$TMP_DB" <<'SQL'
PRAGMA foreign_keys = ON;

-- Preserve the tenant-local Person compatibility projection as a real
-- pre-30H database would. Startup's Account/Actor foundation repair resolves
-- the legacy Actor Person through person_tenant_memberships.legacy_person_id;
-- omitting this bridge creates a hybrid fixture that migration 000062 accepts
-- but the application correctly rejects during bootstrap.
INSERT INTO people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  country, profile_completion_status, can_create_collaborator,
  status_id, notes, created_at, updated_at, tenant_id
) VALUES
  (
    'e2e-default-tenant-admin-legacy-person', 'E2E', 'Tenant Administrator', 'e2e-default-tenant-admin',
    'e2e-default-tenant-admin-cpf', 'e2e-default-tenant-admin-rg', 'e2e-default-tenant-admin-cellular', 'tenant-admin@example.com',
    'Brasil', 'COMPLETE', 1, 'ref-person-status-active',
    'Pre-30H deterministic E2E default Tenant Administrator legacy Person projection',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'default'
  ),
  (
    'test-rehearsal-legacy-person-b', 'Release', 'Rehearsal B', 'Rehearsal Admin B',
    '99000000002', 'REHEARSAL-RG-B', '+5599000000002', 'release-rehearsal-admin-b@example.test',
    'Brasil', 'COMPLETE', 1, 'ref-person-status-active',
    'Pre-30H release-rehearsal legacy Person projection B',
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
    'Pre-30H deterministic E2E default Tenant Administrator', 'e2e-default-tenant-admin-legacy-person'
  ),
  (
    'test-rehearsal-membership-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    'default', 'test-rehearsal-global-person-b', 'ref-person-status-active',
    'Pre-30H release-rehearsal Tenant Administrator B', 'test-rehearsal-legacy-person-b'
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

# A pre-30H account must resolve to the same Membership through both the
# compatibility path (Account.actor_id -> Actor.person_id -> legacy_person_id)
# and the explicit 30C path (auth_account_actors.membership_id). This is the
# identity shape that EnsureAccountActorFoundation() expects during startup.
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

# Prove the baseline itself can take the migration under rehearsal, without
# mutating the saved pre-release snapshot.
cp "$TMP_DB" "$PROBE_DB"
migration_path="$MIGRATIONS_DIR/$MIGRATION_UNDER_REHEARSAL"
if [ ! -f "$migration_path" ]; then
  echo "Missing migration under rehearsal: $migration_path" >&2
  exit 2
fi
sqlite3 -bail "$PROBE_DB" < "$migration_path"
escaped_rehearsal="$(printf '%s' "$MIGRATION_UNDER_REHEARSAL" | sed "s/'/''/g")"
sqlite3 -bail "$PROBE_DB" "INSERT INTO schema_migrations(filename) VALUES ('$escaped_rehearsal');"
trigger_count="$(sqlite3 "$PROBE_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_tenant_admin_%';")"
probe_integrity="$(sqlite3 "$PROBE_DB" "PRAGMA integrity_check;")"
probe_fk="$(sqlite3 "$PROBE_DB" "PRAGMA foreign_key_check;")"
if [ "$trigger_count" != "8" ] || [ "$probe_integrity" != "ok" ] || [ -n "$probe_fk" ]; then
  echo "Generated Test release baseline failed the migration-under-rehearsal probe." >&2
  echo "Bite 30H triggers: $trigger_count" >&2
  echo "Integrity: $probe_integrity" >&2
  if [ -n "$probe_fk" ]; then printf '%s\n' "$probe_fk" >&2; fi
  exit 1
fi

mv "$TMP_DB" "$TARGET_DB"
rm -f "$PROBE_DB" "$PROBE_DB-wal" "$PROBE_DB-shm"
trap - EXIT INT TERM

baseline_sha256="$(sha256sum "$TARGET_DB" | awk '{print $1}')"
printf '%s\n' \
  "Generated deterministic Test release-rehearsal baseline." \
  "Baseline: $TARGET_DB" \
  "Baseline SHA-256: $baseline_sha256" \
  "Last migration: $EXPECTED_LAST_MIGRATION" \
  "Migration under rehearsal: $MIGRATION_UNDER_REHEARSAL" \
  "Pre-release migrations applied: $applied_count" \
  "Representative Tenant Administrators: deterministic E2E default admin + one distinct rehearsal admin" \
  "Deterministic E2E default Tenant Administrator slot: compatible" \
  "Legacy/explicit Account-Actor identity alignment: 2/2" \
  "Migration probe triggers: $trigger_count" \
  "Integrity check: ok" \
  "Foreign key check: clean"
