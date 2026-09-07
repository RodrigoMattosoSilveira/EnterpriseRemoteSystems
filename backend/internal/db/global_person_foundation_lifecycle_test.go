package db_test

import (
	"path/filepath"
	"testing"
	"time"

	dbpkg "enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

func TestGlobalPersonFoundationKeepsActiveSiblingWhenLatestLegacyProjectionIsInactive(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "foundation.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	if err := dbpkg.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}
	if err := dbpkg.SeedTenants(database); err != nil {
		t.Fatalf("seed default tenant: %v", err)
	}
	now := time.Now().UTC()
	if err := database.Create(&dbpkg.Tenant{
		BaseModel: dbpkg.BaseModel{ID: "tenant-foundation-b", CreatedAt: now, UpdatedAt: now},
		Code:      "FOUNDATION_B",
		Name:      "Foundation Tenant B",
		Active:    true,
	}).Error; err != nil {
		t.Fatalf("create Tenant B: %v", err)
	}
	if err := dbpkg.SeedReferenceData(database); err != nil {
		t.Fatalf("seed default reference data: %v", err)
	}
	if err := dbpkg.SeedTenantData(database, "tenant-foundation-b"); err != nil {
		t.Fatalf("seed Tenant B reference data: %v", err)
	}

	var tenantBInactive dbpkg.ReferenceData
	if err := database.First(&tenantBInactive, "tenant_id = ? AND type = ? AND code = ?", "tenant-foundation-b", "person_status", "INACTIVE").Error; err != nil {
		t.Fatalf("find Tenant B INACTIVE status: %v", err)
	}

	active := dbpkg.Person{
		BaseModel: dbpkg.BaseModel{ID: "foundation-active", CreatedAt: now, UpdatedAt: now},
		TenantID:  dbpkg.DefaultTenantID,
		FirstName: "Active", LastName: "Sibling", Nickname: "Active",
		CPF: "93541134780", RG: "RG-FOUND-A", Cellular: "11991112222", Email: "foundation.active@example.test",
		Country: "Brasil", ProfileCompletionStatus: "PERSONAL_ONLY", StatusID: "ref-person-status-active",
	}
	inactive := dbpkg.Person{
		BaseModel: dbpkg.BaseModel{ID: "foundation-inactive", CreatedAt: now.Add(time.Second), UpdatedAt: now.Add(time.Hour)},
		TenantID:  "tenant-foundation-b",
		FirstName: "Inactive", LastName: "Sibling", Nickname: "Inactive",
		CPF: active.CPF, RG: "RG-FOUND-B", Cellular: "11993334444", Email: "foundation.inactive@example.test",
		Country: "Brasil", ProfileCompletionStatus: "PERSONAL_ONLY", StatusID: tenantBInactive.ID,
	}
	if err := database.Create(&active).Error; err != nil {
		t.Fatalf("create active legacy projection: %v", err)
	}
	if err := database.Create(&inactive).Error; err != nil {
		t.Fatalf("create newer inactive legacy projection: %v", err)
	}

	if err := dbpkg.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("repair global Person foundation: %v", err)
	}

	var global dbpkg.GlobalPerson
	if err := database.First(&global, "cpf = ?", active.CPF).Error; err != nil {
		t.Fatalf("find global Person: %v", err)
	}
	if !global.OperationalActive {
		t.Fatal("an ACTIVE sibling Membership must keep the global Person operationally active even when the newest legacy projection is INACTIVE")
	}

	assertFoundationMembershipStatus(t, database, active.ID, "ACTIVE")
	assertFoundationMembershipStatus(t, database, inactive.ID, "INACTIVE")
}

func assertFoundationMembershipStatus(t *testing.T, database *gorm.DB, legacyPersonID string, expected string) {
	t.Helper()
	var code string
	if err := database.Table("person_tenant_memberships m").
		Select("s.code").
		Joins("JOIN reference_data s ON s.id = m.status_id AND s.tenant_id = m.tenant_id AND s.type = ?", "person_status").
		Where("m.legacy_person_id = ?", legacyPersonID).
		Scan(&code).Error; err != nil {
		t.Fatalf("load foundation Membership status: %v", err)
	}
	if code != expected {
		t.Fatalf("expected legacy Person %s Membership status %s, got %s", legacyPersonID, expected, code)
	}
}
