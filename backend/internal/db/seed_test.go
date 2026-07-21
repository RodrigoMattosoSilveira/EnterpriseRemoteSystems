package db

import (
	"path/filepath"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestSeedTenantsCreatesDefaultTenant(t *testing.T) {
	database := openSeedTestDatabase(t)

	if err := SeedTenants(database); err != nil {
		t.Fatalf("seed tenants: %v", err)
	}

	var count int64
	if err := database.Model(&Tenant{}).Where("id = ?", DefaultTenantID).Count(&count).Error; err != nil {
		t.Fatalf("count default tenant: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected default tenant to be seeded, got %d", count)
	}
}

func TestSeedReferenceDataProvisionsEveryTenant(t *testing.T) {
	database := openSeedTestDatabase(t)
	if err := SeedTenants(database); err != nil {
		t.Fatalf("seed default tenant: %v", err)
	}

	now := time.Now().UTC()
	other := Tenant{
		BaseModel: BaseModel{ID: "tenant-north", CreatedAt: now, UpdatedAt: now},
		Code:      "NORTH", Name: "North Tenant", Active: false,
	}
	if err := database.Create(&other).Error; err != nil {
		t.Fatalf("create secondary tenant: %v", err)
	}

	if err := SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	assertSeedCounts(t, database, DefaultTenantID, legacyDefaultReferenceSeedCount(), 0)
	assertSeedCounts(t, database, other.ID, len(tenantReferenceDataSeeds), len(tenantExpensePriceListSeeds))

	var legacyStatus ReferenceData
	if err := database.First(&legacyStatus, "id = ?", "ref-person-status-active").Error; err != nil {
		t.Fatalf("expected legacy default seed IDs to remain available: %v", err)
	}
}

func TestSeedTenantDataIsIdempotentAndPreservesTenantChanges(t *testing.T) {
	database := openSeedTestDatabase(t)
	now := time.Now().UTC()
	tenant := Tenant{
		BaseModel: BaseModel{ID: "tenant-preserve", CreatedAt: now, UpdatedAt: now},
		Code:      "PRESERVE", Name: "Preserve Tenant", Active: true,
	}
	if err := database.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}

	if err := SeedTenantData(database, tenant.ID); err != nil {
		t.Fatalf("initial seed: %v", err)
	}

	var status ReferenceData
	if err := database.First(&status, "tenant_id = ? AND type = ? AND code = ?", tenant.ID, "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find seeded status: %v", err)
	}
	status.Label = "Working"
	status.Active = false
	if err := database.Save(&status).Error; err != nil {
		t.Fatalf("customize status: %v", err)
	}

	var meal ExpensePriceListItem
	if err := database.First(&meal, "tenant_id = ? AND item_type = ? AND code = ? AND active = ?", tenant.ID, "CANTEEN", "CANTEEN_MEAL", true).Error; err != nil {
		t.Fatalf("find seeded meal: %v", err)
	}
	meal.UnitPriceBRL = 49.75
	meal.Active = false
	if err := database.Save(&meal).Error; err != nil {
		t.Fatalf("customize meal: %v", err)
	}

	if err := SeedTenantData(database, tenant.ID); err != nil {
		t.Fatalf("repeat seed: %v", err)
	}

	var statuses []ReferenceData
	if err := database.Where("tenant_id = ? AND type = ? AND code = ?", tenant.ID, "person_status", "ACTIVE").Find(&statuses).Error; err != nil {
		t.Fatalf("list active statuses: %v", err)
	}
	if len(statuses) != 1 || statuses[0].Label != "Working" || statuses[0].Active {
		t.Fatalf("expected customized status to be preserved, got %#v", statuses)
	}

	var meals []ExpensePriceListItem
	if err := database.Where("tenant_id = ? AND item_type = ? AND code = ?", tenant.ID, "CANTEEN", "CANTEEN_MEAL").Find(&meals).Error; err != nil {
		t.Fatalf("list meals: %v", err)
	}
	if len(meals) != 1 || meals[0].UnitPriceBRL != 49.75 || meals[0].Active {
		t.Fatalf("expected customized inactive price to be preserved, got %#v", meals)
	}
}

func TestSeedTenantDataRejectsUnknownOrGlobalTenant(t *testing.T) {
	database := openSeedTestDatabase(t)
	if err := SeedTenantData(database, "*"); err == nil {
		t.Fatal("expected global tenant scope to be rejected")
	}
	if err := SeedTenantData(database, "missing-tenant"); err == nil {
		t.Fatal("expected unknown tenant to be rejected")
	}
}

func openSeedTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}
	return database
}

func assertSeedCounts(t *testing.T, database *gorm.DB, tenantID string, expectedReferenceCount int, expectedPriceListCount int) {
	t.Helper()
	var referenceCount int64
	if err := database.Model(&ReferenceData{}).Where("tenant_id = ?", tenantID).Count(&referenceCount).Error; err != nil {
		t.Fatalf("count reference data for %s: %v", tenantID, err)
	}
	if referenceCount != int64(expectedReferenceCount) {
		t.Fatalf("expected %d reference rows for %s, got %d", expectedReferenceCount, tenantID, referenceCount)
	}

	var priceListCount int64
	if err := database.Model(&ExpensePriceListItem{}).Where("tenant_id = ? AND active = ?", tenantID, true).Count(&priceListCount).Error; err != nil {
		t.Fatalf("count price-list data for %s: %v", tenantID, err)
	}
	if priceListCount != int64(expectedPriceListCount) {
		t.Fatalf("expected %d price-list rows for %s, got %d", expectedPriceListCount, tenantID, priceListCount)
	}
}

func legacyDefaultReferenceSeedCount() int {
	count := 0
	for _, seed := range tenantReferenceDataSeeds {
		if seed.DefaultID != "" {
			count++
		}
	}
	return count
}
