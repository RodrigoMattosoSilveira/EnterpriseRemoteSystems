package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestTenantAdministratorCardinalityMigrationEnforcesTenantAndGlobalPersonLimits(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	if _, err := sqlDB.Exec(tenantAdministratorCardinalitySchema + `
INSERT INTO authz_actors(id, person_id, active) VALUES
  ('actor-a1', 'legacy-a1', 1),
  ('actor-a2', 'legacy-a2', 1),
  ('actor-a3', 'legacy-a3', 1),
  ('actor-b1', 'legacy-b1', 1),
  ('actor-a1-b', 'legacy-a1-b', 1),
  ('actor-c1', 'legacy-c1', 1),
  ('actor-c1-second', 'legacy-c1-second', 1);
INSERT INTO person_tenant_memberships(id, tenant_id, person_id) VALUES
  ('membership-a1', 'tenant-a', 'global-person-a1'),
  ('membership-a2', 'tenant-a', 'global-person-a2'),
  ('membership-a3', 'tenant-a', 'global-person-a3'),
  ('membership-b1', 'tenant-b', 'global-person-b1'),
  ('membership-a1-b', 'tenant-b', 'global-person-a1'),
  ('membership-c1', 'tenant-c', 'global-person-c1'),
  ('membership-c1-second', 'tenant-c', 'global-person-c1');
INSERT INTO auth_account_actors(account_id, actor_id, scope_type, tenant_id, membership_id) VALUES
  ('account-a1', 'actor-a1', 'TENANT', 'tenant-a', 'membership-a1'),
  ('account-a2', 'actor-a2', 'TENANT', 'tenant-a', 'membership-a2'),
  ('account-a3', 'actor-a3', 'TENANT', 'tenant-a', 'membership-a3'),
  ('account-b1', 'actor-b1', 'TENANT', 'tenant-b', 'membership-b1'),
  ('account-a1-b', 'actor-a1-b', 'TENANT', 'tenant-b', 'membership-a1-b'),
  ('account-c1', 'actor-c1', 'TENANT', 'tenant-c', 'membership-c1'),
  ('account-c1-second', 'actor-c1-second', 'TENANT', 'tenant-c', 'membership-c1-second');
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active) VALUES
  ('grant-a1', 'actor-a1', 'authz-role-tenant-admin', 'tenant-a', 1),
  ('grant-a2', 'actor-a2', 'authz-role-tenant-admin', 'tenant-a', 1),
  ('grant-b1', 'actor-b1', 'authz-role-tenant-admin', 'tenant-b', 1),
  ('grant-c1', 'actor-c1', 'authz-role-tenant-admin', 'tenant-c', 1);
`); err != nil {
		t.Fatalf("create pre-30H schema: %v", err)
	}

	applyMigrationFile(t, sqlDB, "000062_tenant_administrator_cardinality.up.sql")

	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active)
VALUES ('grant-a3', 'actor-a3', 'authz-role-tenant-admin', 'tenant-a', 1)
`); err == nil || !strings.Contains(err.Error(), "tenant_administrator_tenant_limit") {
		t.Fatalf("expected third Tenant Administrator rejection, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active)
VALUES ('grant-c1-second', 'actor-c1-second', 'authz-role-tenant-admin', 'tenant-c', 1)
`); err == nil || !strings.Contains(err.Error(), "tenant_administrator_distinct_person_required") {
		t.Fatalf("expected duplicate global Person in same Tenant rejection, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active)
VALUES ('grant-a1-b', 'actor-a1-b', 'authz-role-tenant-admin', 'tenant-b', 1)
`); err == nil || !strings.Contains(err.Error(), "tenant_administrator_person_cross_tenant") {
		t.Fatalf("expected cross-Tenant global Person rejection, got %v", err)
	}

	// Actor lifecycle does not release the Role Grant slot. Tenant A already has
	// two active grants even if one Actor is unavailable.
	if _, err := sqlDB.Exec(`UPDATE authz_actors SET active = 0 WHERE id = 'actor-a2'`); err != nil {
		t.Fatalf("deactivate Tenant Administrator Actor: %v", err)
	}
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active)
VALUES ('grant-a3-after-deactivate', 'actor-a3', 'authz-role-tenant-admin', 'tenant-a', 1)
`); err == nil || !strings.Contains(err.Error(), "tenant_administrator_tenant_limit") {
		t.Fatalf("expected inactive Actor not to release Tenant Administrator slot, got %v", err)
	}

	// Reactivation is guarded just like insertion.
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active)
VALUES ('grant-a3-inactive', 'actor-a3', 'authz-role-tenant-admin', 'tenant-a', 0)
`); err != nil {
		t.Fatalf("create inactive third grant fixture: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE authz_actor_role_grants SET active = 1 WHERE id = 'grant-a3-inactive'`); err == nil || !strings.Contains(err.Error(), "tenant_administrator_tenant_limit") {
		t.Fatalf("expected third grant reactivation rejection, got %v", err)
	}

	applyMigrationFile(t, sqlDB, "000062_tenant_administrator_cardinality.down.sql")
	if _, err := sqlDB.Exec(`
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active)
VALUES ('grant-a3-after-down', 'actor-a3', 'authz-role-tenant-admin', 'tenant-a', 1)
`); err != nil {
		t.Fatalf("expected down migration to remove Bite 30H guards: %v", err)
	}
}

func TestTenantAdministratorCardinalityMigrationRejectsLegacyViolations(t *testing.T) {
	tests := []struct {
		name    string
		fixture string
		want    string
	}{
		{
			name: "more than two administrators in one Tenant",
			fixture: `
INSERT INTO authz_actors(id, person_id, active) VALUES ('a1','legacy-a1',1),('a2','legacy-a2',1),('a3','legacy-a3',1);
INSERT INTO person_tenant_memberships(id,tenant_id,person_id) VALUES ('m1','tenant-a','p1'),('m2','tenant-a','p2'),('m3','tenant-a','p3');
INSERT INTO auth_account_actors(account_id,actor_id,scope_type,tenant_id,membership_id) VALUES ('ac1','a1','TENANT','tenant-a','m1'),('ac2','a2','TENANT','tenant-a','m2'),('ac3','a3','TENANT','tenant-a','m3');
INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active) VALUES ('g1','a1','authz-role-tenant-admin','tenant-a',1),('g2','a2','authz-role-tenant-admin','tenant-a',1),('g3','a3','authz-role-tenant-admin','tenant-a',1);`,
			want: "tenant_administrator_tenant_limit",
		},
		{
			name: "same global Person administers multiple Tenants",
			fixture: `
INSERT INTO authz_actors(id, person_id, active) VALUES ('a1','legacy-a1',1),('b1','legacy-b1',1);
INSERT INTO person_tenant_memberships(id,tenant_id,person_id) VALUES ('ma','tenant-a','global-p1'),('mb','tenant-b','global-p1');
INSERT INTO auth_account_actors(account_id,actor_id,scope_type,tenant_id,membership_id) VALUES ('aca','a1','TENANT','tenant-a','ma'),('acb','b1','TENANT','tenant-b','mb');
INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active) VALUES ('g1','a1','authz-role-tenant-admin','tenant-a',1),('g2','b1','authz-role-tenant-admin','tenant-b',1);`,
			want: "tenant_administrator_person_cross_tenant",
		},
		{
			name: "same global Person occupies both Tenant slots",
			fixture: `
INSERT INTO authz_actors(id, person_id, active) VALUES ('a1','legacy-a1',1),('a2','legacy-a2',1);
INSERT INTO person_tenant_memberships(id,tenant_id,person_id) VALUES ('m1','tenant-a','global-p1'),('m2','tenant-a','global-p1');
INSERT INTO auth_account_actors(account_id,actor_id,scope_type,tenant_id,membership_id) VALUES ('ac1','a1','TENANT','tenant-a','m1'),('ac2','a2','TENANT','tenant-a','m2');
INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active) VALUES ('g1','a1','authz-role-tenant-admin','tenant-a',1),('g2','a2','authz-role-tenant-admin','tenant-a',1);`,
			want: "tenant_administrator_distinct_person_required",
		},
		{
			name: "Tenant Administrator without canonical global Person binding",
			fixture: `
INSERT INTO authz_actors(id, person_id, active) VALUES ('a1','legacy-a1',1);
INSERT INTO authz_actor_role_grants(id,actor_id,role_id,tenant_id,active) VALUES ('g1','a1','authz-role-tenant-admin','tenant-a',1);`,
			want: "tenant_administrator_global_person_required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
			if err != nil {
				t.Fatalf("open database: %v", err)
			}
			sqlDB, err := database.DB()
			if err != nil {
				t.Fatalf("access SQL database: %v", err)
			}
			defer sqlDB.Close()

			if _, err := sqlDB.Exec(tenantAdministratorCardinalitySchema + tt.fixture); err != nil {
				t.Fatalf("create legacy fixture: %v", err)
			}

			contents, err := os.ReadFile(filepath.Join("..", "..", "migrations", "000062_tenant_administrator_cardinality.up.sql"))
			if err != nil {
				t.Fatalf("read migration: %v", err)
			}
			if _, err := sqlDB.Exec(string(contents)); err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected migration error %q, got %v", tt.want, err)
			}
		})
	}
}

const tenantAdministratorCardinalitySchema = `
CREATE TABLE authz_actors (
  id TEXT PRIMARY KEY,
  person_id TEXT NULL,
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
  active INTEGER NOT NULL DEFAULT 1
);
`

func applyMigrationFile(t *testing.T, sqlDB *sql.DB, name string) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join("..", "..", "migrations", name))
	if err != nil {
		t.Fatalf("read migration %s: %v", name, err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply migration %s: %v", name, err)
	}
}
