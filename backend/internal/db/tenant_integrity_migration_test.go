package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestTenantIntegrityMigrationRejectsInvalidOwnershipAndGrantScopes(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := dbpkg.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate authorization: %v", err)
	}
	if err := dbpkg.SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization catalog: %v", err)
	}
	applyTenantIntegrityMigration(t, database)

	now := time.Now().UTC()
	lowercaseTenant := dbpkg.Tenant{
		BaseModel: dbpkg.BaseModel{ID: "tenant-lower", CreatedAt: now, UpdatedAt: now},
		Code:      "lower", Name: "Lower", Active: true,
	}
	if err := database.Create(&lowercaseTenant).Error; err == nil || !strings.Contains(err.Error(), "tenant_code_must_be_normalized") {
		t.Fatalf("expected lowercase tenant code rejection, got %v", err)
	}

	unknownTenantReference := dbpkg.ReferenceData{
		BaseModel: dbpkg.BaseModel{ID: "ref-missing-tenant", CreatedAt: now, UpdatedAt: now},
		TenantID:  "missing", Type: "person_status", Code: "ACTIVE", Label: "Active", Active: true,
	}
	if err := database.Create(&unknownTenantReference).Error; err == nil || !strings.Contains(err.Error(), "tenant_integrity_violation") {
		t.Fatalf("expected unknown tenant rejection, got %v", err)
	}

	north := dbpkg.Tenant{
		BaseModel: dbpkg.BaseModel{ID: "tenant-north", CreatedAt: now, UpdatedAt: now},
		Code:      "NORTH", Name: "North", Active: true,
	}
	if err := database.Create(&north).Error; err != nil {
		t.Fatalf("create valid tenant: %v", err)
	}
	if err := dbpkg.SeedTenantData(database, north.ID); err != nil {
		t.Fatalf("seed valid tenant: %v", err)
	}

	defaultStatusID := "ref-person-status-active"
	crossTenantPerson := dbpkg.Person{
		BaseModel: dbpkg.BaseModel{ID: "person-cross-tenant", CreatedAt: now, UpdatedAt: now},
		TenantID:  north.ID, FirstName: "Cross", LastName: "Tenant", Nickname: "CrossTenant",
		CPF: "39053344705", RG: "RG-CROSS-01", Cellular: "11998765432", Email: "cross-tenant@example.com",
		StatusID: defaultStatusID,
	}
	if err := database.Create(&crossTenantPerson).Error; err == nil || !strings.Contains(err.Error(), "cross_tenant_reference") {
		t.Fatalf("expected cross-tenant status reference rejection, got %v", err)
	}

	var northStatus dbpkg.ReferenceData
	if err := database.First(&northStatus, "tenant_id = ? AND type = ? AND code = ?", north.ID, "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find north status: %v", err)
	}
	if err := database.Model(&northStatus).Update("tenant_id", dbpkg.DefaultTenantID).Error; err == nil || !strings.Contains(err.Error(), "tenant_id_immutable") {
		t.Fatalf("expected tenant ownership to be immutable, got %v", err)
	}

	var tenantRole authz.AuthzRole
	if err := database.First(&tenantRole, "code = ?", string(authz.RoleTenantAdmin)).Error; err != nil {
		t.Fatalf("find tenant role: %v", err)
	}
	actor := authz.AuthzActor{ID: "actor-integrity", ActorKey: "integrity@example.com", DisplayName: "Integrity", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create actor: %v", err)
	}
	invalidGrant := authz.AuthzActorRoleGrant{
		ID: "grant-invalid-scope", ActorID: actor.ID, RoleID: tenantRole.ID,
		TenantID: authz.GlobalTenantScope, Active: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&invalidGrant).Error; err == nil || !strings.Contains(err.Error(), "authorization_tenant_scope_invalid") {
		t.Fatalf("expected invalid tenant role scope rejection, got %v", err)
	}
}

func applyTenantIntegrityMigration(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	migrationPath := filepath.Join("..", "..", "migrations", "000041_tenant_data_integrity_and_seed_refactor.up.sql")
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read tenant integrity migration: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply tenant integrity migration: %v", err)
	}
}
