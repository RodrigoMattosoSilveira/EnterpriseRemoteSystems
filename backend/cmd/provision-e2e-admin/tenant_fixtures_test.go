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
	membershipID := stem + "-membership"
	actorID := stem + "-actor"
	accountID := stem + "-account"

	var membership dbpkg.PersonTenantMembership
	if err := database.First(&membership, "id = ?", membershipID).Error; err != nil {
		t.Fatalf("find E2E Tenant Administrator Membership: %v", err)
	}

	var actor authz.AuthzActor
	if err := database.First(&actor, "id = ?", actorID).Error; err != nil {
		t.Fatalf("find E2E Tenant Administrator Actor: %v", err)
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

	var multiAccount authentication.Account
	if err := database.First(&multiAccount, "id = ?", "e2e-multi-tenant-account").Error; err != nil {
		t.Fatalf("find E2E multi-Tenant Account: %v", err)
	}
	if multiAccount.Login != e2eMultiTenantPersonLogin {
		t.Fatalf("expected E2E multi-Tenant login %q, got %q", e2eMultiTenantPersonLogin, multiAccount.Login)
	}
	var multiPerson dbpkg.GlobalPerson
	if err := database.First(&multiPerson, "id = ?", "e2e-multi-tenant-person").Error; err != nil {
		t.Fatalf("find E2E multi-Tenant Global Person: %v", err)
	}
	if multiPerson.ProfileCompletionStatus != "COMPLETE" || !multiPerson.CanCreateCollaborator {
		t.Fatalf(
			"expected E2E multi-Tenant Global Person to be Collaborator-ready, got status=%q canCreateCollaborator=%v",
			multiPerson.ProfileCompletionStatus,
			multiPerson.CanCreateCollaborator,
		)
	}
	if multiPerson.Street1 == "" || multiPerson.CEP == "" || multiPerson.BankName == "" || multiPerson.PIXKey == nil || *multiPerson.PIXKey == "" || multiPerson.EmergencyCellular == "" {
		t.Fatalf("expected E2E multi-Tenant Global Person to retain complete address, bank, and emergency profile data, got %#v", multiPerson)
	}
	var multiBindings []authentication.AccountActor
	if err := database.Where("account_id = ?", multiAccount.ID).Order("tenant_id ASC").Find(&multiBindings).Error; err != nil {
		t.Fatalf("find E2E multi-Tenant Account/Actor bindings: %v", err)
	}
	if len(multiBindings) != 2 {
		t.Fatalf("expected two E2E multi-Tenant Account/Actor bindings, got %#v", multiBindings)
	}
	for i, tenantID := range []string{e2eMultiTenantAID, e2eMultiTenantBID} {
		binding := multiBindings[i]
		if binding.ScopeType != authentication.AccountActorScopeTenant {
			t.Fatalf("expected %s binding to be TENANT scoped, got %q", tenantID, binding.ScopeType)
		}
		if binding.TenantID == nil || *binding.TenantID != tenantID {
			t.Fatalf("expected %s binding tenant, got %#v", tenantID, binding.TenantID)
		}
		if binding.MembershipID == nil || *binding.MembershipID == "" {
			t.Fatalf("expected %s binding Membership, got %#v", tenantID, binding.MembershipID)
		}
	}

	var bite32Journeys []dbpkg.CollaboratorJourney
	if err := database.Where("id IN ?", []string{e2eBite32CurrentJourneyID, e2eBite32ClosedJourneyID}).Order("id ASC").Find(&bite32Journeys).Error; err != nil {
		t.Fatalf("find Bite 32 Journey fixtures: %v", err)
	}
	if len(bite32Journeys) != 2 {
		t.Fatalf("expected current and closed Bite 32 Journeys, got %#v", bite32Journeys)
	}
	var evidenceAssignments int64
	if err := database.Model(&dbpkg.WorkPeriodAssignment{}).Where("collaborator_id = ? AND actual_status = ?", e2eBite32ClosedJourneyID, "WORKED").Count(&evidenceAssignments).Error; err != nil {
		t.Fatalf("count Bite 32 recognized-work evidence: %v", err)
	}
	if evidenceAssignments != 1 {
		t.Fatalf("expected one recognized-work assignment for Bite 32 closed Journey, got %d", evidenceAssignments)
	}
	var evidenceAccruals int64
	if err := database.Model(&dbpkg.AccrualItem{}).Where("collaborator_id = ? AND status = ?", e2eBite32ClosedJourneyID, "POSTED").Count(&evidenceAccruals).Error; err != nil {
		t.Fatalf("count Bite 32 accrual evidence: %v", err)
	}
	if evidenceAccruals != 1 {
		t.Fatalf("expected one posted Bite 32 accrual item, got %d", evidenceAccruals)
	}
	var evidenceLedger int64
	if err := database.Model(&dbpkg.LedgerEntry{}).Where("collaborator_id = ?", e2eBite32ClosedJourneyID).Count(&evidenceLedger).Error; err != nil {
		t.Fatalf("count Bite 32 ledger evidence: %v", err)
	}
	if evidenceLedger != 2 {
		t.Fatalf("expected earning credit and payout for Bite 32 closed Journey, got %d", evidenceLedger)
	}

	var roleAccount authentication.Account
	if err := database.First(&roleAccount, "id = ?", e2eBite32RoleStem+"-account").Error; err != nil {
		t.Fatalf("find Bite 32 Role-isolation Account: %v", err)
	}
	if roleAccount.Login != e2eBite32RoleLogin {
		t.Fatalf("expected Bite 32 Role-isolation login %q, got %q", e2eBite32RoleLogin, roleAccount.Login)
	}
	var roleBindings []authentication.AccountActor
	if err := database.Where("account_id = ?", roleAccount.ID).Order("tenant_id ASC").Find(&roleBindings).Error; err != nil {
		t.Fatalf("find Bite 32 Role-isolation Account/Actor bindings: %v", err)
	}
	if len(roleBindings) != 2 {
		t.Fatalf("expected two Bite 32 Role-isolation Tenant bindings, got %#v", roleBindings)
	}
	var roleCollaborators int64
	if err := database.Model(&dbpkg.CollaboratorJourney{}).Where("id LIKE ? AND closed_at IS NULL", e2eBite32RoleStem+"-journey-%").Count(&roleCollaborators).Error; err != nil {
		t.Fatalf("count Bite 32 Role-isolation Collaborators: %v", err)
	}
	if roleCollaborators != 2 {
		t.Fatalf("expected baseline Collaborator participation in both Bite 32 Role-isolation Tenants, got %d", roleCollaborators)
	}
	var roleGrants int64
	roleActorIDs := []string{e2eBite32RoleStem + "-actor-" + dbpkg.DefaultTenantID, e2eBite32RoleStem + "-actor-" + e2eBite32RoleOtherTenantID}
	if err := database.Model(&authz.AuthzActorRoleGrant{}).Where("actor_id IN ? AND active = ?", roleActorIDs, true).Count(&roleGrants).Error; err != nil {
		t.Fatalf("count Bite 32 Role-isolation delegated grants: %v", err)
	}
	if roleGrants != 0 {
		t.Fatalf("Bite 32 Role-isolation Person must start with baseline-only participation, got %d active Role Grant(s)", roleGrants)
	}
}

func TestEnsureE2ETenantFixturesSeedsDefaultTenantReferenceBaselineBeforeProvisioning(t *testing.T) {
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
	if err := dbpkg.SeedTenants(database); err != nil {
		t.Fatalf("seed default Tenant only: %v", err)
	}
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization catalog: %v", err)
	}

	var before int64
	if err := database.Model(&dbpkg.ReferenceData{}).
		Where("tenant_id = ? AND type = ? AND code = ?", dbpkg.DefaultTenantID, "collaborator_status", "ACTIVE").
		Count(&before).Error; err != nil {
		t.Fatalf("count default collaborator status before E2E provisioning: %v", err)
	}
	if before != 0 {
		t.Fatalf("expected migration-shaped default Tenant without runtime collaborator baseline, got %d row(s)", before)
	}

	const password = "e2e-tenant-admin-password"
	if err := ensureE2ETenantFixtures(context.Background(), database, password, bcrypt.MinCost); err != nil {
		t.Fatalf("provision E2E Tenant fixtures before application reference bootstrap: %v", err)
	}

	var after int64
	if err := database.Model(&dbpkg.ReferenceData{}).
		Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", dbpkg.DefaultTenantID, "collaborator_status", "ACTIVE", true).
		Count(&after).Error; err != nil {
		t.Fatalf("count default collaborator status after E2E provisioning: %v", err)
	}
	if after != 1 {
		t.Fatalf("expected E2E provisioning to establish default collaborator baseline, got %d row(s)", after)
	}

	var closedJourney dbpkg.CollaboratorJourney
	if err := database.First(&closedJourney, "id = ?", e2eBite32ClosedJourneyID).Error; err != nil {
		t.Fatalf("find Bite 32 closed Journey after baseline repair: %v", err)
	}
}

func TestE2EApplicationAdministratorTenantOptionsRemainGlobalOnlyBeforeSupportLease(t *testing.T) {
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
	const password = "Local-E2E-Administrator-28D!"
	applicationAdmin, err := authentication.ProvisionApplicationAdmin(ctx, database, authentication.ProvisionApplicationAdminConfig{
		ActorKey:         "e2e-application-admin",
		DisplayName:      "Local E2E Administrator",
		Login:            "admin@example.com",
		Password:         password,
		PasswordHashCost: bcrypt.MinCost,
	})
	if err != nil {
		t.Fatalf("provision Application Administrator: %v", err)
	}
	if err := ensureE2ETenantFixtures(ctx, database, password, bcrypt.MinCost); err != nil {
		t.Fatalf("provision E2E Tenant fixtures: %v", err)
	}

	options, err := authz.NewGORMStore(database).ListAccountTenantOptions(ctx, applicationAdmin.AccountID)
	if err != nil {
		t.Fatalf("list Application Administrator tenant options: %v", err)
	}
	if len(options) != 1 {
		t.Fatalf("fresh Application Administrator must expose exactly one context, got %#v", options)
	}
	global := options[0]
	if global.ID != authz.GlobalTenantScope || global.ContextKind != authz.TenantOptionContextGlobal || global.ActorScope != string(authz.ActorScopeApplication) {
		t.Fatalf("fresh Application Administrator must expose only GLOBAL administration, got %#v", global)
	}
	if global.MembershipID != "" || global.SupportLeaseID != "" || global.SupportLeaseExpiresAt != "" {
		t.Fatalf("fresh GLOBAL context must not carry Tenant identity or Support Lease provenance, got %#v", global)
	}

	var tenantBindings int64
	if err := database.Model(&authentication.AccountActor{}).
		Where("account_id = ? AND scope_type = ?", applicationAdmin.AccountID, authentication.AccountActorScopeTenant).
		Count(&tenantBindings).Error; err != nil {
		t.Fatalf("count Application Administrator TENANT bindings: %v", err)
	}
	if tenantBindings != 0 {
		t.Fatalf("fresh Application Administrator unexpectedly has %d TENANT binding(s)", tenantBindings)
	}
}
