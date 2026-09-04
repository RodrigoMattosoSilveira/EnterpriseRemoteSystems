package app

import (
	"context"
	"path/filepath"
	"testing"

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
