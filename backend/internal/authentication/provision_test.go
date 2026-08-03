package authentication

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func TestProvisionApplicationAdminCreatesAndIsIdempotent(t *testing.T) {
	database := newProvisioningTestDatabase(t)
	cfg := ProvisionApplicationAdminConfig{
		ActorKey:         "e2e-application-admin",
		DisplayName:      "Development E2E Administrator",
		Login:            "e2e-admin@example.com",
		Password:         "E2E-Administrator-Password!",
		PasswordHashCost: bcrypt.MinCost,
	}

	first, err := ProvisionApplicationAdmin(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("first provision: %v", err)
	}
	if !first.ActorCreated || !first.GrantCreated || !first.AccountCreated || !first.PasswordUpdated {
		t.Fatalf("expected first run to create complete administrator identity, got %#v", first)
	}

	account := findProvisionedAccount(t, database, cfg.Login)
	originalHash := account.PasswordHash
	if account.MustChangePassword || !account.Active {
		t.Fatalf("expected active non-temporary administrator account, got %#v", account)
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(cfg.Password)) != nil {
		t.Fatal("provisioned password does not match")
	}
	assertApplicationAdministrator(t, database, cfg.ActorKey)

	second, err := ProvisionApplicationAdmin(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("second provision: %v", err)
	}
	if second.ActorCreated || second.GrantCreated || second.AccountCreated || second.AccountReactivated || second.AuthorizationReactivated || second.LoginUpdated || second.PasswordUpdated {
		t.Fatalf("expected second run to be idempotent, got %#v", second)
	}
	account = findProvisionedAccount(t, database, cfg.Login)
	if account.PasswordHash != originalHash {
		t.Fatal("idempotent provisioning should not replace an unchanged password hash")
	}
}

func TestProvisionApplicationAdminReconcilesAccountAndRevokesSessions(t *testing.T) {
	database := newProvisioningTestDatabase(t)
	cfg := ProvisionApplicationAdminConfig{
		ActorKey:         "e2e-application-admin",
		DisplayName:      "E2E Administrator",
		Login:            "old-e2e-admin@example.com",
		Password:         "Original-E2E-Password!",
		PasswordHashCost: bcrypt.MinCost,
	}
	created, err := ProvisionApplicationAdmin(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("create administrator: %v", err)
	}

	now := time.Now().UTC()
	session := Session{
		ID:         ids.New(),
		AccountID:  created.AccountID,
		TokenHash:  "provision-test-token",
		ExpiresAt:  now.Add(time.Hour),
		LastSeenAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := database.Create(&session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}
	if err := database.Model(&Account{}).Where("id = ?", created.AccountID).Updates(map[string]any{
		"active":               false,
		"must_change_password": true,
	}).Error; err != nil {
		t.Fatalf("deactivate account: %v", err)
	}
	if err := database.Model(&authz.AuthzActor{}).Where("id = ?", created.ActorID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate actor: %v", err)
	}
	if err := database.Model(&authz.AuthzActorRoleGrant{}).Where("actor_id = ?", created.ActorID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate grant: %v", err)
	}
	if err := database.Model(&authz.AuthzRole{}).Where("code = ?", string(authz.RoleApplicationAdmin)).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate application administrator role: %v", err)
	}

	cfg.Login = "new-e2e-admin@example.com"
	cfg.Password = "Rotated-E2E-Password!"
	reconciled, err := ProvisionApplicationAdmin(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("reconcile administrator: %v", err)
	}
	if !reconciled.AccountReactivated || !reconciled.AuthorizationReactivated || !reconciled.LoginUpdated || !reconciled.PasswordUpdated {
		t.Fatalf("expected account reconciliation, got %#v", reconciled)
	}

	account := findProvisionedAccount(t, database, cfg.Login)
	if !account.Active || account.MustChangePassword {
		t.Fatalf("expected reconciled active account, got %#v", account)
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(cfg.Password)) != nil {
		t.Fatal("rotated password does not match")
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte("Original-E2E-Password!")) == nil {
		t.Fatal("old password still matches after rotation")
	}

	var storedSession Session
	if err := database.First(&storedSession, "id = ?", session.ID).Error; err != nil {
		t.Fatalf("find session: %v", err)
	}
	if storedSession.RevokedAt == nil {
		t.Fatal("expected provisioning reconciliation to revoke existing sessions")
	}
	assertApplicationAdministrator(t, database, cfg.ActorKey)
}

func TestProvisionApplicationAdminRevokesSessionsWhenAuthorizationIsReactivated(t *testing.T) {
	database := newProvisioningTestDatabase(t)
	cfg := ProvisionApplicationAdminConfig{
		ActorKey:         "e2e-application-admin",
		DisplayName:      "E2E Administrator",
		Login:            "e2e-admin@example.com",
		Password:         "Stable-E2E-Administrator-Password!",
		PasswordHashCost: bcrypt.MinCost,
	}
	created, err := ProvisionApplicationAdmin(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("create administrator: %v", err)
	}
	account := findProvisionedAccount(t, database, cfg.Login)
	originalHash := account.PasswordHash

	now := time.Now().UTC()
	session := Session{
		ID:         ids.New(),
		AccountID:  created.AccountID,
		TokenHash:  "authorization-reactivation-token",
		ExpiresAt:  now.Add(time.Hour),
		LastSeenAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := database.Create(&session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}
	resetToken := PasswordResetToken{
		ID:        ids.New(),
		AccountID: created.AccountID,
		TokenHash: "authorization-reactivation-reset-token",
		ExpiresAt: now.Add(time.Hour),
		CreatedAt: now,
	}
	if err := database.Create(&resetToken).Error; err != nil {
		t.Fatalf("create password reset token: %v", err)
	}
	if err := database.Model(&authz.AuthzActor{}).Where("id = ?", created.ActorID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate actor: %v", err)
	}

	reconciled, err := ProvisionApplicationAdmin(context.Background(), database, cfg)
	if err != nil {
		t.Fatalf("reactivate authorization: %v", err)
	}
	if !reconciled.AuthorizationReactivated {
		t.Fatalf("expected authorization reactivation, got %#v", reconciled)
	}
	if reconciled.AccountCreated || reconciled.AccountReactivated || reconciled.LoginUpdated || reconciled.PasswordUpdated {
		t.Fatalf("authorization-only reconciliation changed account credentials: %#v", reconciled)
	}
	account = findProvisionedAccount(t, database, cfg.Login)
	if account.PasswordHash != originalHash {
		t.Fatal("authorization reactivation must not replace an unchanged password hash")
	}

	var storedSession Session
	if err := database.First(&storedSession, "id = ?", session.ID).Error; err != nil {
		t.Fatalf("find session: %v", err)
	}
	if storedSession.RevokedAt == nil {
		t.Fatal("expected authorization reactivation to revoke existing sessions")
	}

	var storedResetToken PasswordResetToken
	if err := database.First(&storedResetToken, "id = ?", resetToken.ID).Error; err != nil {
		t.Fatalf("find password reset token: %v", err)
	}
	if storedResetToken.UsedAt == nil {
		t.Fatal("expected authorization reactivation to invalidate password reset tokens")
	}
}

func TestProvisionApplicationAdminRejectsLoginOwnedByAnotherActor(t *testing.T) {
	database := newProvisioningTestDatabase(t)
	first := ProvisionApplicationAdminConfig{
		ActorKey:         "first-admin",
		DisplayName:      "First Admin",
		Login:            "shared-admin@example.com",
		Password:         "First-Administrator-Password!",
		PasswordHashCost: bcrypt.MinCost,
	}
	if _, err := ProvisionApplicationAdmin(context.Background(), database, first); err != nil {
		t.Fatalf("provision first administrator: %v", err)
	}

	second := first
	second.ActorKey = "second-admin"
	second.DisplayName = "Second Admin"
	if _, err := ProvisionApplicationAdmin(context.Background(), database, second); err == nil {
		t.Fatal("expected login ownership conflict")
	}
	var actorCount int64
	if err := database.Model(&authz.AuthzActor{}).Where("actor_key = ?", second.ActorKey).Count(&actorCount).Error; err != nil {
		t.Fatalf("count conflicting actor: %v", err)
	}
	if actorCount != 0 {
		t.Fatalf("login conflict must not create an orphan authorization actor, got %d", actorCount)
	}
}

func newProvisioningTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := appdb.Open(filepath.Join(t.TempDir(), "provision-admin.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization tables: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication tables: %v", err)
	}
	return database
}

func findProvisionedAccount(t *testing.T, database *gorm.DB, login string) Account {
	t.Helper()
	var account Account
	if err := database.First(&account, "login = ? COLLATE NOCASE", login).Error; err != nil {
		t.Fatalf("find provisioned account: %v", err)
	}
	return account
}

func assertApplicationAdministrator(t *testing.T, database *gorm.DB, actorKey string) {
	t.Helper()
	actor, err := authz.NewGORMStore(database).FindActor(context.Background(), authz.ActorLookup{
		ActorID:  actorKey,
		TenantID: "default",
	})
	if err != nil {
		t.Fatalf("find provisioned authorization actor: %v", err)
	}
	if actor.Scope != authz.ActorScopeApplication {
		t.Fatalf("expected application scope, got %q", actor.Scope)
	}
	if err := authz.RequirePermission(actor, authz.PermissionAuthzManage); err != nil {
		t.Fatalf("expected authorization management permission: %v", err)
	}
}
