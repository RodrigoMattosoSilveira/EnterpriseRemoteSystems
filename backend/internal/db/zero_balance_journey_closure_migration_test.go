package db_test

import (
	"database/sql"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestZeroBalanceJourneyClosureMigrationReconcilesExistingClosedNonZeroJourney(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	createZeroBalanceClosureMigrationFixture(t, sqlDB)
	if _, err := sqlDB.Exec(`
INSERT INTO collaborator_journeys(id, tenant_id, status_id, closed_at)
VALUES ('journey-closed', 'tenant-a', 'status-finished', '2026-08-23T12:00:00Z');
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, description, active, correction_type
)
VALUES
  ('ledger-positive', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-closed',
   'brl', 'EARNING_CREDIT', 'CREDIT', 25.0, '2026-08-23',
   'TEST', 'positive', 'Historical positive balance', 1, 'ORIGINAL'),
  ('ledger-negative', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-closed',
   'gold', 'EXPENSE_DEDUCTION', 'DEBIT', 1.25, '2026-08-23',
   'TEST', 'negative', 'Historical negative balance', 1, 'ORIGINAL');
`); err != nil {
		t.Fatalf("seed closed non-zero Journey: %v", err)
	}

	migration := readZeroBalanceClosureMigration(t)
	if _, err := sqlDB.Exec(migration); err != nil {
		t.Fatalf("expected migration to reconcile legacy closed Journey balances, got %v", err)
	}

	for _, unitID := range []string{"brl", "gold"} {
		var balance float64
		if err := sqlDB.QueryRow(`
SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)
FROM ledger_entries
WHERE tenant_id = 'tenant-a'
  AND collaborator_id = 'journey-closed'
  AND value_unit_id = ?
  AND active = 1
`, unitID).Scan(&balance); err != nil {
			t.Fatalf("read %s balance: %v", unitID, err)
		}
		if math.Abs(balance) > 0.000000001 {
			t.Fatalf("expected reconciled %s Journey balance to be zero, got %v", unitID, balance)
		}
	}

	rows, err := sqlDB.Query(`
SELECT value_unit_id, direction, amount, source_type, source_id,
       correction_reason_code, authorized_by
FROM ledger_entries
WHERE collaborator_id = 'journey-closed'
  AND source_type = 'MIGRATION'
ORDER BY value_unit_id
`)
	if err != nil {
		t.Fatalf("read reconciliation entries: %v", err)
	}
	defer rows.Close()

	type reconciliation struct {
		unit, direction, sourceType, sourceID, reasonCode, authorizedBy string
		amount                                                          float64
	}
	var got []reconciliation
	for rows.Next() {
		var row reconciliation
		if err := rows.Scan(&row.unit, &row.direction, &row.amount, &row.sourceType, &row.sourceID, &row.reasonCode, &row.authorizedBy); err != nil {
			t.Fatalf("scan reconciliation entry: %v", err)
		}
		got = append(got, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate reconciliation entries: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected two reconciliation entries, got %#v", got)
	}
	if got[0].unit != "brl" || got[0].direction != "DEBIT" || math.Abs(got[0].amount-25.0) > 0.000000001 {
		t.Fatalf("unexpected BRL reconciliation: %#v", got[0])
	}
	if got[1].unit != "gold" || got[1].direction != "CREDIT" || math.Abs(got[1].amount-1.25) > 0.000000001 {
		t.Fatalf("unexpected Gold reconciliation: %#v", got[1])
	}
	for _, row := range got {
		if row.sourceType != "MIGRATION" || !strings.HasPrefix(row.sourceID, "000058-zero-balance-closure-") || row.reasonCode != "MIGRATION_RECONCILIATION" || row.authorizedBy != "migration:000058_zero_balance_journey_closure_invariant" {
			t.Fatalf("unexpected reconciliation provenance: %#v", row)
		}
	}

	// Re-running the migration SQL must not duplicate the deterministic repair.
	// The trigger already exists, and INSERT OR IGNORE must leave exactly two
	// migration reconciliation Ledger Entries.
	if _, err := sqlDB.Exec(migration); err != nil {
		t.Fatalf("reapply migration SQL: %v", err)
	}
	var reconciliationCount int
	if err := sqlDB.QueryRow(`
SELECT COUNT(*)
FROM ledger_entries
WHERE collaborator_id = 'journey-closed'
  AND source_type = 'MIGRATION'
`).Scan(&reconciliationCount); err != nil {
		t.Fatalf("count reconciliation entries: %v", err)
	}
	if reconciliationCount != 2 {
		t.Fatalf("expected reconciliation to remain idempotent, got %d entries", reconciliationCount)
	}
}

func TestZeroBalanceJourneyClosureMigrationGuardsFutureClosure(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("access SQL database: %v", err)
	}
	defer sqlDB.Close()

	createZeroBalanceClosureMigrationFixture(t, sqlDB)
	if _, err := sqlDB.Exec(`
INSERT INTO collaborator_journeys(id, tenant_id, status_id, closed_at)
VALUES ('journey-open', 'tenant-a', 'status-active', NULL);
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, description, active, correction_type
)
VALUES ('ledger-positive', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-open',
        'gold', 'EARNING_CREDIT', 'CREDIT', 0.00000001, '2026-08-23',
        'TEST', 'open-positive', 'Open Journey balance', 1, 'ORIGINAL');
`); err != nil {
		t.Fatalf("seed open non-zero Journey: %v", err)
	}

	migration := readZeroBalanceClosureMigration(t)
	if _, err := sqlDB.Exec(migration); err != nil {
		t.Fatalf("apply zero-balance closure migration: %v", err)
	}

	if _, err := sqlDB.Exec(`
UPDATE collaborator_journeys
SET status_id = 'status-finished', closed_at = '2026-08-23T12:00:00Z'
WHERE id = 'journey-open'
`); err == nil || !strings.Contains(err.Error(), "collaborator_journey_non_zero_balance") {
		t.Fatalf("expected direct non-zero Journey closure rejection, got %v", err)
	}

	if _, err := sqlDB.Exec(`
INSERT INTO ledger_entries(
  id, created_at, updated_at, tenant_id, person_id, collaborator_id,
  value_unit_id, entry_type, direction, amount, effective_date,
  source_type, source_id, description, active, correction_type
)
VALUES ('ledger-settlement', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'tenant-a', 'person-a', 'journey-open',
        'gold', 'PAYOUT', 'DEBIT', 0.00000001, '2026-08-23',
        'TEST', 'settlement', 'Zero balance', 1, 'ORIGINAL');
UPDATE collaborator_journeys
SET status_id = 'status-finished', closed_at = '2026-08-23T12:00:00Z'
WHERE id = 'journey-open'
`); err != nil {
		t.Fatalf("expected zero-balance Journey closure to succeed: %v", err)
	}

	var closedAt string
	if err := sqlDB.QueryRow(`SELECT closed_at FROM collaborator_journeys WHERE id = 'journey-open'`).Scan(&closedAt); err != nil {
		t.Fatalf("read closed Journey: %v", err)
	}
	if strings.TrimSpace(closedAt) == "" {
		t.Fatal("expected zero-balance Journey to be closed")
	}
}

func createZeroBalanceClosureMigrationFixture(t *testing.T, sqlDB *sql.DB) {
	t.Helper()
	setup := `
CREATE TABLE reference_data (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL,
  code TEXT NOT NULL
);
CREATE TABLE collaborator_journeys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status_id TEXT NOT NULL,
  closed_at DATETIME NULL
);
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
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
  correction_reason_code TEXT NULL,
  correction_reason_text TEXT NULL,
  authorized_by TEXT NULL,
  authorized_at DATETIME NULL,
  second_approved_by TEXT NULL,
  second_approved_at DATETIME NULL,
  second_approval_notes TEXT NULL,
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (entry_type IN ('EARNING_CREDIT', 'EXPENSE_DEDUCTION', 'GOLD_TO_BRL_CONVERSION', 'PIX_REMITTANCE', 'REPLACEMENT_TRANSFER', 'PAYOUT')),
  CHECK (amount > 0),
  UNIQUE (tenant_id, source_type, source_id, value_unit_id, direction)
);
INSERT INTO reference_data(id, tenant_id, type, code)
VALUES
  ('status-active', 'tenant-a', 'collaborator_status', 'ACTIVE'),
  ('status-finished', 'tenant-a', 'collaborator_status', 'FINISHED');
`
	if _, err := sqlDB.Exec(setup); err != nil {
		t.Fatalf("create zero-balance closure migration fixture: %v", err)
	}
}

func readZeroBalanceClosureMigration(t *testing.T) string {
	t.Helper()
	migrationPath := filepath.Join("..", "..", "migrations", "000058_zero_balance_journey_closure_invariant.up.sql")
	contents, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read 30G.1 migration: %v", err)
	}
	return string(contents)
}
