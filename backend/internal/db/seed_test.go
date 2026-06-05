package db

import (
	"path/filepath"
	"testing"
)

func TestSeedTenantsCreatesDefaultTenant(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}

	if err := SeedTenants(database); err != nil {
		t.Fatalf("seed tenants: %v", err)
	}

	var count int64
	if err := database.Model(&Tenant{}).
		Where("id = ?", DefaultTenantID).
		Count(&count).Error; err != nil {
		t.Fatalf("count default tenant: %v", err)
	}

	if count != 1 {
		t.Fatalf("expected default tenant to be seeded, got %d", count)
	}
}

func TestSeedReferenceDataSeedsDefaultTenantFirst(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}

	if err := SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	var tenantCount int64
	if err := database.Model(&Tenant{}).
		Where("id = ?", DefaultTenantID).
		Count(&tenantCount).Error; err != nil {
		t.Fatalf("count default tenant: %v", err)
	}

	if tenantCount != 1 {
		t.Fatalf("expected default tenant to be seeded, got %d", tenantCount)
	}

	var referenceDataCount int64
	if err := database.Model(&ReferenceData{}).
		Where("tenant_id = ?", DefaultTenantID).
		Count(&referenceDataCount).Error; err != nil {
		t.Fatalf("count reference data: %v", err)
	}

	if referenceDataCount == 0 {
		t.Fatal("expected reference data rows to be seeded")
	}
}
