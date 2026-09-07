package db

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestOpenConfiguresSQLiteConnectionPragmas(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}

	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("get sql database: %v", err)
	}
	defer sqlDB.Close()

	var foreignKeys int
	if err := sqlDB.QueryRow("PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
		t.Fatalf("read foreign_keys pragma: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("expected foreign_keys=1, got %d", foreignKeys)
	}

	var journalMode string
	if err := sqlDB.QueryRow("PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatalf("read journal_mode pragma: %v", err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("expected journal_mode=WAL, got %q", journalMode)
	}

	var synchronous int
	if err := sqlDB.QueryRow("PRAGMA synchronous").Scan(&synchronous); err != nil {
		t.Fatalf("read synchronous pragma: %v", err)
	}
	if synchronous != 2 {
		t.Fatalf("expected synchronous=FULL (2), got %d", synchronous)
	}

	var busyTimeout int
	if err := sqlDB.QueryRow("PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
		t.Fatalf("read busy_timeout pragma: %v", err)
	}
	if busyTimeout != 5000 {
		t.Fatalf("expected busy_timeout=5000, got %d", busyTimeout)
	}
}

func TestSQLiteDSNUsesDriverSupportedPragmaParameters(t *testing.T) {
	dsn := sqliteDSN("/tmp/ers test.db")

	for _, pragma := range []string{
		"foreign_keys%28on%29",
		"journal_mode%28WAL%29",
		"synchronous%28FULL%29",
		"busy_timeout%285000%29",
	} {
		if !strings.Contains(dsn, "_pragma="+pragma) {
			t.Fatalf("expected DSN to contain _pragma=%s, got %s", pragma, dsn)
		}
	}
	for _, unsupported := range []string{"_foreign_keys=", "_journal_mode=", "_busy_timeout="} {
		if strings.Contains(dsn, unsupported) {
			t.Fatalf("DSN must not use unsupported shorthand %q: %s", unsupported, dsn)
		}
	}
}
