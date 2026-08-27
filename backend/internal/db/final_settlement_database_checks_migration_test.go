package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestFinalSettlementDatabaseChecksMigrationWidensProductionEnumsAndPreservesGuards(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(1)

	createFinalSettlementDatabaseChecksFixture(t, sqlDB)

	if _, err := sqlDB.Exec(`
INSERT INTO journey_settlements(
  id, created_at, updated_at, tenant_id, collaborator_id, settlement_type,
  request_id, status, effective_date, brl_amount, gold_gram_amount
) VALUES (
  'settlement-before', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'journey-a',
  'FINAL_TENANT_PAYMENT', 'request-before', 'POSTED', '2026-08-26', 25, 0
)`); err == nil || !strings.Contains(err.Error(), "CHECK constraint failed") {
		t.Fatalf("expected pre-migration final Tenant settlement rejection, got %v", err)
	}
	if _, err := sqlDB.Exec(`
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, active, correction_type
) VALUES (
  'ledger-before', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-a',
  'brl', 'FINAL_SETTLEMENT', 'DEBIT', 25, '2026-08-26',
  'JOURNEY_SETTLEMENT', 'settlement-before', 1, 'ORIGINAL'
)`); err == nil || !strings.Contains(err.Error(), "CHECK constraint failed") {
		t.Fatalf("expected pre-migration FINAL_SETTLEMENT Ledger Entry rejection, got %v", err)
	}

	migration := readFinalSettlementDatabaseChecksMigration(t)
	if _, err := sqlDB.Exec(migration); err != nil {
		t.Fatalf("apply final-settlement database checks migration: %v", err)
	}

	var existingLedgerCount, existingSettlementCount, existingReceiptCount int
	if err := sqlDB.QueryRow(`SELECT COUNT(*) FROM ledger_entries WHERE id = 'ledger-existing'`).Scan(&existingLedgerCount); err != nil {
		t.Fatalf("count preserved Ledger Entry: %v", err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(*) FROM journey_settlements WHERE id = 'settlement-existing'`).Scan(&existingSettlementCount); err != nil {
		t.Fatalf("count preserved Journey Settlement: %v", err)
	}
	if err := sqlDB.QueryRow(`SELECT COUNT(*) FROM ledger_receipts WHERE id = 'receipt-existing'`).Scan(&existingReceiptCount); err != nil {
		t.Fatalf("count preserved Ledger Receipt: %v", err)
	}
	if existingLedgerCount != 1 || existingSettlementCount != 1 || existingReceiptCount != 1 {
		t.Fatalf("expected existing financial history preserved, got ledger=%d settlement=%d receipt=%d", existingLedgerCount, existingSettlementCount, existingReceiptCount)
	}

	for _, settlementType := range []string{"FINAL_TENANT_PAYMENT", "FINAL_COLLABORATOR_PAYMENT"} {
		if _, err := sqlDB.Exec(`
INSERT INTO journey_settlements(
  id, created_at, updated_at, tenant_id, collaborator_id, settlement_type,
  request_id, status, effective_date, brl_amount, gold_gram_amount
) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'journey-a', ?, ?, 'POSTED', '2026-08-26', 25, 0)
`, "settlement-"+strings.ToLower(settlementType), settlementType, "request-"+strings.ToLower(settlementType)); err != nil {
			t.Fatalf("insert %s after migration: %v", settlementType, err)
		}
	}

	for _, direction := range []string{"DEBIT", "CREDIT"} {
		if _, err := sqlDB.Exec(`
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, active, correction_type
) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-a',
          'brl', 'FINAL_SETTLEMENT', ?, 25, '2026-08-26',
          'JOURNEY_SETTLEMENT', ?, 1, 'ORIGINAL')
`, "ledger-final-"+strings.ToLower(direction), direction, "source-final-"+strings.ToLower(direction)); err != nil {
			t.Fatalf("insert FINAL_SETTLEMENT %s after migration: %v", direction, err)
		}
	}

	if _, err := sqlDB.Exec(`
INSERT INTO journey_settlements(
  id, created_at, updated_at, tenant_id, collaborator_id, settlement_type,
  request_id, status, effective_date, brl_amount, gold_gram_amount
) VALUES (
  'settlement-invalid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'journey-a',
  'INVALID_SETTLEMENT', 'request-invalid', 'POSTED', '2026-08-26', 1, 0
)`); err == nil || !strings.Contains(err.Error(), "CHECK constraint failed") {
		t.Fatalf("expected invalid Journey Settlement type rejection after migration, got %v", err)
	}
	if _, err := sqlDB.Exec(`
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, active, correction_type
) VALUES (
  'ledger-invalid-type', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-a',
  'brl', 'INVALID_ENTRY', 'DEBIT', 1, '2026-08-26',
  'TEST', 'invalid-entry-type', 1, 'ORIGINAL'
)`); err == nil || !strings.Contains(err.Error(), "CHECK constraint failed") {
		t.Fatalf("expected invalid Ledger Entry type rejection after migration, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, active, correction_type
) VALUES (
  'ledger-wrong-person', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-other', 'journey-a',
  'brl', 'FINAL_SETTLEMENT', 'DEBIT', 1, '2026-08-26',
  'TEST', 'wrong-person', 1, 'ORIGINAL'
)`); err == nil || !strings.Contains(err.Error(), "ledger_entry_person_tenant_journey_mismatch") {
		t.Fatalf("expected financial-owner guard preserved after rebuild, got %v", err)
	}

	rows, err := sqlDB.Query(`PRAGMA foreign_key_check`)
	if err != nil {
		t.Fatalf("run foreign-key check: %v", err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("expected foreign-key check to remain clean after final-settlement table rebuild")
	}
}

func createFinalSettlementDatabaseChecksFixture(t *testing.T, sqlDB *sql.DB) {
	t.Helper()
	setup := `
PRAGMA foreign_keys = ON;
CREATE TABLE tenants (id TEXT PRIMARY KEY);
CREATE TABLE reference_data (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  code TEXT NOT NULL
);
CREATE TABLE person_tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL
);
CREATE TABLE collaborator_journeys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  membership_id TEXT NULL,
  status_id TEXT NULL,
  closed_at DATETIME NULL
);
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  collaborator_id TEXT NOT NULL,
  value_unit_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount REAL NOT NULL,
  effective_date DATE NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  description TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  correction_type TEXT NOT NULL DEFAULT 'ORIGINAL',
  related_entry_id TEXT NULL,
  correction_reason TEXT NULL,
  authorized_by TEXT NULL,
  authorized_at DATETIME NULL,
  correction_reason_code TEXT NULL,
  correction_reason_text TEXT NULL,
  second_approved_by TEXT NULL,
  second_approved_at DATETIME NULL,
  second_approval_notes TEXT NULL,
  person_id TEXT NULL,
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (entry_type IN ('EARNING_CREDIT', 'EXPENSE_DEDUCTION', 'GOLD_TO_BRL_CONVERSION', 'PIX_REMITTANCE', 'REPLACEMENT_TRANSFER', 'PAYOUT')),
  CHECK (amount > 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (value_unit_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, source_type, source_id, value_unit_id, direction)
);
CREATE TABLE ledger_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  ledger_entry_id TEXT NOT NULL,
  FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE TABLE journey_settlements (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  collaborator_id TEXT NOT NULL,
  settlement_type TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  effective_date DATE NOT NULL,
  brl_amount REAL NOT NULL DEFAULT 0,
  gold_gram_amount REAL NOT NULL DEFAULT 0,
  notes TEXT NULL,
  authorized_by TEXT NULL,
  authorized_at DATETIME NULL,
  reason_code TEXT NULL,
  reason_text TEXT NULL,
  second_approved_by TEXT NULL,
  second_approved_at DATETIME NULL,
  second_approval_notes TEXT NULL,
  CHECK (settlement_type IN ('ZERO_GOLD', 'PAYOUT', 'CLOSE_JOURNEY')),
  CHECK (status IN ('POSTED', 'VOIDED')),
  CHECK (brl_amount >= 0),
  CHECK (gold_gram_amount >= 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, collaborator_id, request_id)
);

INSERT INTO tenants(id) VALUES ('tenant-a');
INSERT INTO reference_data(id, tenant_id, type, code) VALUES
  ('brl', 'tenant-a', 'value_unit', 'BRL'),
  ('status-active', 'tenant-a', 'collaborator_status', 'ACTIVE'),
  ('status-finished', 'tenant-a', 'collaborator_status', 'FINISHED');
INSERT INTO person_tenant_memberships(id, tenant_id, person_id)
VALUES ('membership-a', 'tenant-a', 'person-a');
INSERT INTO collaborator_journeys(id, tenant_id, membership_id, status_id, closed_at)
VALUES ('journey-a', 'tenant-a', 'membership-a', 'status-active', NULL);
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, active, correction_type
) VALUES (
  'ledger-existing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-a',
  'brl', 'EARNING_CREDIT', 'CREDIT', 10, '2026-08-25',
  'TEST', 'existing-ledger', 1, 'ORIGINAL'
);
INSERT INTO ledger_receipts(id, tenant_id, person_id, collaborator_id, ledger_entry_id)
VALUES ('receipt-existing', 'tenant-a', 'person-a', 'journey-a', 'ledger-existing');
INSERT INTO journey_settlements(
  id, created_at, updated_at, tenant_id, collaborator_id, settlement_type,
  request_id, status, effective_date, brl_amount, gold_gram_amount
) VALUES (
  'settlement-existing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'journey-a',
  'PAYOUT', 'request-existing', 'POSTED', '2026-08-25', 10, 0
);
`
	if _, err := sqlDB.Exec(setup); err != nil {
		t.Fatalf("create pre-000061 fixture: %v", err)
	}
}

func readFinalSettlementDatabaseChecksMigration(t *testing.T) string {
	t.Helper()
	migrationPath := filepath.Join("..", "..", "migrations", "000061_expand_final_settlement_database_checks.up.sql")
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read final-settlement database checks migration: %v", err)
	}
	return string(contents)
}
