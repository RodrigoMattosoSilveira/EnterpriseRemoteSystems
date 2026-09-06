package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestGlobalAdministrationControlPlaneMigrationRemovesStandingTenantAuthority(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	if _, err := sqlDB.Exec(globalAdministrationControlPlaneSchema + `
INSERT INTO authz_roles(id, code, description, updated_at)
VALUES ('authz-role-application-admin', 'APPLICATION_ADMIN', 'legacy', CURRENT_TIMESTAMP);

INSERT INTO authz_permissions(code, label, description, created_at, updated_at) VALUES
('*', 'All permissions', 'legacy wildcard', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.self.read', 'self', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.read', 'authz read', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.manage', 'authz manage', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.read', 'tenant read', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.create', 'tenant create', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.update', 'tenant update', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('people.read', 'people read', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('gold_production.manage', 'gold production', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO authz_role_permissions(role_id, permission_code, created_at) VALUES
('authz-role-application-admin', '*', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'people.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'gold_production.manage', CURRENT_TIMESTAMP);
`); err != nil {
		t.Fatalf("create pre-30I.1 authorization fixture: %v", err)
	}

	applyGlobalAdministrationMigrationFile(t, sqlDB, "000063_global_administration_control_plane.up.sql")

	rows, err := sqlDB.Query(`
SELECT permission_code
FROM authz_role_permissions
WHERE role_id = 'authz-role-application-admin'
ORDER BY permission_code
`)
	if err != nil {
		t.Fatalf("list Application Administrator permissions: %v", err)
	}
	defer rows.Close()

	var got []string
	for rows.Next() {
		var permission string
		if err := rows.Scan(&permission); err != nil {
			t.Fatalf("scan Application Administrator permission: %v", err)
		}
		got = append(got, permission)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate Application Administrator permissions: %v", err)
	}
	want := []string{
		"authz.manage",
		"authz.read",
		"authz.self.read",
		"tenants.create",
		"tenants.read",
		"tenants.update",
	}
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Application Administrator permissions = %#v, want %#v", got, want)
	}

	for _, forbidden := range []string{"*", "people.read", "gold_production.manage"} {
		if _, err := sqlDB.Exec(`
INSERT INTO authz_role_permissions(role_id, permission_code, created_at)
VALUES ('authz-role-application-admin', ?, CURRENT_TIMESTAMP)
`, forbidden); err == nil || !strings.Contains(err.Error(), "application_admin_control_plane_permission_required") {
			t.Fatalf("expected direct SQL grant of %q to be rejected, got %v", forbidden, err)
		}
	}

	if _, err := sqlDB.Exec(`
INSERT INTO authz_roles(id, code, description, updated_at)
VALUES ('authz-role-update-probe', 'UPDATE_PROBE', 'probe', CURRENT_TIMESTAMP);
INSERT INTO authz_role_permissions(role_id, permission_code, created_at)
VALUES ('authz-role-update-probe', 'people.read', CURRENT_TIMESTAMP);
`); err != nil {
		t.Fatalf("create direct-SQL update probe: %v", err)
	}
	if _, err := sqlDB.Exec(`
UPDATE authz_role_permissions
SET role_id = 'authz-role-application-admin'
WHERE role_id = 'authz-role-update-probe'
  AND permission_code = 'people.read'
`); err == nil || !strings.Contains(err.Error(), "application_admin_control_plane_permission_required") {
		t.Fatalf("expected direct SQL update into Application Administrator people.read to be rejected, got %v", err)
	}

	applyGlobalAdministrationMigrationFile(t, sqlDB, "000063_global_administration_control_plane.down.sql")

	for _, restored := range []string{"*", "gold_production.manage"} {
		var count int
		if err := sqlDB.QueryRow(`
SELECT COUNT(*)
FROM authz_role_permissions
WHERE role_id = 'authz-role-application-admin'
  AND permission_code = ?
`, restored).Scan(&count); err != nil {
			t.Fatalf("count restored permission %q: %v", restored, err)
		}
		if count != 1 {
			t.Fatalf("expected down migration to restore %q, got %d rows", restored, count)
		}
	}
}

const globalAdministrationControlPlaneSchema = `
CREATE TABLE authz_roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
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
`

func applyGlobalAdministrationMigrationFile(t *testing.T, sqlDB *sql.DB, name string) {
	t.Helper()
	contents, err := os.ReadFile(filepath.Join("..", "..", "migrations", name))
	if err != nil {
		t.Fatalf("read migration %s: %v", name, err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply migration %s: %v", name, err)
	}
}
