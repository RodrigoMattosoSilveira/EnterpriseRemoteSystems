package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestTenantDrivenPersonReactivationMigrationBackfillsLifecycleBoundaries(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	_, err = sqlDB.Exec(`
CREATE TABLE global_people (id TEXT PRIMARY KEY);
CREATE TABLE auth_user_accounts (id TEXT PRIMARY KEY, active INTEGER NOT NULL);
CREATE TABLE auth_account_people (account_id TEXT PRIMARY KEY, person_id TEXT NOT NULL);
CREATE TABLE authz_actors (id TEXT PRIMARY KEY, active INTEGER NOT NULL);
CREATE TABLE authz_actor_role_grants (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, tenant_id TEXT NOT NULL, active INTEGER NOT NULL);
CREATE TABLE person_tenant_memberships (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, person_id TEXT NOT NULL, status_id TEXT NOT NULL);
CREATE TABLE reference_data (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, type TEXT NOT NULL, code TEXT NOT NULL, active INTEGER NOT NULL);
CREATE TABLE auth_account_actors (account_id TEXT NOT NULL, actor_id TEXT NOT NULL, scope_type TEXT NOT NULL, tenant_id TEXT, membership_id TEXT);

INSERT INTO global_people(id) VALUES ('person-active'), ('person-inactive'), ('person-discontinued'), ('person-mixed');
INSERT INTO reference_data(id, tenant_id, type, code, active) VALUES
  ('status-active', 'tenant-a', 'person_status', 'ACTIVE', 1),
  ('status-inactive', 'tenant-a', 'person_status', 'INACTIVE', 1),
  ('status-discontinued', 'tenant-a', 'person_status', 'DISCONTINUED', 1),
  ('status-active-b', 'tenant-b', 'person_status', 'ACTIVE', 1),
  ('status-inactive-b', 'tenant-b', 'person_status', 'INACTIVE', 1);
INSERT INTO person_tenant_memberships(id, tenant_id, person_id, status_id) VALUES
  ('membership-active', 'tenant-a', 'person-active', 'status-active'),
  ('membership-inactive', 'tenant-a', 'person-inactive', 'status-inactive'),
  ('membership-discontinued', 'tenant-a', 'person-discontinued', 'status-discontinued'),
  ('membership-mixed-a', 'tenant-a', 'person-mixed', 'status-inactive'),
  ('membership-mixed-b', 'tenant-b', 'person-mixed', 'status-active-b');
INSERT INTO auth_user_accounts(id, active) VALUES ('account-active', 1), ('account-operational', 1), ('account-suspended', 0);
INSERT INTO auth_account_people(account_id, person_id) VALUES
  ('account-active', 'person-active'),
  ('account-operational', 'person-inactive');
INSERT INTO authz_actors(id, active) VALUES ('actor-active', 1), ('actor-inactive', 1), ('actor-mixed-a', 1), ('actor-mixed-b', 1);
INSERT INTO auth_account_actors(account_id, actor_id, scope_type, tenant_id, membership_id) VALUES
  ('account-active', 'actor-active', 'TENANT', 'tenant-a', 'membership-active'),
  ('account-operational', 'actor-inactive', 'TENANT', 'tenant-a', 'membership-inactive'),
  ('account-active', 'actor-mixed-a', 'TENANT', 'tenant-a', 'membership-mixed-a'),
  ('account-active', 'actor-mixed-b', 'TENANT', 'tenant-b', 'membership-mixed-b');
INSERT INTO authz_actor_role_grants(id, actor_id, tenant_id, active) VALUES
  ('grant-active', 'actor-active', 'tenant-a', 1),
  ('grant-inactive-member', 'actor-inactive', 'tenant-a', 1),
  ('grant-mixed-inactive', 'actor-mixed-a', 'tenant-a', 1),
  ('grant-mixed-active', 'actor-mixed-b', 'tenant-b', 1);
`)
	if err != nil {
		t.Fatalf("create pre-000064 fixture: %v", err)
	}

	migration, err := os.ReadFile(filepath.Join("..", "..", "migrations", "000064_tenant_driven_person_reactivation.up.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := sqlDB.Exec(string(migration)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}

	assertMigrationBool(t, sqlDB, "SELECT operational_active FROM global_people WHERE id = 'person-active'", true)
	assertMigrationBool(t, sqlDB, "SELECT operational_active FROM global_people WHERE id = 'person-inactive'", false)
	assertMigrationBool(t, sqlDB, "SELECT operational_active FROM global_people WHERE id = 'person-discontinued'", true)
	assertMigrationBool(t, sqlDB, "SELECT operational_active FROM global_people WHERE id = 'person-mixed'", true)
	assertMigrationBool(t, sqlDB, "SELECT security_suspended FROM auth_user_accounts WHERE id = 'account-active'", false)
	assertMigrationBool(t, sqlDB, "SELECT active FROM auth_user_accounts WHERE id = 'account-operational'", false)
	assertMigrationBool(t, sqlDB, "SELECT security_suspended FROM auth_user_accounts WHERE id = 'account-operational'", false)
	assertMigrationBool(t, sqlDB, "SELECT security_suspended FROM auth_user_accounts WHERE id = 'account-suspended'", true)
	assertMigrationBool(t, sqlDB, "SELECT lifecycle_suspended FROM authz_actor_role_grants WHERE id = 'grant-active'", false)
	assertMigrationBool(t, sqlDB, "SELECT lifecycle_suspended FROM authz_actor_role_grants WHERE id = 'grant-inactive-member'", true)
	assertMigrationBool(t, sqlDB, "SELECT active FROM authz_actors WHERE id = 'actor-inactive'", false)
	assertMigrationBool(t, sqlDB, "SELECT active FROM authz_actors WHERE id = 'actor-mixed-a'", false)
	assertMigrationBool(t, sqlDB, "SELECT active FROM authz_actors WHERE id = 'actor-mixed-b'", true)
	assertMigrationBool(t, sqlDB, "SELECT lifecycle_suspended FROM authz_actor_role_grants WHERE id = 'grant-mixed-inactive'", true)
	assertMigrationBool(t, sqlDB, "SELECT lifecycle_suspended FROM authz_actor_role_grants WHERE id = 'grant-mixed-active'", false)
}

func assertMigrationBool(t *testing.T, sqlDB interface {
	QueryRow(query string, args ...any) *sql.Row
}, query string, expected bool) {
	t.Helper()
	var value bool
	if err := sqlDB.QueryRow(query).Scan(&value); err != nil {
		t.Fatalf("query migration assertion: %v", err)
	}
	if value != expected {
		t.Fatalf("migration assertion %q = %t, want %t", query, value, expected)
	}
}
