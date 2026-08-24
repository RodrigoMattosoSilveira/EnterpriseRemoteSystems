package db_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	dbpkg "enterpriseremotesystems/backend/internal/db"
)

func TestZeroBalanceJourneyClosureMigrationRejectsExistingClosedNonZeroJourney(t *testing.T) {
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
INSERT INTO ledger_entries(id, tenant_id, collaborator_id, value_unit_id, direction, amount, active)
VALUES ('ledger-positive', 'tenant-a', 'journey-closed', 'brl', 'CREDIT', 25.0, 1);
`); err != nil {
		t.Fatalf("seed closed non-zero Journey: %v", err)
	}

	migration := readZeroBalanceClosureMigration(t)
	if _, err := sqlDB.Exec(migration); err == nil || !strings.Contains(err.Error(), "closed_journey_non_zero_balance") {
		t.Fatalf("expected migration to reject closed non-zero Journey, got %v", err)
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
INSERT INTO ledger_entries(id, tenant_id, collaborator_id, value_unit_id, direction, amount, active)
VALUES ('ledger-positive', 'tenant-a', 'journey-open', 'gold', 'CREDIT', 0.00000001, 1);
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
INSERT INTO ledger_entries(id, tenant_id, collaborator_id, value_unit_id, direction, amount, active)
VALUES ('ledger-settlement', 'tenant-a', 'journey-open', 'gold', 'DEBIT', 0.00000001, 1);
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
  tenant_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  value_unit_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount REAL NOT NULL,
  active INTEGER NOT NULL
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
