package main

import (
	"context"
	"path/filepath"
	"testing"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
)

func TestEnsureE2ETenantFixturesSurvivesAccountActorFoundationAndIsIdempotent(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := dbpkg.AutoMigrate(database); err != nil {
		t.Fatalf("migrate core database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization database: %v", err)
	}
	if err := authentication.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication database: %v", err)
	}
	if err := dbpkg.SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization catalog: %v", err)
	}

	ctx := context.Background()
	const password = "e2e-tenant-admin-password"
	if err := ensureE2ETenantFixtures(ctx, database, password, bcrypt.MinCost); err != nil {
		t.Fatalf("provision E2E Tenant fixtures: %v", err)
	}
	if err := authentication.EnsureAccountActorFoundation(database); err != nil {
		t.Fatalf("repair Account/Actor foundation after first provisioning: %v", err)
	}
	if err := ensureE2ETenantFixtures(ctx, database, password, bcrypt.MinCost); err != nil {
		t.Fatalf("re-provision E2E Tenant fixtures: %v", err)
	}
	if err := authentication.EnsureAccountActorFoundation(database); err != nil {
		t.Fatalf("repair Account/Actor foundation after second provisioning: %v", err)
	}

	const stem = "e2e-default-tenant-admin"
	legacyPersonID := stem + "-legacy-person"
	membershipID := stem + "-membership"
	actorID := stem + "-actor"
	accountID := stem + "-account"

	var membership dbpkg.PersonTenantMembership
	if err := database.First(&membership, "id = ?", membershipID).Error; err != nil {
		t.Fatalf("find E2E Tenant Administrator Membership: %v", err)
	}
	if membership.LegacyPersonID == nil || *membership.LegacyPersonID != legacyPersonID {
		t.Fatalf("expected Membership legacy Person %q, got %#v", legacyPersonID, membership.LegacyPersonID)
	}

	var actor authz.AuthzActor
	if err := database.First(&actor, "id = ?", actorID).Error; err != nil {
		t.Fatalf("find E2E Tenant Administrator Actor: %v", err)
	}
	if actor.PersonID == nil || *actor.PersonID != legacyPersonID {
		t.Fatalf("expected legacy actor Person projection %q, got %#v", legacyPersonID, actor.PersonID)
	}

	var binding authentication.AccountActor
	if err := database.First(&binding, "actor_id = ?", actorID).Error; err != nil {
		t.Fatalf("find E2E Tenant Administrator Account/Actor binding: %v", err)
	}
	if binding.AccountID != accountID {
		t.Fatalf("expected Account/Actor binding account %q, got %q", accountID, binding.AccountID)
	}
	if binding.TenantID == nil || *binding.TenantID != dbpkg.DefaultTenantID {
		t.Fatalf("expected Account/Actor binding tenant %q, got %#v", dbpkg.DefaultTenantID, binding.TenantID)
	}
	if binding.MembershipID == nil || *binding.MembershipID != membershipID {
		t.Fatalf("expected Account/Actor binding Membership %q, got %#v", membershipID, binding.MembershipID)
	}
}
