package authentication

import (
	"context"
	"crypto/rand"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func TestAuthenticationLoginSessionLogoutAndPasswordChange(t *testing.T) {
	database, repository, service, actor := authenticationTestService(t)
	mustChange := true
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: " Admin@Example.COM ", TemporaryPassword: "Temporary-Password-1", MustChangePassword: &mustChange,
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	if account.Login != "admin@example.com" || !account.MustChangePassword {
		t.Fatalf("unexpected created account: %#v", account)
	}

	var persisted Account
	if err := database.First(&persisted, "id = ?", account.ID).Error; err != nil {
		t.Fatalf("find account: %v", err)
	}
	if persisted.PasswordHash == "Temporary-Password-1" {
		t.Fatal("password must not be stored in plain text")
	}
	if bcrypt.CompareHashAndPassword([]byte(persisted.PasswordHash), []byte("Temporary-Password-1")) != nil {
		t.Fatal("stored password hash does not match the temporary password")
	}

	login, err := service.Login(context.Background(), LoginRequest{Login: "ADMIN@example.com", Password: "Temporary-Password-1"}, "test-agent", "127.0.0.1")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if login.Token == "" || login.Session.ActorKey != actor.ActorKey || login.Session.AccountID != account.ID {
		t.Fatalf("unexpected login result: %#v", login)
	}
	if login.Session.Login != "admin@example.com" {
		t.Fatalf("expected normalized login in session response, got %q", login.Session.Login)
	}
	var persistedSession Session
	if err := database.First(&persistedSession, "account_id = ?", account.ID).Error; err != nil {
		t.Fatalf("find persisted session: %v", err)
	}
	if persistedSession.TokenHash == login.Token || persistedSession.TokenHash != hashToken(login.Token) {
		t.Fatal("session must persist only the hash of the opaque cookie token")
	}

	current, err := service.ResolveSession(context.Background(), login.Token)
	if err != nil {
		t.Fatalf("resolve session: %v", err)
	}
	if current.Login != "admin@example.com" || !current.MustChangePassword {
		t.Fatalf("unexpected current session: %#v", current)
	}
	pendingReset, err := service.IssuePasswordResetToken(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("issue reset token before password change: %v", err)
	}

	if err := service.ChangePassword(context.Background(), login.Token, ChangePasswordRequest{
		CurrentPassword: "Temporary-Password-1",
		NewPassword:     "Replacement-Password-2",
	}); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if _, err := service.ResolveSession(context.Background(), login.Token); err != ErrAuthenticationRequired {
		t.Fatalf("expected password change to revoke session, got %v", err)
	}
	if _, err := service.ResetPassword(context.Background(), ResetPasswordRequest{
		Token: pendingReset.Token, NewPassword: "Unexpected-Password-3",
	}); err != ErrResetTokenInvalid {
		t.Fatalf("expected password change to invalidate pending reset tokens, got %v", err)
	}
	if _, err := service.Login(context.Background(), LoginRequest{Login: "admin@example.com", Password: "Temporary-Password-1"}, "", ""); err != ErrInvalidCredentials {
		t.Fatalf("expected old password rejection, got %v", err)
	}
	newLogin, err := service.Login(context.Background(), LoginRequest{Login: "admin@example.com", Password: "Replacement-Password-2"}, "", "")
	if err != nil {
		t.Fatalf("login with replacement password: %v", err)
	}
	if newLogin.Session.MustChangePassword {
		t.Fatal("password change should clear must-change-password")
	}
	if err := service.Logout(context.Background(), newLogin.Token); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, err := service.ResolveSession(context.Background(), newLogin.Token); err != ErrAuthenticationRequired {
		t.Fatalf("expected logout to revoke session, got %v", err)
	}

	_ = repository
}

func TestAuthenticationRejectsInactiveAccountAndActor(t *testing.T) {
	database, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "operator@example.com", TemporaryPassword: "Operator-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	activeLogin, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Operator-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("login before account deactivation: %v", err)
	}
	pendingReset, err := service.IssuePasswordResetToken(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("issue reset token before account deactivation: %v", err)
	}
	if _, err := service.SetAccountActive(context.Background(), account.ID, false); err != nil {
		t.Fatalf("deactivate account: %v", err)
	}
	if _, err := service.ResolveSession(context.Background(), activeLogin.Token); err != ErrAccountInactive {
		t.Fatalf("expected account deactivation to invalidate the active session, got %v", err)
	}
	if _, err := service.ResetPassword(context.Background(), ResetPasswordRequest{
		Token: pendingReset.Token, NewPassword: "Unexpected-Password-2",
	}); err != ErrResetTokenInvalid {
		t.Fatalf("expected account deactivation to invalidate pending reset tokens, got %v", err)
	}
	if _, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Operator-Password-1"}, "", ""); err != ErrInvalidCredentials {
		t.Fatalf("expected inactive account login rejection, got %v", err)
	}
	if _, err := service.SetAccountActive(context.Background(), account.ID, true); err != nil {
		t.Fatalf("reactivate account: %v", err)
	}
	reactivatedLogin, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Operator-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("expected reactivated account login to succeed: %v", err)
	}
	if err := service.Logout(context.Background(), reactivatedLogin.Token); err != nil {
		t.Fatalf("logout reactivated account: %v", err)
	}
	if err := database.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate actor: %v", err)
	}
	if _, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Operator-Password-1"}, "", ""); err != ErrInvalidCredentials {
		t.Fatalf("expected inactive actor login rejection, got %v", err)
	}
}

func TestAuthenticationRejectsResetTokenIssuanceForInactiveTargetAsValidation(t *testing.T) {
	database, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "inactive-reset-target@example.com", TemporaryPassword: "Inactive-Reset-Target-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	if _, err := service.SetAccountActive(context.Background(), account.ID, false); err != nil {
		t.Fatalf("deactivate account: %v", err)
	}
	_, err = service.IssuePasswordResetToken(context.Background(), account.ID)
	var validation *ValidationError
	if !errors.As(err, &validation) || validation.ValidationFields()["accountId"] == "" {
		t.Fatalf("expected inactive target account validation, got %v", err)
	}

	if _, err := service.SetAccountActive(context.Background(), account.ID, true); err != nil {
		t.Fatalf("reactivate account: %v", err)
	}
	if err := database.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate actor: %v", err)
	}
	_, err = service.IssuePasswordResetToken(context.Background(), account.ID)
	validation = nil
	if !errors.As(err, &validation) || validation.ValidationFields()["accountId"] == "" {
		t.Fatalf("expected inactive target actor validation, got %v", err)
	}
}

func TestAuthenticationPasswordResetTokenIsOneTimeAndRevokesSessions(t *testing.T) {
	database, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "reset@example.com", TemporaryPassword: "Original-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	login, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Original-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	reset, err := service.IssuePasswordResetToken(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("issue password reset token: %v", err)
	}
	if reset.Token == "" {
		t.Fatal("expected raw reset token to be returned once")
	}
	if reset.AccountID != account.ID || reset.Login != account.Login {
		t.Fatalf("unexpected reset token identity: %#v", reset)
	}
	var persistedToken PasswordResetToken
	if err := database.First(&persistedToken, "account_id = ?", account.ID).Error; err != nil {
		t.Fatalf("find persisted reset token: %v", err)
	}
	if persistedToken.TokenHash == reset.Token || persistedToken.TokenHash != hashToken(reset.Token) {
		t.Fatal("password reset must persist only the hash of the raw token")
	}
	resetResult, err := service.ResetPassword(context.Background(), ResetPasswordRequest{Token: reset.Token, NewPassword: "%3oU1^Z!Gf6WEj8u"})
	if err != nil {
		t.Fatalf("reset password: %v", err)
	}
	if resetResult.AccountID != account.ID || resetResult.Login != account.Login || resetResult.PasswordChangedAt.IsZero() {
		t.Fatalf("unexpected reset result: %#v", resetResult)
	}
	if _, err := service.ResolveSession(context.Background(), login.Token); err != ErrAuthenticationRequired {
		t.Fatalf("expected reset to revoke existing sessions, got %v", err)
	}
	if _, err := service.ResetPassword(context.Background(), ResetPasswordRequest{Token: reset.Token, NewPassword: "Another-Password-3"}); err != ErrResetTokenInvalid {
		t.Fatalf("expected reset token to be single-use, got %v", err)
	}
	if _, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "%3oU1^Z!Gf6WEj8u"}, "", ""); err != nil {
		t.Fatalf("login with reset password: %v", err)
	}
}

func TestAuthenticationSessionExpires(t *testing.T) {
	database, err := appdb.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := appdb.AutoMigrate(database); err != nil {
		t.Fatalf("migrate core database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication database: %v", err)
	}
	actor := createAuthenticationTestActor(t, database)
	now := time.Date(2026, 7, 21, 10, 0, 0, 0, time.UTC)
	service := NewService(NewRepository(database), ServiceConfig{
		SessionTTL: 5 * time.Minute, PasswordResetTTL: 10 * time.Minute, PasswordHashCost: bcrypt.MinCost,
		Clock: func() time.Time { return now }, RandomReader: rand.Reader,
	})
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{ActorID: actor.ID, Login: "expiry@example.com", TemporaryPassword: "Expiry-Password-1"})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	login, err := service.Login(context.Background(), LoginRequest{Login: account.Login, Password: "Expiry-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	now = now.Add(6 * time.Minute)
	if _, err := service.ResolveSession(context.Background(), login.Token); err != ErrSessionExpired {
		t.Fatalf("expected expired session, got %v", err)
	}
}

func authenticationTestService(t *testing.T) (*gorm.DB, *GORMRepository, Service, authz.AuthzActor) {
	t.Helper()
	database, err := appdb.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := appdb.AutoMigrate(database); err != nil {
		t.Fatalf("migrate core database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication database: %v", err)
	}
	actor := createAuthenticationTestActor(t, database)
	repository := NewRepository(database)
	service := NewService(repository, ServiceConfig{
		SessionTTL: time.Hour, PasswordResetTTL: 30 * time.Minute, PasswordHashCost: bcrypt.MinCost, RandomReader: rand.Reader,
	})
	return database, repository, service, actor
}

func createAuthenticationTestActor(t *testing.T, database *gorm.DB) authz.AuthzActor {
	t.Helper()
	now := time.Now().UTC()
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization catalog: %v", err)
	}
	tenant := appdb.Tenant{
		BaseModel: appdb.BaseModel{ID: appdb.DefaultTenantID, CreatedAt: now, UpdatedAt: now},
		Code:      "DEFAULT",
		Name:      "Default Tenant",
		Active:    true,
	}
	if err := database.Where("id = ?", tenant.ID).FirstOrCreate(&tenant).Error; err != nil {
		t.Fatalf("create default tenant: %v", err)
	}
	actor := authz.AuthzActor{
		ID: "auth-test-actor", ActorKey: "auth-test-actor@example.com", DisplayName: "Authentication Test Actor",
		Active: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create authorization actor: %v", err)
	}
	if err := authz.GrantRole(database, actor.ID, authz.RoleExpenseOperator, tenant.ID); err != nil {
		t.Fatalf("grant test actor tenant access: %v", err)
	}
	return actor
}

func TestAuthenticationRejectsAccountForActorWithoutActiveTenantAccess(t *testing.T) {
	database, _, service, _ := authenticationTestService(t)
	now := time.Now().UTC()
	actor := authz.AuthzActor{
		ID:          "auth-test-actor-without-access",
		ActorKey:    "auth-test-actor-without-access@example.com",
		DisplayName: "Actor Without Access",
		Active:      true,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create actor without access: %v", err)
	}

	_, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "no-access@example.com", TemporaryPassword: "No-Access-Password-1",
	})
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if got := validation.ValidationFields()["actorId"]; got != "Authorization actor must have at least one active role grant for an active tenant" {
		t.Fatalf("unexpected actor validation: %q", got)
	}
}

func TestAuthenticationRejectsDuplicateLoginAndActorAccount(t *testing.T) {
	database, _, service, actor := authenticationTestService(t)
	if _, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "duplicate@example.com", TemporaryPassword: "Duplicate-Password-1",
	}); err != nil {
		t.Fatalf("create initial account: %v", err)
	}
	now := time.Now().UTC()
	secondActor := authz.AuthzActor{
		ID: "auth-test-actor-two", ActorKey: "auth-test-actor-two@example.com", DisplayName: "Second Authentication Actor",
		Active: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&secondActor).Error; err != nil {
		t.Fatalf("create second actor: %v", err)
	}
	if err := authz.GrantRole(database, secondActor.ID, authz.RoleExpenseOperator, appdb.DefaultTenantID); err != nil {
		t.Fatalf("grant second actor tenant access: %v", err)
	}
	if _, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: secondActor.ID, Login: "DUPLICATE@example.com", TemporaryPassword: "Duplicate-Password-2",
	}); err != ErrLoginAlreadyExists {
		t.Fatalf("expected case-insensitive duplicate login rejection, got %v", err)
	}
	if _, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "other@example.com", TemporaryPassword: "Duplicate-Password-3",
	}); err != ErrActorAlreadyLinked {
		t.Fatalf("expected one-account-per-actor rejection, got %v", err)
	}
}

func TestAuthenticationRejectsPasswordBeyondBcryptInputLimit(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	password := strings.Repeat("a", 73)
	_, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "long-password@example.com", TemporaryPassword: password,
	})
	var validation *ValidationError
	if !errors.As(err, &validation) || validation.ValidationFields()["temporaryPassword"] == "" {
		t.Fatalf("expected bcrypt password-length validation, got %v", err)
	}
}

func TestAuthenticationRejectsExpiredPasswordResetToken(t *testing.T) {
	database, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "expired-reset@example.com", TemporaryPassword: "Expired-Reset-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	reset, err := service.IssuePasswordResetToken(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("issue reset token: %v", err)
	}
	if err := database.Model(&PasswordResetToken{}).
		Where("account_id = ?", account.ID).
		Update("expires_at", time.Now().UTC().Add(-time.Minute)).Error; err != nil {
		t.Fatalf("expire reset token: %v", err)
	}
	if _, err := service.ResetPassword(context.Background(), ResetPasswordRequest{
		Token: reset.Token, NewPassword: "Replacement-Password-2",
	}); err != ErrResetTokenExpired {
		t.Fatalf("expected expired reset token rejection, got %v", err)
	}
}

func TestAuthenticationAccountCanOptOutOfTemporaryPasswordChange(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	mustChange := false
	account, err := service.CreateAccount(context.Background(), CreateAccountRequest{
		ActorID: actor.ID, Login: "permanent@example.com", TemporaryPassword: "Permanent-Password-1", MustChangePassword: &mustChange,
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	if account.MustChangePassword {
		t.Fatal("explicit mustChangePassword=false must be persisted")
	}
}
