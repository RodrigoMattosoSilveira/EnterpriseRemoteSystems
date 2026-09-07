package authz

import (
	"errors"
	"reflect"
	"testing"
)

func TestExtractActorRequiresActor(t *testing.T) {
	actor, err := ExtractActor(func(string) string { return "" })

	if actor != nil {
		t.Fatalf("expected no actor, got %#v", actor)
	}
	if !errors.Is(err, ErrMissingActor) {
		t.Fatalf("expected ErrMissingActor, got %v", err)
	}
}

func TestExtractActorUsesForwardCompatibleActorHeader(t *testing.T) {
	actor, err := ExtractActor(headerGetter(map[string]string{
		HeaderActorID:          " finance-admin@example.com ",
		HeaderAuthorizedBy:     " legacy-admin@example.com ",
		HeaderTenantID:         " tenant-1 ",
		HeaderActorPermissions: "ledger.receipts.print, ledger.receipts.return",
	}))
	if err != nil {
		t.Fatalf("expected actor, got error %v", err)
	}

	if actor.ID != "finance-admin@example.com" {
		t.Fatalf("expected actor ID from %s, got %q", HeaderActorID, actor.ID)
	}
	if actor.Source != ActorSourceHeaderActorID {
		t.Fatalf("expected source %q, got %q", ActorSourceHeaderActorID, actor.Source)
	}
	if actor.TenantID != "tenant-1" {
		t.Fatalf("expected tenant scope, got %q", actor.TenantID)
	}
	if !actor.HasPermission(PermissionLedgerReceiptsPrint) {
		t.Fatalf("expected actor to have %q", PermissionLedgerReceiptsPrint)
	}
	if !actor.HasPermission(PermissionLedgerReceiptsReturn) {
		t.Fatalf("expected actor to have %q", PermissionLedgerReceiptsReturn)
	}
}

func TestExtractActorPreservesLegacyAuthorizedByCompatibility(t *testing.T) {
	actor, err := ExtractActor(headerGetter(map[string]string{
		HeaderAuthorizedBy: " legacy-backfill ",
	}))
	if err != nil {
		t.Fatalf("expected legacy actor, got error %v", err)
	}

	if actor.ID != "legacy-backfill" {
		t.Fatalf("expected legacy actor ID, got %q", actor.ID)
	}
	if actor.Source != ActorSourceHeaderAuthorizedBy {
		t.Fatalf("expected source %q, got %q", ActorSourceHeaderAuthorizedBy, actor.Source)
	}
}

func TestRequirePermissionRejectsMissingActor(t *testing.T) {
	err := RequirePermission(nil, PermissionLedgerReceiptsPrint)

	if !errors.Is(err, ErrMissingActor) {
		t.Fatalf("expected ErrMissingActor, got %v", err)
	}
}

func TestRequirePermissionRejectsActorWithoutPermission(t *testing.T) {
	actor := &Actor{ID: "finance-admin@example.com"}

	err := RequirePermission(actor, PermissionLedgerReceiptsPrint)

	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
}

func TestRequirePermissionAllowsPermittedActor(t *testing.T) {
	actor := &Actor{
		ID: "finance-admin@example.com",
		Permissions: map[Permission]struct{}{
			PermissionLedgerReceiptsPrint: {},
		},
	}

	if err := RequirePermission(actor, PermissionLedgerReceiptsPrint); err != nil {
		t.Fatalf("expected permitted actor, got %v", err)
	}
}

func TestRequirePermissionAllowsLegacyActorOnlyWhenExplicitlyOptedIn(t *testing.T) {
	actor := &Actor{ID: "legacy-admin", Source: ActorSourceHeaderAuthorizedBy}

	if err := RequirePermission(actor, PermissionLedgerReceiptsPrint); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected legacy actor to be forbidden without option, got %v", err)
	}
	if err := RequirePermission(actor, PermissionLedgerReceiptsPrint, WithLegacyAuthorizedByCompatibility()); err != nil {
		t.Fatalf("expected legacy actor compatibility, got %v", err)
	}
}

func TestPermissionNamesAreStable(t *testing.T) {
	permissions := map[Permission]struct{}{
		PermissionJourneySettlementsClose: {},
		PermissionLedgerReceiptsPrint:     {},
	}

	got := PermissionNames(permissions)
	want := []string{"journey.settlements.close", "ledger.receipts.print"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("PermissionNames() = %#v, want %#v", got, want)
	}
}

func headerGetter(headers map[string]string) HeaderGetter {
	return func(name string) string {
		return headers[name]
	}
}

func TestRequirePermissionAllowsWildcardPermission(t *testing.T) {
	actor := &Actor{
		ID: "tenant-admin@example.com",
		Permissions: map[Permission]struct{}{
			PermissionAll: {},
		},
	}

	if err := RequirePermission(actor, PermissionLedgerReceiptsBackfill); err != nil {
		t.Fatalf("expected wildcard permission to allow receipt backfill, got %v", err)
	}
}

func TestRequireTenantScopeRejectsApplicationControlPlaneActor(t *testing.T) {
	actor := &Actor{ID: "app-admin@example.com", TenantID: GlobalTenantScope, Scope: ActorScopeApplication}

	if err := RequireTenantScope(actor, "tenant-1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected Application control-plane actor to be denied Tenant scope, got %v", err)
	}
}

func TestRequireTenantScopeAllowsLeasedApplicationActorOnlyForLeaseTenant(t *testing.T) {
	actor := &Actor{
		ID:             "app-admin@example.com",
		TenantID:       "tenant-1",
		Scope:          ActorScopeApplication,
		SupportLeaseID: "lease-1",
	}

	if err := RequireTenantScope(actor, "tenant-1"); err != nil {
		t.Fatalf("expected leased Application actor to satisfy exact Tenant scope, got %v", err)
	}
	if err := RequireTenantScope(actor, "tenant-2"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected leased Application actor to be denied another Tenant, got %v", err)
	}
}

func TestRequireTenantScopeRejectsDifferentTenant(t *testing.T) {
	actor := &Actor{ID: "tenant-admin@example.com", TenantID: "tenant-1", Scope: ActorScopeTenant}

	if err := RequireTenantScope(actor, "tenant-2"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
}
