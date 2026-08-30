package authz

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gorm.io/gorm"
)

func TestEnsureBootstrapActorDisabledDoesNothing(t *testing.T) {
	database := newAuthzTestDB(t)

	result, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{Enabled: false, ActorKey: "bootstrap-admin"})
	if err != nil {
		t.Fatalf("ensure bootstrap actor: %v", err)
	}
	if result.Enabled {
		t.Fatalf("expected disabled result")
	}

	var count int64
	if err := database.Model(&AuthzActor{}).Where("actor_key = ?", "bootstrap-admin").Count(&count).Error; err != nil {
		t.Fatalf("count bootstrap actor: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no bootstrap actor, got %d", count)
	}
}

func TestEnsureBootstrapActorRequiresActorKeyWhenEnabled(t *testing.T) {
	database := newAuthzTestDB(t)

	_, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{Enabled: true})
	if err == nil {
		t.Fatalf("expected validation error")
	}
	var validation ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected ValidationError, got %T %v", err, err)
	}
	if validation.ValidationFields()["actorKey"] == "" {
		t.Fatalf("expected actorKey validation message")
	}
}

func TestEnsureBootstrapActorCreatesApplicationAdminGrant(t *testing.T) {
	database := newAuthzTestDB(t)

	result, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{
		Enabled:     true,
		ActorKey:    "bootstrap-admin",
		DisplayName: "Bootstrap Admin",
	})
	if err != nil {
		t.Fatalf("ensure bootstrap actor: %v", err)
	}
	if !result.ActorCreated || !result.GrantCreated {
		t.Fatalf("expected actor and grant creation, got %#v", result)
	}
	if result.RoleCode != string(RoleApplicationAdmin) || result.TenantID != GlobalTenantScope {
		t.Fatalf("unexpected bootstrap result: %#v", result)
	}

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "bootstrap-admin", TenantID: "default"})
	if err != nil {
		t.Fatalf("find bootstrap actor: %v", err)
	}
	if actor.Scope != ActorScopeApplication {
		t.Fatalf("expected application scope, got %q", actor.Scope)
	}
	if err := RequirePermission(actor, PermissionAuthzManage); err != nil {
		t.Fatalf("expected bootstrap actor to manage authz, got %v", err)
	}
}

func TestEnsureBootstrapActorIsIdempotent(t *testing.T) {
	database := newAuthzTestDB(t)
	cfg := BootstrapConfig{Enabled: true, ActorKey: "bootstrap-admin", DisplayName: "Bootstrap Admin"}

	first, err := EnsureBootstrapActor(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("first bootstrap: %v", err)
	}
	second, err := EnsureBootstrapActor(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("second bootstrap: %v", err)
	}
	if first.ActorID == "" || first.ActorID != second.ActorID {
		t.Fatalf("expected same actor ID, got first=%#v second=%#v", first, second)
	}
	if second.ActorCreated || second.GrantCreated {
		t.Fatalf("expected idempotent second run, got %#v", second)
	}

	var actorCount int64
	if err := database.Model(&AuthzActor{}).Where("actor_key = ?", "bootstrap-admin").Count(&actorCount).Error; err != nil {
		t.Fatalf("count actors: %v", err)
	}
	if actorCount != 1 {
		t.Fatalf("expected one actor, got %d", actorCount)
	}

	var grantCount int64
	if err := database.Model(&AuthzActorRoleGrant{}).Where("actor_id = ?", first.ActorID).Count(&grantCount).Error; err != nil {
		t.Fatalf("count grants: %v", err)
	}
	if grantCount != 1 {
		t.Fatalf("expected one grant, got %d", grantCount)
	}
}

func TestEnsureBootstrapActorRejectsUnboundTenantAdministrator(t *testing.T) {
	database := newAuthzTestDB(t)

	_, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{
		Enabled:     true,
		ActorKey:    "tenant-bootstrap",
		DisplayName: "Tenant Bootstrap",
		RoleCode:    RoleTenantAdmin,
		TenantID:    "tenant-a",
	})
	if err == nil || !strings.Contains(err.Error(), "Account/Actor and Person Membership foundation") {
		t.Fatalf("expected unbound Tenant Administrator bootstrap rejection, got %v", err)
	}
}

func TestEnsureBootstrapActorRequireEmptyActorTableRejectsDifferentExistingActors(t *testing.T) {
	database := newAuthzTestDB(t)
	createAuthzActor(t, database, "existing-admin", nil, nil)

	_, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{
		Enabled:                true,
		ActorKey:               "bootstrap-admin",
		RequireEmptyActorTable: true,
	})
	if err == nil {
		t.Fatalf("expected bootstrap to reject non-empty actor table")
	}
}

func TestEnsureBootstrapActorReactivatesExistingActorAndGrant(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "bootstrap-admin", nil, nil)
	grantAuthzRole(t, database, actorID, RoleApplicationAdmin, GlobalTenantScope)

	if err := database.Model(&AuthzActor{}).Where("id = ?", actorID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate actor: %v", err)
	}
	if err := database.Model(&AuthzActorRoleGrant{}).Where("actor_id = ?", actorID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate grant: %v", err)
	}

	result, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{Enabled: true, ActorKey: "bootstrap-admin", DisplayName: "Bootstrap Admin"})
	if err != nil {
		t.Fatalf("ensure bootstrap actor: %v", err)
	}
	if result.ActorCreated || result.GrantCreated {
		t.Fatalf("expected reactivation without creation, got %#v", result)
	}

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "bootstrap-admin", TenantID: "default"})
	if err != nil {
		t.Fatalf("find reactivated actor: %v", err)
	}
	if !actor.HasPermission(PermissionAll) {
		t.Fatalf("expected wildcard permission after reactivation")
	}
}

func TestEnsureBootstrapActorRejectsUnknownRole(t *testing.T) {
	database := newAuthzTestDB(t)

	_, err := EnsureBootstrapActor(context.Background(), database, BootstrapConfig{Enabled: true, ActorKey: "bootstrap-admin", RoleCode: RoleCode("MISSING_ROLE")})
	if err == nil {
		t.Fatalf("expected unknown role error")
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected record not found, got %v", err)
	}
}
