package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestCrossTenantDelegatedRoleIsolationMigrationGuardsInsertReactivateAndExplicitRevocation(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	if _, err := sqlDB.Exec(crossTenantDelegatedRoleIsolationSchema + crossTenantDelegatedRoleIsolationFixture); err != nil {
		t.Fatalf("create Bite 32.4 migration fixture: %v", err)
	}
	applyCrossTenantDelegatedRoleMigration(t, sqlDB, "000071_cross_tenant_delegated_role_isolation.up.sql")

	// Multiple delegated Roles in the same Tenant are allowed.
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-a-earnings', 'actor-a', 'role-earnings', 'tenant-a', 1, 0)
`); err != nil {
		t.Fatalf("same-Tenant second delegated Role should be allowed: %v", err)
	}

	// Baseline Membership in Tenant B is allowed, but delegated authority there
	// conflicts while Tenant A retains any active delegated grant.
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-b-expense', 'actor-b', 'role-expense', 'tenant-b', 1, 0)
`); err == nil || !strings.Contains(err.Error(), "delegated_role_person_cross_tenant") {
		t.Fatalf("expected cross-Tenant delegated Role insertion rejection, got %v", err)
	}

	// The guard is defined by TENANT scope, not by today's enumerated Role codes.
	// A future Tenant Role must be blocked by the same Person-wide boundary.
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-b-future', 'actor-b', 'role-future', 'tenant-b', 1, 0)
`); err == nil || !strings.Contains(err.Error(), "delegated_role_person_cross_tenant") {
		t.Fatalf("expected unenumerated future Tenant Role insertion rejection, got %v", err)
	}

	// Reactivating a historical grant is guarded just like insertion.
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-b-inactive', 'actor-b', 'role-expense', 'tenant-b', 0, 0)
`); err != nil {
		t.Fatalf("create inactive Tenant B grant fixture: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET active = 1 WHERE id = 'grant-b-inactive'`); err == nil || !strings.Contains(err.Error(), "delegated_role_person_cross_tenant") {
		t.Fatalf("expected cross-Tenant grant reactivation rejection, got %v", err)
	}

	// lifecycle_suspended does not release the authority Tenant; active=1 is
	// intentionally preserved until explicit revocation.
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET lifecycle_suspended = 1 WHERE id = 'grant-a-expense'`); err != nil {
		t.Fatalf("lifecycle-suspend Tenant A grant: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET active = 1 WHERE id = 'grant-b-inactive'`); err == nil || !strings.Contains(err.Error(), "delegated_role_person_cross_tenant") {
		t.Fatalf("expected lifecycle-suspended active Tenant A grant to continue blocking Tenant B, got %v", err)
	}

	// Explicitly revoking every Tenant A delegated grant releases the Person for
	// a delegated Role in Tenant B.
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET active = 0 WHERE id IN ('grant-a-expense','grant-a-earnings')`); err != nil {
		t.Fatalf("revoke Tenant A delegated Roles: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET active = 1 WHERE id = 'grant-b-inactive'`); err != nil {
		t.Fatalf("explicit revocation should release cross-Tenant delegation boundary: %v", err)
	}

	// Application-global authority is a separate control-plane model and does
	// not participate in the Tenant delegated-role invariant.
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-global-app', 'actor-global', 'role-application', '*', 1, 0)
`); err != nil {
		t.Fatalf("application-global Role must remain outside Bite 32.4 Tenant isolation: %v", err)
	}

	applyCrossTenantDelegatedRoleMigration(t, sqlDB, "000071_cross_tenant_delegated_role_isolation.down.sql")
	if _, err := sqlDB.Exec(`
UPDATE authz_actor_role_grants SET active = 1 WHERE id = 'grant-a-expense'
`); err != nil {
		t.Fatalf("down migration should remove Bite 32.4 cross-Tenant trigger: %v", err)
	}
}

func TestCrossTenantDelegatedRoleIsolationMigrationQuarantinesExistingConflict(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	if _, err := sqlDB.Exec(crossTenantDelegatedRoleIsolationSchema + crossTenantDelegatedRoleIsolationFixture + `
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-b-existing', 'actor-b', 'role-future', 'tenant-b', 1, 0);
`); err != nil {
		t.Fatalf("create legacy cross-Tenant conflict fixture: %v", err)
	}

	applyCrossTenantDelegatedRoleMigration(t, sqlDB, "000071_cross_tenant_delegated_role_isolation.up.sql")

	rows, err := sqlDB.Query(`
SELECT id, active, lifecycle_suspended
FROM authz_actor_role_grants
WHERE id IN ('grant-a-expense', 'grant-b-existing')
ORDER BY id
`)
	if err != nil {
		t.Fatalf("query quarantined legacy grants: %v", err)
	}
	defer rows.Close()

	seen := 0
	for rows.Next() {
		var id string
		var active, suspended bool
		if err := rows.Scan(&id, &active, &suspended); err != nil {
			t.Fatalf("scan quarantined legacy grant: %v", err)
		}
		seen++
		if !active || !suspended {
			t.Fatalf("legacy conflicting grant %s must remain assigned but lifecycle-suspended, active=%v suspended=%v", id, active, suspended)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate quarantined legacy grants: %v", err)
	}
	if seen != 2 {
		t.Fatalf("expected both legacy conflicting grants to remain present, got %d", seen)
	}

	// A quarantined assignment still reserves its Tenant. Unsuspending either
	// side before the other Tenant explicitly revokes its assignment must fail.
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET lifecycle_suspended = 0 WHERE id = 'grant-a-expense'`); err == nil || !strings.Contains(err.Error(), "delegated_role_person_cross_tenant") {
		t.Fatalf("expected quarantined grant unsuspension to remain blocked by the other Tenant assignment, got %v", err)
	}

	// Explicit revocation in Tenant B resolves the assigned cross-Tenant conflict.
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET active = 0 WHERE id = 'grant-b-existing'`); err != nil {
		t.Fatalf("explicitly revoke quarantined Tenant B grant: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET lifecycle_suspended = 0 WHERE id = 'grant-a-expense'`); err != nil {
		t.Fatalf("resolved legacy conflict should permit retained Tenant A grant: %v", err)
	}
}

const crossTenantDelegatedRoleIsolationSchema = `
CREATE TABLE authz_roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE authz_actors (
  id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE person_tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL
);
CREATE TABLE auth_account_actors (
  account_id TEXT NOT NULL,
  actor_id TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL,
  tenant_id TEXT NULL,
  membership_id TEXT NULL
);
CREATE TABLE authz_actor_role_grants (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  lifecycle_suspended INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

const crossTenantDelegatedRoleIsolationFixture = `
INSERT INTO authz_roles(id, code, scope_type, active) VALUES
  ('role-expense', 'EXPENSE_OPERATOR', 'TENANT', 1),
  ('role-earnings', 'EARNINGS_OPERATOR', 'TENANT', 1),
  ('role-tenant-admin', 'TENANT_ADMIN', 'TENANT', 1),
  ('role-future', 'FUTURE_TENANT_ROLE', 'TENANT', 1),
  ('role-application', 'APPLICATION_ADMIN', 'APPLICATION', 1);
INSERT INTO authz_actors(id, active) VALUES
  ('actor-a', 1),
  ('actor-b', 1),
  ('actor-global', 1);
INSERT INTO person_tenant_memberships(id, tenant_id, person_id) VALUES
  ('membership-a', 'tenant-a', 'person-shared'),
  ('membership-b', 'tenant-b', 'person-shared');
INSERT INTO auth_account_actors(account_id, actor_id, scope_type, tenant_id, membership_id) VALUES
  ('account-a', 'actor-a', 'TENANT', 'tenant-a', 'membership-a'),
  ('account-b', 'actor-b', 'TENANT', 'tenant-b', 'membership-b'),
  ('account-global', 'actor-global', 'GLOBAL', NULL, NULL);
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended)
VALUES ('grant-a-expense', 'actor-a', 'role-expense', 'tenant-a', 1, 0);
`

func applyCrossTenantDelegatedRoleMigration(t *testing.T, sqlDB *sql.DB, name string) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join("..", "..", "migrations", name))
	if err != nil {
		t.Fatalf("read migration %s: %v", name, err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply migration %s: %v", name, err)
	}
}
