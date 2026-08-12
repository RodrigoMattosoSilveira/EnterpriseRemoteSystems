package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestReferenceDataTenantUniquenessRepairAllowsTenantSeedProvisioning(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := dbpkg.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}
	if err := dbpkg.SeedReferenceData(database); err != nil {
		t.Fatalf("seed default reference data: %v", err)
	}

	// Reproduce the schema drift seen in a long-lived environment that applied
	// an older tenant-foundation migration: reference_data remains globally
	// unique by type/code instead of tenant/type/code.
	if err := database.Exec(`DROP INDEX IF EXISTS ux_reference_tenant_type_code`).Error; err != nil {
		t.Fatalf("drop tenant-scoped type/code index: %v", err)
	}
	if err := database.Exec(`DROP INDEX IF EXISTS ux_reference_tenant_type_label`).Error; err != nil {
		t.Fatalf("drop tenant-scoped type/label index: %v", err)
	}
	if err := database.Exec(`CREATE UNIQUE INDEX ux_reference_data_type_code ON reference_data(type, code)`).Error; err != nil {
		t.Fatalf("create legacy global type/code index: %v", err)
	}

	now := time.Now().UTC()
	tenant := dbpkg.Tenant{
		BaseModel: dbpkg.BaseModel{ID: "tenant-repair-test", CreatedAt: now, UpdatedAt: now},
		Code:      "REPAIR-TEST",
		Name:      "Reference Data Repair Test",
		Active:    true,
	}
	if err := database.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant before seed: %v", err)
	}

	if err := dbpkg.SeedTenantData(database, tenant.ID); err == nil || !strings.Contains(err.Error(), "UNIQUE constraint failed") {
		t.Fatalf("expected legacy global reference-data uniqueness to block tenant seed, got %v", err)
	}

	applyReferenceDataTenantUniquenessRepairMigration(t, database)

	if err := dbpkg.SeedTenantData(database, tenant.ID); err != nil {
		t.Fatalf("seed tenant after uniqueness repair: %v", err)
	}

	var referenceCount int64
	if err := database.Model(&dbpkg.ReferenceData{}).Where("tenant_id = ?", tenant.ID).Count(&referenceCount).Error; err != nil {
		t.Fatalf("count repaired tenant reference data: %v", err)
	}
	if referenceCount < 30 {
		t.Fatalf("expected complete tenant reference baseline after repair, got %d rows", referenceCount)
	}

	var priceListCount int64
	if err := database.Model(&dbpkg.ExpensePriceListItem{}).Where("tenant_id = ? AND active = ?", tenant.ID, true).Count(&priceListCount).Error; err != nil {
		t.Fatalf("count repaired tenant price-list data: %v", err)
	}
	if priceListCount != 5 {
		t.Fatalf("expected five starter price-list rows after repair, got %d", priceListCount)
	}
}

func applyReferenceDataTenantUniquenessRepairMigration(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	migrationPath := filepath.Join("..", "..", "migrations", "000043_repair_reference_data_tenant_uniqueness.up.sql")
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read reference-data uniqueness repair migration: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply reference-data uniqueness repair migration: %v", err)
	}
}
