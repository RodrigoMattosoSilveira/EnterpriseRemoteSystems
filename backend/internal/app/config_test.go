package app

import "testing"

func TestLoadConfigSupportsDatabasePathAlias(t *testing.T) {
	t.Setenv("APP_ENV", "ci")
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("DATABASE_PATH", "data/app-ci.db")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.DBPath != "data/app-ci.db" {
		t.Fatalf("expected DATABASE_PATH fallback to be used, got %q", cfg.DBPath)
	}
}

func TestLoadConfigPrefersDBPathOverDatabasePathAlias(t *testing.T) {
	t.Setenv("APP_ENV", "ci")
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("DB_PATH", "data/app-db-path.db")
	t.Setenv("DATABASE_PATH", "data/app-ci.db")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.DBPath != "data/app-db-path.db" {
		t.Fatalf("expected DB_PATH to win over DATABASE_PATH, got %q", cfg.DBPath)
	}
}
