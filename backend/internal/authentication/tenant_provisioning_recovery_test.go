package authentication

import (
	"context"
	"errors"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func TestTenantProvisioningCreatesOrReusesOneGlobalAccountWithoutChangingExistingCredentials(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-a", "Tenant A", "tenant-person-a", "55566677788", "tenant-driven@example.com", now)
	createFoundationTenantPerson(t, database, "tenant-b", "Tenant B", "tenant-person-b", "55566677788", "tenant-b-person@example.com", now.Add(time.Second))
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}

	service := NewService(NewRepository(database), ServiceConfig{PasswordHashCost: bcrypt.MinCost})
	before, err := service.GetPersonAuthenticationStatus(context.Background(), "tenant-a", "tenant-person-a")
	if err != nil {
		t.Fatalf("get initial tenant A authentication status: %v", err)
	}
	if before.Enabled || before.AccountActive || !before.RequiresTemporaryPassword || before.Status != "NOT_ENABLED" {
		t.Fatalf("unexpected initial tenant A authentication status: %#v", before)
	}

	first, err := service.EnablePersonAuthentication(context.Background(), "tenant-a", "tenant-person-a", EnablePersonAuthenticationRequest{
		TemporaryPassword: "Tenant-Driven-Password-1",
	})
	if err != nil {
		t.Fatalf("enable tenant A authentication: %v", err)
	}
	if !first.Enabled || !first.AccountActive || first.Status != "ENABLED" {
		t.Fatalf("unexpected tenant A enabled status: %#v", first)
	}
	if first.Login != "tenant-driven@example.com" {
		t.Fatalf("tenant provisioning must return the authoritative Account login, got %q", first.Login)
	}

	// Tenant B may learn only whether credential initialization is required for
	// this provisioning action. It must not receive another tenant, Actor, or
	// Membership identity.
	beforeSecond, err := service.GetPersonAuthenticationStatus(context.Background(), "tenant-b", "tenant-person-b")
	if err != nil {
		t.Fatalf("get tenant B authentication status: %v", err)
	}
	if beforeSecond.Enabled || beforeSecond.AccountActive || beforeSecond.RequiresTemporaryPassword || beforeSecond.Status != "NOT_ENABLED" {
		t.Fatalf("tenant B should be ready to enable without credential initialization: %#v", beforeSecond)
	}

	second, err := service.EnablePersonAuthentication(context.Background(), "tenant-b", "tenant-person-b", EnablePersonAuthenticationRequest{})
	if err != nil {
		t.Fatalf("enable tenant B authentication: %v", err)
	}
	if !second.Enabled || !second.AccountActive || second.Status != "ENABLED" {
		t.Fatalf("unexpected tenant B enabled status: %#v", second)
	}
	if second.Login != "tenant-driven@example.com" {
		t.Fatalf("tenant B provisioning must return the existing Account login, got %q", second.Login)
	}

	var accounts []Account
	if err := database.Find(&accounts).Error; err != nil {
		t.Fatalf("list Authentication Accounts: %v", err)
	}
	if len(accounts) != 1 {
		t.Fatalf("expected one global Authentication Account, got %d", len(accounts))
	}
	var bindings []AccountActor
	if err := database.Where("account_id = ? AND scope_type = ?", accounts[0].ID, AccountActorScopeTenant).Order("tenant_id").Find(&bindings).Error; err != nil {
		t.Fatalf("list tenant Actor bindings: %v", err)
	}
	if len(bindings) != 2 || bindings[0].ActorID == bindings[1].ActorID {
		t.Fatalf("expected distinct tenant Actors on one Account, got %#v", bindings)
	}

	loginResult, err := service.Login(context.Background(), LoginRequest{Login: accounts[0].Login, Password: "Tenant-Driven-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("newly provisioned Account must authenticate with its temporary password: %v", err)
	}
	if !loginResult.Session.MustChangePassword {
		t.Fatal("newly provisioned Account must require a password change on first sign-in")
	}
	if loginResult.Session.Login != "tenant-driven@example.com" {
		t.Fatalf("unexpected provisioned Account login: %q", loginResult.Session.Login)
	}
	if _, err := service.Login(context.Background(), LoginRequest{Login: accounts[0].Login, Password: "Ignored-Second-Password-2"}, "", ""); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("second-tenant temporary password must not reset the global Account, got %v", err)
	}
}

func TestTenantAdministratorCanIssuePasswordResetTokenOnlyThroughEnabledTenantPerson(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-reset", "Reset Tenant", "tenant-reset-person", "44455566677", "tenant-reset@example.com", now)
	createFoundationTenantPerson(t, database, "tenant-other", "Other Tenant", "tenant-other-person", "33344455566", "tenant-other@example.com", now.Add(time.Second))
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}

	service := NewService(NewRepository(database), ServiceConfig{PasswordHashCost: bcrypt.MinCost})
	if _, err := service.IssueTenantPersonPasswordResetToken(context.Background(), "tenant-reset", "tenant-reset-person"); !errors.Is(err, ErrAuthenticationNotEnabled) {
		t.Fatalf("tenant reset must require authentication enabled in the selected tenant, got %v", err)
	}

	if _, err := service.EnablePersonAuthentication(context.Background(), "tenant-reset", "tenant-reset-person", EnablePersonAuthenticationRequest{
		TemporaryPassword: "Tenant-Reset-Password-1",
	}); err != nil {
		t.Fatalf("enable tenant reset account: %v", err)
	}

	reset, err := service.IssueTenantPersonPasswordResetToken(context.Background(), "tenant-reset", "tenant-reset-person")
	if err != nil {
		t.Fatalf("issue tenant-scoped password reset token: %v", err)
	}
	if reset.Login != "tenant-reset@example.com" || reset.AccountID == "" || reset.Token == "" {
		t.Fatalf("unexpected tenant-scoped reset response: %#v", reset)
	}

	if _, err := service.IssueTenantPersonPasswordResetToken(context.Background(), "tenant-other", "tenant-reset-person"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("tenant administrator must not reset a Person outside the selected tenant, got %v", err)
	}
}

func TestTenantProvisioningRequiresActiveMembership(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-inactive", "Inactive Tenant Person", "inactive-person", "66677788899", "inactive-membership@example.com", now)
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}
	if err := database.Model(&appdb.ReferenceData{}).
		Where("id = ?", "status-tenant-inactive").
		Update("code", "INACTIVE").Error; err != nil {
		t.Fatalf("mark Person Membership status inactive: %v", err)
	}

	service := NewService(NewRepository(database), ServiceConfig{PasswordHashCost: bcrypt.MinCost})
	_, err := service.EnablePersonAuthentication(context.Background(), "tenant-inactive", "inactive-person", EnablePersonAuthenticationRequest{
		TemporaryPassword: "Inactive-Membership-Password-1",
	})
	if !errors.Is(err, ErrPersonMembershipRequired) {
		t.Fatalf("expected active Membership requirement, got %v", err)
	}
}

func TestAccountReactivationRequestPreservesAccountActorsAndRevokesStaleSessions(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-recovery", "Recovery Tenant", "recovery-person", "77788899900", "recovery@example.com", now)
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}

	repository := NewRepository(database)
	service := NewService(repository, ServiceConfig{PasswordHashCost: bcrypt.MinCost})
	if _, err := service.EnablePersonAuthentication(context.Background(), "tenant-recovery", "recovery-person", EnablePersonAuthenticationRequest{
		TemporaryPassword: "Recovery-Password-1",
	}); err != nil {
		t.Fatalf("enable recovery account: %v", err)
	}

	var account Account
	if err := database.First(&account, "login = ?", "recovery@example.com").Error; err != nil {
		t.Fatalf("find recovery account: %v", err)
	}
	var actorCountBefore int64
	if err := database.Model(&AccountActor{}).Where("account_id = ?", account.ID).Count(&actorCountBefore).Error; err != nil {
		t.Fatalf("count Account Actors before recovery: %v", err)
	}
	if _, err := service.SetAccountActive(context.Background(), account.ID, false); err != nil {
		t.Fatalf("deactivate recovery account: %v", err)
	}

	// Simulate a stale session record that survived outside the ordinary
	// deactivation path; approval must still revoke it.
	stale := Session{
		ID: "stale-reactivation-session", AccountID: account.ID, TokenHash: "stale-reactivation-hash",
		ExpiresAt: now.Add(time.Hour), LastSeenAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&stale).Error; err != nil {
		t.Fatalf("create stale session: %v", err)
	}

	if _, err := service.RequestSelfReactivation(context.Background(), RequestAccountReactivationRequest{
		Login: account.Login, Password: "wrong-password",
	}, "test-agent", "127.0.0.1"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password must not create reactivation request, got %v", err)
	}
	if _, err := service.RequestSelfReactivation(context.Background(), RequestAccountReactivationRequest{
		Login: account.Login, Password: "Recovery-Password-1",
	}, "test-agent", "127.0.0.1"); err != nil {
		t.Fatalf("request self reactivation: %v", err)
	}
	if _, err := service.RequestSelfReactivation(context.Background(), RequestAccountReactivationRequest{
		Login: account.Login, Password: "Recovery-Password-1",
	}, "test-agent-2", "127.0.0.2"); err != nil {
		t.Fatalf("refresh pending self reactivation request: %v", err)
	}

	requests, err := service.ListReactivationRequests(context.Background())
	if err != nil {
		t.Fatalf("list reactivation requests: %v", err)
	}
	if len(requests) != 1 || requests[0].Status != ReactivationRequestStatusPending || requests[0].RequestCount != 2 {
		t.Fatalf("expected one refreshed pending request, got %#v", requests)
	}

	reviewer := authz.AuthzActor{
		ID: "application-admin-actor", ActorKey: "application-admin-reviewer", DisplayName: "Application Administrator",
		Active: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&reviewer).Error; err != nil {
		t.Fatalf("create Application Administrator reviewer: %v", err)
	}

	reviewed, err := service.ReviewReactivationRequest(context.Background(), requests[0].ID, reviewer.ID, ReviewAccountReactivationRequest{
		Approve: true, Reason: "Identity verified",
	})
	if err != nil {
		t.Fatalf("approve reactivation request: %v", err)
	}
	if reviewed.Status != ReactivationRequestStatusApproved || reviewed.ReviewReason != "Identity verified" {
		t.Fatalf("unexpected reviewed request: %#v", reviewed)
	}

	if err := database.First(&account, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("reload recovered Account: %v", err)
	}
	if !account.Active {
		t.Fatal("approved reactivation must restore the same Account")
	}
	var actorCountAfter int64
	if err := database.Model(&AccountActor{}).Where("account_id = ?", account.ID).Count(&actorCountAfter).Error; err != nil {
		t.Fatalf("count Account Actors after recovery: %v", err)
	}
	if actorCountAfter != actorCountBefore {
		t.Fatalf("reactivation changed Actor bindings: before=%d after=%d", actorCountBefore, actorCountAfter)
	}
	if err := database.First(&stale, "id = ?", stale.ID).Error; err != nil {
		t.Fatalf("reload stale session: %v", err)
	}
	if stale.RevokedAt == nil {
		t.Fatal("reactivation approval must revoke stale sessions")
	}
	if _, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Recovery-Password-1"}, "", ""); err != nil {
		t.Fatalf("reactivated Account should authenticate with existing credentials: %v", err)
	}
}
