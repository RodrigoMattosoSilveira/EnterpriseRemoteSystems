package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestTenantSupportAccessLeaseMigrationEnforcesLeaseBoundaries(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	if _, err := sqlDB.Exec(tenantSupportAccessLeaseSchema + `
INSERT INTO authz_roles(id, code, label, scope_type, active, created_at, updated_at) VALUES
  ('authz-role-application-admin', 'APPLICATION_ADMIN', 'Application Administrator', 'APPLICATION', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('authz-role-tenant-admin', 'TENANT_ADMIN', 'Tenant Administrator', 'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO authz_permissions(code, label, created_at, updated_at) VALUES
  ('authz.self.read', 'self', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('authz.read', 'authz read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('authz.manage', 'authz manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenants.read', 'tenant read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenants.create', 'tenant create', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenants.update', 'tenant update', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('people.read', 'people read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('expenses.read', 'expenses read', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO authz_role_permissions(role_id, permission_code, created_at) VALUES
  ('authz-role-application-admin', 'authz.self.read', CURRENT_TIMESTAMP),
  ('authz-role-application-admin', 'authz.read', CURRENT_TIMESTAMP),
  ('authz-role-application-admin', 'authz.manage', CURRENT_TIMESTAMP),
  ('authz-role-application-admin', 'tenants.read', CURRENT_TIMESTAMP),
  ('authz-role-application-admin', 'tenants.create', CURRENT_TIMESTAMP),
  ('authz-role-application-admin', 'tenants.update', CURRENT_TIMESTAMP);
INSERT INTO tenants(id, code, name, active, created_at, updated_at) VALUES
  ('tenant-a', 'A', 'Tenant A', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tenant-b', 'B', 'Tenant B', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO reference_data(id, tenant_id, type, code, active)
VALUES ('status-active-a', 'tenant-a', 'person_status', 'ACTIVE', 1);
INSERT INTO person_tenant_memberships(id, tenant_id, person_id, status_id)
VALUES ('membership-admin-a', 'tenant-a', 'global-admin-a', 'status-active-a');
INSERT INTO authz_actors(id, actor_key, active) VALUES
  ('actor-application-admin', 'application-admin@example.test', 1),
  ('actor-tenant-admin-a', 'tenant-admin-a@example.test', 1),
  ('actor-impostor', 'impostor@example.test', 1);
INSERT INTO auth_account_actors(account_id, actor_id, scope_type, tenant_id, membership_id) VALUES
  ('account-application-admin', 'actor-application-admin', 'GLOBAL', NULL, NULL),
  ('account-tenant-admin-a', 'actor-tenant-admin-a', 'TENANT', 'tenant-a', 'membership-admin-a');
INSERT INTO authz_actor_role_grants(id, actor_id, role_id, tenant_id, active, lifecycle_suspended) VALUES
  ('grant-application-admin', 'actor-application-admin', 'authz-role-application-admin', '*', 1, 0),
  ('grant-tenant-admin-a', 'actor-tenant-admin-a', 'authz-role-tenant-admin', 'tenant-a', 1, 0);
`); err != nil {
		t.Fatalf("create pre-30I.2 fixture: %v", err)
	}

	applyTenantSupportAccessLeaseMigrationFile(t, sqlDB, "000065_tenant_support_access_lease_domain.up.sql")

	if _, err := sqlDB.Exec(`
INSERT INTO tenant_support_access_leases(
  id, tenant_id, application_actor_id, requested_by_actor_id,
  requested_at, expires_at, reason, status, created_at, updated_at
) VALUES (
  'lease-lapsed-pending', 'tenant-b', 'actor-application-admin', 'actor-application-admin',
  datetime(CURRENT_TIMESTAMP, '-2 hours'), datetime(CURRENT_TIMESTAMP, '-1 hour'), 'Lapsed request', 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)`); err != nil {
		t.Fatalf("insert lapsed pending support access lease: %v", err)
	}
	if _, err := sqlDB.Exec(`
INSERT INTO tenant_support_access_leases(
  id, tenant_id, application_actor_id, requested_by_actor_id,
  requested_at, expires_at, reason, status, created_at, updated_at
) VALUES (
  'lease-after-lapsed-pending', 'tenant-b', 'actor-application-admin', 'actor-application-admin',
  CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+2 hours'), 'Replacement request', 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)`); err != nil {
		t.Fatalf("lapsed PENDING lease must not block a later request: %v", err)
	}

	for _, permission := range []string{"support_access_leases.read", "support_access_leases.request"} {
		var count int
		if err := sqlDB.QueryRow(`SELECT COUNT(*) FROM authz_role_permissions WHERE role_id = 'authz-role-application-admin' AND permission_code = ?`, permission).Scan(&count); err != nil {
			t.Fatalf("count Application Administrator permission %s: %v", permission, err)
		}
		if count != 1 {
			t.Fatalf("Application Administrator missing %s", permission)
		}
	}
	for _, permission := range []string{"support_access_leases.read", "support_access_leases.approve", "support_access_leases.terminate"} {
		var count int
		if err := sqlDB.QueryRow(`SELECT COUNT(*) FROM authz_role_permissions WHERE role_id = 'authz-role-tenant-admin' AND permission_code = ?`, permission).Scan(&count); err != nil {
			t.Fatalf("count Tenant Administrator permission %s: %v", permission, err)
		}
		if count != 1 {
			t.Fatalf("Tenant Administrator missing %s", permission)
		}
	}

	if _, err := sqlDB.Exec(`
INSERT INTO tenant_support_access_leases(
  id, tenant_id, application_actor_id, requested_by_actor_id,
  requested_at, expires_at, reason, status, created_at, updated_at
) VALUES (
  'lease-a', 'tenant-a', 'actor-application-admin', 'actor-application-admin',
  CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+2 hours'), 'Support incident', 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)`); err != nil {
		t.Fatalf("insert valid support access lease: %v", err)
	}
	if _, err := sqlDB.Exec(`INSERT INTO tenant_support_access_lease_permissions(lease_id, permission_code, created_at) VALUES ('lease-a', 'people.read', CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("insert allowed lease permission: %v", err)
	}
	if _, err := sqlDB.Exec(`INSERT INTO tenant_support_access_lease_permissions(lease_id, permission_code, created_at) VALUES ('lease-a', 'authz.manage', CURRENT_TIMESTAMP)`); err == nil || !strings.Contains(err.Error(), "support_access_lease_permission_not_allowed") {
		t.Fatalf("expected control-plane permission rejection, got %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE tenant_support_access_leases SET expires_at = datetime(CURRENT_TIMESTAMP, '+3 hours') WHERE id = 'lease-a'`); err == nil || !strings.Contains(err.Error(), "support_access_lease_request_immutable") {
		t.Fatalf("expected fixed expiration to be immutable, got %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE tenant_support_access_leases SET status='APPROVED', approved_at=CURRENT_TIMESTAMP, approved_by_actor_id='actor-impostor' WHERE id='lease-a'`); err == nil || !strings.Contains(err.Error(), "support_access_lease_tenant_administrator_required") {
		t.Fatalf("expected non-Tenant-Administrator approval rejection, got %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE tenant_support_access_leases SET status='APPROVED', approved_at=CURRENT_TIMESTAMP, approved_by_actor_id='actor-tenant-admin-a' WHERE id='lease-a'`); err != nil {
		t.Fatalf("approve with canonical Tenant Administrator: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE tenant_support_access_leases SET approved_by_actor_id='actor-impostor' WHERE id='lease-a'`); err == nil || !strings.Contains(err.Error(), "support_access_lease_approval_immutable") {
		t.Fatalf("expected immutable approval history, got %v", err)
	}
	if _, err := sqlDB.Exec(`INSERT INTO tenant_support_access_lease_permissions(lease_id, permission_code, created_at) VALUES ('lease-a', 'expenses.read', CURRENT_TIMESTAMP)`); err == nil || !strings.Contains(err.Error(), "support_access_lease_permissions_immutable") {
		t.Fatalf("expected permission scope to remain immutable after approval, got %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE tenant_support_access_leases SET status='TERMINATED', terminated_at=CURRENT_TIMESTAMP, terminated_by_actor_id='actor-tenant-admin-a', termination_reason='complete' WHERE id='lease-a'`); err != nil {
		t.Fatalf("terminate with canonical Tenant Administrator: %v", err)
	}
	if _, err := sqlDB.Exec(`DELETE FROM tenant_support_access_leases WHERE id='lease-a'`); err == nil || !strings.Contains(err.Error(), "support_access_leases are retained") {
		t.Fatalf("expected retained lease history, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO tenant_support_access_leases(
  id, tenant_id, application_actor_id, requested_by_actor_id,
  requested_at, expires_at, reason, status, created_at, updated_at
) VALUES (
  'lease-without-permissions', 'tenant-a', 'actor-application-admin', 'actor-application-admin',
  CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+2 hours'), 'Missing permission test', 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)`); err != nil {
		t.Fatalf("insert permissionless pending lease: %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE tenant_support_access_leases SET status='APPROVED', approved_at=CURRENT_TIMESTAMP, approved_by_actor_id='actor-tenant-admin-a' WHERE id='lease-without-permissions'`); err == nil {
		t.Fatalf("expected approval without an explicit permission scope to be rejected")
	}

	if _, err := sqlDB.Exec(`INSERT INTO tenant_support_access_lease_events(id, lease_id, event_type, actor_id, occurred_at, created_at) VALUES ('event-a', 'lease-a', 'APPROVED', 'actor-tenant-admin-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`); err != nil {
		t.Fatalf("insert support lease event: %v", err)
	}
	if _, err := sqlDB.Exec(`DELETE FROM tenant_support_access_lease_events WHERE id='event-a'`); err == nil || !strings.Contains(err.Error(), "support_access_lease_events are immutable") {
		t.Fatalf("expected immutable support lease event history, got %v", err)
	}

	applyTenantSupportAccessLeaseMigrationFile(t, sqlDB, "000065_tenant_support_access_lease_domain.down.sql")
	if _, err := sqlDB.Exec(`INSERT INTO authz_role_permissions(role_id, permission_code, created_at) VALUES ('authz-role-application-admin', 'people.read', CURRENT_TIMESTAMP)`); err == nil || !strings.Contains(err.Error(), "application_admin_control_plane_permission_required") {
		t.Fatalf("expected 30I.1 control-plane guard restored after down migration, got %v", err)
	}
}

const tenantSupportAccessLeaseSchema = `
CREATE TABLE authz_roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE TABLE authz_permissions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE TABLE authz_role_permissions (
  role_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY(role_id, permission_code)
);
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE TABLE authz_actors (
  id TEXT PRIMARY KEY,
  actor_key TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE reference_data (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE person_tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  status_id TEXT NOT NULL
);
CREATE TABLE auth_account_actors (
  account_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  tenant_id TEXT,
  membership_id TEXT
);
CREATE TABLE authz_actor_role_grants (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  lifecycle_suspended INTEGER NOT NULL DEFAULT 0
);
`

func applyTenantSupportAccessLeaseMigrationFile(t *testing.T, sqlDB *sql.DB, name string) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join("..", "..", "migrations", name))
	if err != nil {
		t.Fatalf("read migration %s: %v", name, err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply migration %s: %v", name, err)
	}
}
