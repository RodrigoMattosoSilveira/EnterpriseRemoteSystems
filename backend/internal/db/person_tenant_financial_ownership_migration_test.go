package db_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestPersonTenantFinancialOwnershipMigrationBackfillsAndGuardsFinancialRows(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	setup := `
CREATE TABLE global_people (
  id TEXT PRIMARY KEY
);
CREATE TABLE person_tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL
);
CREATE TABLE collaborator_journeys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NULL
);
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  expense_date DATE NOT NULL
);
CREATE TABLE accrual_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  value_unit_id TEXT NOT NULL,
  effective_date DATE NOT NULL,
  active INTEGER NOT NULL
);
CREATE TABLE ledger_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  ledger_entry_id TEXT NOT NULL,
  status TEXT NOT NULL
);

INSERT INTO global_people(id) VALUES ('person-a');
INSERT INTO person_tenant_memberships(id, tenant_id, person_id)
VALUES ('membership-a', 'tenant-a', 'person-a');
INSERT INTO collaborator_journeys(id, tenant_id, membership_id)
VALUES ('journey-a', 'tenant-a', 'membership-a');
INSERT INTO expenses(id, tenant_id, collaborator_id, expense_date)
VALUES ('expense-a', 'tenant-a', 'journey-a', '2026-08-01');
INSERT INTO accrual_items(id, tenant_id, collaborator_id, status)
VALUES ('accrual-a', 'tenant-a', 'journey-a', 'POSTED');
INSERT INTO ledger_entries(id, tenant_id, collaborator_id, value_unit_id, effective_date, active)
VALUES ('ledger-a', 'tenant-a', 'journey-a', 'brl', '2026-08-01', 1);
INSERT INTO ledger_receipts(id, tenant_id, collaborator_id, ledger_entry_id, status)
VALUES ('receipt-a', 'tenant-a', 'journey-a', 'ledger-a', 'PENDING_ISSUE');
`
	if _, err := sqlDB.Exec(setup); err != nil {
		t.Fatalf("create pre-30G schema: %v", err)
	}

	migrationPath := filepath.Join("..", "..", "migrations", "000057_person_tenant_financial_ownership.up.sql")
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read 30G migration: %v", err)
	}
	if _, err := sqlDB.Exec(string(contents)); err != nil {
		t.Fatalf("apply 30G migration: %v", err)
	}

	for _, table := range []string{"expenses", "accrual_items", "ledger_entries", "ledger_receipts"} {
		var personID string
		if err := sqlDB.QueryRow("SELECT person_id FROM " + table + " LIMIT 1").Scan(&personID); err != nil {
			t.Fatalf("read %s Person ownership: %v", table, err)
		}
		if personID != "person-a" {
			t.Fatalf("expected %s person_id person-a, got %q", table, personID)
		}
	}

	if _, err := sqlDB.Exec(`
INSERT INTO ledger_entries(
  id, tenant_id, person_id, collaborator_id, value_unit_id, effective_date, active
) VALUES (
  'ledger-wrong-person', 'tenant-a', 'person-b', 'journey-a', 'brl', '2026-08-02', 1
)`); err == nil || !strings.Contains(err.Error(), "ledger_entry_person_tenant_journey_mismatch") {
		t.Fatalf("expected mismatched Ledger Entry Person rejection, got %v", err)
	}

	if _, err := sqlDB.Exec(`
UPDATE ledger_entries
SET person_id = 'person-b'
WHERE id = 'ledger-a'
`); err == nil || !strings.Contains(err.Error(), "ledger_entry_financial_identity_immutable") {
		t.Fatalf("expected immutable Ledger Entry financial identity rejection, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO ledger_receipts(
  id, tenant_id, person_id, collaborator_id, ledger_entry_id, status
) VALUES (
  'receipt-wrong-person', 'tenant-a', 'person-b', 'journey-a', 'ledger-a', 'PENDING_ISSUE'
)`); err == nil || !strings.Contains(err.Error(), "ledger_receipt_financial_owner_mismatch") {
		t.Fatalf("expected mismatched Ledger Receipt Person rejection, got %v", err)
	}
}
