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

func TestReferenceDataTenantScopeRebuildRemovesLegacyTableConstraint(t *testing.T) {
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

	installLegacyReferenceDataTableConstraint(t, database)

	now := time.Now().UTC()
	tenant := dbpkg.Tenant{
		BaseModel: dbpkg.BaseModel{ID: "tenant-table-constraint-test", CreatedAt: now, UpdatedAt: now},
		Code:      "TABLE-CONSTRAINT-TEST",
		Name:      "Reference Data Table Constraint Test",
		Active:    true,
	}
	if err := database.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant before seed: %v", err)
	}

	if err := dbpkg.SeedTenantData(database, tenant.ID); err == nil || !strings.Contains(err.Error(), "UNIQUE constraint failed") {
		t.Fatalf("expected legacy table uniqueness to block tenant seed, got %v", err)
	}

	// 000043 can remove named legacy indexes, but SQLite does not permit
	// DROP INDEX on the sqlite_autoindex_* index owned by an inline UNIQUE
	// table constraint. Reapplying 000043 must therefore leave this failure in
	// place and proves why the forward rebuild migration is required.
	applyReferenceDataTenantUniquenessRepairMigration(t, database)
	if err := dbpkg.SeedTenantData(database, tenant.ID); err == nil || !strings.Contains(err.Error(), "UNIQUE constraint failed") {
		t.Fatalf("expected inline global uniqueness to survive 000043, got %v", err)
	}

	applyReferenceDataTenantScopeRebuildMigration(t, database)

	if err := dbpkg.SeedTenantData(database, tenant.ID); err != nil {
		t.Fatalf("seed tenant after reference-data table rebuild: %v", err)
	}

	var referenceCount int64
	if err := database.Model(&dbpkg.ReferenceData{}).Where("tenant_id = ?", tenant.ID).Count(&referenceCount).Error; err != nil {
		t.Fatalf("count tenant reference data after rebuild: %v", err)
	}
	if referenceCount < 30 {
		t.Fatalf("expected complete tenant reference baseline after rebuild, got %d rows", referenceCount)
	}

	assertReferenceDataIndexesAreTenantScoped(t, database)
}

func installLegacyReferenceDataTableConstraint(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}

	const legacySchema = `
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

BEGIN TRANSACTION;

DROP TRIGGER IF EXISTS trg_reference_data_tenant_exists_insert;
DROP TRIGGER IF EXISTS trg_reference_data_tenant_immutable;

DROP INDEX IF EXISTS ux_reference_tenant_type_code;
DROP INDEX IF EXISTS ux_reference_tenant_type_label;
DROP INDEX IF EXISTS idx_reference_tenant_type_active_sort;
DROP INDEX IF EXISTS ux_reference_data_type_code;
DROP INDEX IF EXISTS ux_reference_data_type_label;
DROP INDEX IF EXISTS idx_reference_data_type_active_sort;

ALTER TABLE reference_data RENAME TO reference_data_before_legacy_constraint;

CREATE TABLE reference_data (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  UNIQUE (type, code)
);

INSERT INTO reference_data (
  id, type, code, label, description, active, sort_order, metadata_json,
  created_at, updated_at, tenant_id
)
SELECT
  id, type, code, label, description, active, sort_order, metadata_json,
  created_at, updated_at, tenant_id
FROM reference_data_before_legacy_constraint;

DROP TABLE reference_data_before_legacy_constraint;

-- Simulate a database on which 000043 already ran: the intended tenant-scoped
-- indexes are present, but the table-owned global UNIQUE constraint remains.
CREATE UNIQUE INDEX ux_reference_tenant_type_code
ON reference_data(tenant_id, type, code);

CREATE UNIQUE INDEX ux_reference_tenant_type_label
ON reference_data(tenant_id, type, label);

CREATE INDEX idx_reference_tenant_type_active_sort
ON reference_data(tenant_id, type, active, sort_order);

COMMIT;

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
`
	if _, err := sqlDB.Exec(legacySchema); err != nil {
		t.Fatalf("install legacy reference-data table constraint: %v", err)
	}
}

func applyReferenceDataTenantScopeRebuildMigration(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	applySQLMigration(t, database, "000044_rebuild_reference_data_tenant_scope.up.sql")
}

func assertReferenceDataIndexesAreTenantScoped(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}

	rows, err := sqlDB.Query(`PRAGMA index_list('reference_data')`)
	if err != nil {
		t.Fatalf("list reference-data indexes: %v", err)
	}
	defer rows.Close()

	var foundCode bool
	var foundLabel bool
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			t.Fatalf("scan reference-data index: %v", err)
		}
		if strings.HasPrefix(name, "sqlite_autoindex_reference_data_") && origin == "u" {
			t.Fatalf("unexpected table-owned UNIQUE constraint remains after rebuild: %s", name)
		}
		switch name {
		case "ux_reference_tenant_type_code":
			foundCode = unique == 1
		case "ux_reference_tenant_type_label":
			foundLabel = unique == 1
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate reference-data indexes: %v", err)
	}
	if !foundCode || !foundLabel {
		t.Fatalf("expected tenant-scoped unique indexes after rebuild, code=%v label=%v", foundCode, foundLabel)
	}
}

func applyReferenceDataTenantUniquenessRepairMigration(t *testing.T, database interface{ DB() (*sql.DB, error) }) {
	t.Helper()
	applySQLMigration(t, database, "000043_repair_reference_data_tenant_uniqueness.up.sql")
}

func applySQLMigration(t *testing.T, database interface{ DB() (*sql.DB, error) }, filename string) {
	t.Helper()
	migrationPath := filepath.Join("..", "..", "migrations", filename)
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read migration %s: %v", filename, err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply migration %s: %v", filename, err)
	}
}
