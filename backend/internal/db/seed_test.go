package db

import (
	"path/filepath"
	"testing"
)

func TestSeedTenantsCreatesDefaultTenantEvenBeforeFullAutoMigrate(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	if err := SeedTenants(database); err != nil {
		t.Fatalf("seed tenants: %v", err)
	}

	var tenant Tenant
	if err := database.First(&tenant, "id = ?", DefaultTenantID).Error; err != nil {
		t.Fatalf("find default tenant: %v", err)
	}
	if tenant.Code != "DEFAULT" || !tenant.Active {
		t.Fatalf("unexpected default tenant: %+v", tenant)
	}
}

func TestSeedReferenceDataSeedsDefaultTenantFirst(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate test database: %v", err)
	}

	if err := SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	var tenant Tenant
	if err := database.First(&tenant, "id = ?", DefaultTenantID).Error; err != nil {
		t.Fatalf("find default tenant: %v", err)
	}

	var count int64
	if err := database.Model(&ReferenceData{}).Where("tenant_id = ?", DefaultTenantID).Count(&count).Error; err != nil {
		t.Fatalf("count default tenant reference data: %v", err)
	}
	if count == 0 {
		t.Fatal("expected seeded reference data for default tenant")
	}
}
