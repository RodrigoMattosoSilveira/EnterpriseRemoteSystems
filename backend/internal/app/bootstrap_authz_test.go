package app

import (
	"context"
	"path/filepath"
	"testing"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
)

func TestBootstrapEnsuresConfiguredAuthzBootstrapActor(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := Bootstrap(Config{
		Env:                    "test",
		HTTPAddr:               ":0",
		DBPath:                 dbPath,
		JWTSecret:              "test-secret",
		AuthzBootstrapEnabled:  true,
		AuthzBootstrapActorKey: "bootstrap-admin",
	})
	if err != nil {
		t.Fatalf("bootstrap app: %v", err)
	}
	if server == nil {
		t.Fatalf("expected server")
	}
	cleanup()

	database, err := appdb.Open(dbPath)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	actor, err := authz.NewGORMStore(database).FindActor(context.Background(), authz.ActorLookup{ActorID: "bootstrap-admin", TenantID: authz.GlobalTenantScope})
	if err != nil {
		t.Fatalf("find bootstrap actor: %v", err)
	}
	if err := authz.RequirePermission(actor, authz.PermissionAuthzManage); err != nil {
		t.Fatalf("expected bootstrap actor to manage authz: %v", err)
	}
}

func TestBootstrapRefreshesCanonicalPeopleSearchProjectionWhenAutoMigrateDisabled(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "app.db")
	database, err := appdb.Open(dbPath)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := appdb.AutoMigrate(database); err != nil {
		t.Fatalf("migrate core database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization database: %v", err)
	}
	if err := authentication.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication database: %v", err)
	}

	// Recreate the table shape provided by historical migration 000055 while
	// deliberately leaving the canonical Membership triggers in place. Bootstrap
	// must refresh this disposable projection before any Membership-foundation
	// repair can fire those triggers, so mixed/partially refreshed state is safe.
	if err := database.Exec(`DROP TABLE people_search_index`).Error; err != nil {
		t.Fatalf("drop canonical people search projection: %v", err)
	}
	if err := database.Exec(`CREATE TABLE people_search_index (
		person_id TEXT PRIMARY KEY,
		tenant_id TEXT NOT NULL,
		search_text TEXT NOT NULL
	)`).Error; err != nil {
		t.Fatalf("create legacy people search projection: %v", err)
	}
	if database.Migrator().HasColumn("people_search_index", "membership_id") {
		t.Fatal("legacy people search projection unexpectedly has membership_id")
	}
	if sqlDB, err := database.DB(); err != nil {
		t.Fatalf("get sql database: %v", err)
	} else if err := sqlDB.Close(); err != nil {
		t.Fatalf("close setup database: %v", err)
	}

	server, cleanup, err := Bootstrap(Config{
		Env:                   "test",
		HTTPAddr:              ":0",
		DBPath:                dbPath,
		JWTSecret:             "test-secret",
		AutoMigrate:           false,
		AutoMigrateConfigured: true,
	})
	if err != nil {
		t.Fatalf("bootstrap app without automigrate: %v", err)
	}
	if server == nil {
		t.Fatal("expected server")
	}
	cleanup()

	database, err = appdb.Open(dbPath)
	if err != nil {
		t.Fatalf("reopen database: %v", err)
	}
	if !database.Migrator().HasColumn("people_search_index", "membership_id") {
		t.Fatal("expected Bootstrap to refresh people_search_index with membership_id")
	}
	if !database.Migrator().HasColumn("people_search_index", "person_id") {
		t.Fatal("expected canonical people_search_index to retain global person_id")
	}
}
