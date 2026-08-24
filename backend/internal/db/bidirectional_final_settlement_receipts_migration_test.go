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

func TestBidirectionalFinalSettlementReceiptMigrationEnforcesDirectionAndAcceptance(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	createBidirectionalReceiptMigrationFixture(t, sqlDB)
	migration := readBidirectionalReceiptMigration(t)
	if _, err := sqlDB.Exec(migration); err != nil {
		t.Fatalf("apply 30G.2 receipt migration: %v", err)
	}

	var permissionCount int
	if err := sqlDB.QueryRow(`
SELECT COUNT(*) FROM authz_permissions
WHERE code IN (
  'ledger.receipts.self.accept',
  'ledger.receipts.tenant.accept',
  'journey.settlements.final_tenant_payment',
  'journey.settlements.final_collaborator_payment'
)`).Scan(&permissionCount); err != nil {
		t.Fatalf("count 30G.2 permissions: %v", err)
	}
	if permissionCount != 4 {
		t.Fatalf("expected four 30G.2 permissions, got %d", permissionCount)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO ledger_receipts(
  id, tenant_id, person_id, collaborator_id, ledger_entry_id,
  receipt_type, receipt_purpose, payment_direction, accepting_party,
  status, created_at, updated_at
) VALUES (
  'receipt-invalid', 'tenant-a', 'person-a', 'journey-a', 'entry-invalid',
  'LEDGER_DEBIT', 'FINAL_SETTLEMENT_COLLABORATOR_PAYMENT', 'TENANT_TO_COLLABORATOR', 'TENANT',
  'PENDING_ISSUE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)`); err == nil || !strings.Contains(err.Error(), "ledger_receipt_direction_invalid") {
		t.Fatalf("expected invalid direction combination rejection, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO ledger_receipts(
  id, tenant_id, person_id, collaborator_id, ledger_entry_id,
  receipt_type, receipt_purpose, payment_direction, accepting_party,
  status, created_at, updated_at
) VALUES (
  'receipt-tenant', 'tenant-a', 'person-a', 'journey-a', 'entry-tenant',
  'LEDGER_DEBIT', 'FINAL_SETTLEMENT_COLLABORATOR_PAYMENT', 'COLLABORATOR_TO_TENANT', 'TENANT',
  'PENDING_ISSUE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)`); err != nil {
		t.Fatalf("insert valid Tenant-accepted final settlement receipt: %v", err)
	}

	if _, err := sqlDB.Exec(`
UPDATE ledger_receipts
SET accepted_at = CURRENT_TIMESTAMP, accepted_by = 'tenant-admin', acceptance_method = 'IN_APP'
WHERE id = 'receipt-tenant'
`); err == nil || !strings.Contains(err.Error(), "ledger_receipt_acceptance_incomplete") {
		t.Fatalf("expected incomplete acceptance rejection, got %v", err)
	}

	acceptedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := sqlDB.Exec(`
UPDATE ledger_receipts
SET status = 'RETURNED', accepted_at = ?, accepted_by = 'tenant-admin', acceptance_method = 'IN_APP'
WHERE id = 'receipt-tenant'
`, acceptedAt); err != nil {
		t.Fatalf("accept final settlement receipt: %v", err)
	}

	if _, err := sqlDB.Exec(`UPDATE ledger_receipts SET accepted_by = 'someone-else' WHERE id = 'receipt-tenant'`); err == nil || !strings.Contains(err.Error(), "ledger_receipt_acceptance_immutable") {
		t.Fatalf("expected immutable accepted receipt rejection, got %v", err)
	}
	if _, err := sqlDB.Exec(`UPDATE ledger_receipts SET accepting_party = 'COLLABORATOR' WHERE id = 'receipt-tenant'`); err == nil || (!strings.Contains(err.Error(), "ledger_receipt_direction_immutable") && !strings.Contains(err.Error(), "ledger_receipt_direction_invalid")) {
		t.Fatalf("expected immutable receipt direction rejection, got %v", err)
	}
}

func createBidirectionalReceiptMigrationFixture(t *testing.T, sqlDB *sql.DB) {
	t.Helper()
	setup := `
CREATE TABLE ledger_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  ledger_entry_id TEXT NOT NULL UNIQUE,
  receipt_number TEXT NULL,
  receipt_type TEXT NOT NULL DEFAULT 'LEDGER_DEBIT',
  status TEXT NOT NULL DEFAULT 'PENDING_ISSUE',
  issued_at DATETIME NULL,
  issued_by TEXT NULL,
  printed_at DATETIME NULL,
  signed_at DATETIME NULL,
  returned_at DATETIME NULL,
  received_by TEXT NULL,
  signed_document_ref TEXT NULL,
  cancelled_at DATETIME NULL,
  cancelled_by TEXT NULL,
  cancellation_reason TEXT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE TABLE authz_permissions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
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
	if _, err := sqlDB.Exec(setup); err != nil {
		t.Fatalf("create 30G.2 receipt migration fixture: %v", err)
	}
}

func readBidirectionalReceiptMigration(t *testing.T) string {
	t.Helper()
	migrationPath := filepath.Join("..", "..", "migrations", "000059_bidirectional_final_settlement_receipts.up.sql")
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read 30G.2 migration: %v", err)
	}
	return string(contents)
}
