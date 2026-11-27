package authentication

import (
	"context"
	"errors"
	"strings"
	"testing"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
)

func loginChangeTestAudit(accountID string) authz.AuthorizationAuditEntry {
	return authz.AuthorizationAuditEntry{
		Actor: &authz.Actor{
			ID: "application-admin-test", RecordID: "application-admin-actor-test", AccountID: "application-admin-account-test",
			TenantID: authz.GlobalTenantScope, Scope: authz.ActorScopeApplication,
			Permissions: map[authz.Permission]struct{}{authz.PermissionAuthzManage: {}},
		},
		AccountID: "application-admin-account-test", TenantID: authz.GlobalTenantScope,
		Permission: authz.PermissionAuthzManage, Operation: "authentication.accounts.login.change",
		TargetType: "auth_user_account", TargetID: accountID,
		Decision: authz.AuditDecisionAuthorized, CorrelationID: "login-change-test",
		MetadataJSON: `{"oldLogin":"raining.csat.a@example.com","newLogin":"training.csat.a@example.com","updatePersonEmail":true}`,
	}
}

func TestChangeAuthenticationAccountLoginPreservesIdentityAndRevokesCredentials(t *testing.T) {
	database, _, service, _ := authenticationTestService(t)
	ctx := context.Background()
	oldLogin, newLogin := "raining.csat.a@example.com", "training.csat.a@example.com"
	personID := ensureAuthenticationTestPerson(t, database, oldLogin)
	account, err := service.CreateAccount(ctx, CreateAccountRequest{
		TenantID: appdb.DefaultTenantID, Login: oldLogin, TemporaryPassword: "Training-Test-Password-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	before, err := service.Login(ctx, LoginRequest{Login: oldLogin, Password: "Training-Test-Password-1"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	reset, err := service.IssuePasswordResetToken(ctx, account.ID)
	if err != nil {
		t.Fatal(err)
	}
	originalActor := account.ActorID
	changed, err := service.ChangeAccountLogin(ctx, account.ID, ChangeAccountLoginRequest{
		ExpectedLogin: oldLogin, NewLogin: " TRAINING.CSAT.A@example.com ", UpdatePersonEmail: true, Reason: "Approved correction of login typo",
	}, loginChangeTestAudit(account.ID))
	if err != nil {
		t.Fatalf("change login: %v", err)
	}
	if changed.ID != account.ID || changed.Login != newLogin || changed.GlobalPersonID != personID || changed.ActorID != originalActor || changed.GlobalPersonEmail != newLogin {
		t.Fatalf("login change must preserve canonical bindings: %+v", changed)
	}
	var membershipCount, accountCount, bindingCount int64
	if err := database.Model(&appdb.PersonTenantMembership{}).Where("person_id = ?", personID).Count(&membershipCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&Account{}).Where("id = ?", account.ID).Count(&accountCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Model(&AccountActor{}).Where("account_id = ?", account.ID).Count(&bindingCount).Error; err != nil {
		t.Fatal(err)
	}
	if membershipCount != 1 || accountCount != 1 || bindingCount != 1 {
		t.Fatalf("identity cardinality changed: memberships=%d accounts=%d bindings=%d", membershipCount, accountCount, bindingCount)
	}
	if _, err := service.ResolveSession(ctx, before.Token); !errors.Is(err, ErrAuthenticationRequired) {
		t.Fatalf("old session still valid: %v", err)
	}
	if _, err := service.ResetPassword(ctx, ResetPasswordRequest{Token: reset.Token, NewPassword: "Wrong-Password-2"}); !errors.Is(err, ErrResetTokenInvalid) {
		t.Fatalf("old reset token still valid: %v", err)
	}
	if _, err := service.Login(ctx, LoginRequest{Login: oldLogin, Password: "Training-Test-Password-1"}, "", ""); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("old login accepted: %v", err)
	}
	if _, err := service.Login(ctx, LoginRequest{Login: newLogin, Password: "Training-Test-Password-1"}, "", ""); err != nil {
		t.Fatalf("new login rejected: %v", err)
	}
	var audit authz.AuthzAuditLog
	if err := database.Where("operation = ? AND target_id = ?", "authentication.accounts.login.change", account.ID).First(&audit).Error; err != nil {
		t.Fatal(err)
	}
	if audit.AccountID != "application-admin-account-test" || audit.ActorRecordID != "application-admin-actor-test" || !strings.Contains(audit.MetadataJSON, oldLogin) || !strings.Contains(audit.MetadataJSON, newLogin) {
		t.Fatalf("missing or misattributed login change audit: %+v", audit)
	}
}

func TestChangeAuthenticationAccountLoginConflictsAndOptionalPersonEmail(t *testing.T) {
	database, _, service, _ := authenticationTestService(t)
	ctx := context.Background()
	oldLogin := "old-login@example.com"
	personID := ensureAuthenticationTestPerson(t, database, oldLogin)
	account, err := service.CreateAccount(ctx, CreateAccountRequest{TenantID: appdb.DefaultTenantID, Login: oldLogin, TemporaryPassword: "Some-Password-12345"})
	if err != nil {
		t.Fatal(err)
	}
	otherLogin := "other-login@example.com"
	ensureAuthenticationTestPerson(t, database, otherLogin)
	other, err := service.CreateAccount(ctx, CreateAccountRequest{TenantID: appdb.DefaultTenantID, Login: otherLogin, TemporaryPassword: "Other-Password-12345"})
	if err != nil {
		t.Fatal(err)
	}
	audit := loginChangeTestAudit(account.ID)
	for _, test := range []struct {
		name    string
		request ChangeAccountLoginRequest
		target  error
	}{
		{"duplicate Account", ChangeAccountLoginRequest{ExpectedLogin: oldLogin, NewLogin: other.Login, Reason: "Approved correction of login typo"}, ErrLoginAlreadyExists},
		{"stale original", ChangeAccountLoginRequest{ExpectedLogin: "previous@example.com", NewLogin: "fresh@example.com", Reason: "Approved correction of login typo"}, ErrLoginStale},
		{"other Person email", ChangeAccountLoginRequest{ExpectedLogin: oldLogin, NewLogin: "unlinked-person@example.com", Reason: "Approved correction of login typo"}, ErrLoginPersonEmailConflict},
	} {
		t.Run(test.name, func(t *testing.T) {
			if test.name == "other Person email" {
				ensureAuthenticationTestPerson(t, database, test.request.NewLogin)
			}
			if _, err := service.ChangeAccountLogin(ctx, account.ID, test.request, audit); !errors.Is(err, test.target) {
				t.Fatalf("expected %v, got %v", test.target, err)
			}
		})
	}
	if _, err := service.ChangeAccountLogin(ctx, account.ID, ChangeAccountLoginRequest{ExpectedLogin: oldLogin, NewLogin: "invalid login", Reason: "Approved correction of login typo"}, audit); err == nil {
		t.Fatal("invalid email accepted")
	}
	corrected := "different-login@example.com"
	changed, err := service.ChangeAccountLogin(ctx, account.ID, ChangeAccountLoginRequest{ExpectedLogin: oldLogin, NewLogin: corrected, UpdatePersonEmail: false, Reason: "Approved correction of login typo"}, audit)
	if err != nil {
		t.Fatal(err)
	}
	if changed.GlobalPersonEmail != oldLogin || changed.GlobalPersonID != personID {
		t.Fatalf("Person contact email unexpectedly changed: %+v", changed)
	}
	if _, err := service.ChangeAccountLogin(ctx, account.ID, ChangeAccountLoginRequest{ExpectedLogin: corrected, NewLogin: "last-login@example.com", UpdatePersonEmail: true, Reason: "Approved correction of login typo"}, audit); !errors.Is(err, ErrLoginPersonEmailMismatch) {
		t.Fatalf("must not overwrite Person email diverging from prior login: %v", err)
	}
	still, err := service.GetAccount(ctx, account.ID)
	if err != nil || still.Login != corrected {
		t.Fatalf("failed operation changed Account: %+v, %v", still, err)
	}
}

func TestChangeAuthenticationAccountLoginAuditFailureRollsBackEverything(t *testing.T) {
	database, _, service, _ := authenticationTestService(t)
	ctx := context.Background()
	oldLogin, newLogin := "audit-before@example.com", "audit-after@example.com"
	ensureAuthenticationTestPerson(t, database, oldLogin)
	account, err := service.CreateAccount(ctx, CreateAccountRequest{TenantID: appdb.DefaultTenantID, Login: oldLogin, TemporaryPassword: "Audit-Password-12345"})
	if err != nil {
		t.Fatal(err)
	}
	login, err := service.Login(ctx, LoginRequest{Login: oldLogin, Password: "Audit-Password-12345"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	reset, err := service.IssuePasswordResetToken(ctx, account.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Exec(`CREATE TRIGGER reject_login_change_audit
BEFORE INSERT ON authz_audit_logs
WHEN NEW.operation = 'authentication.accounts.login.change'
BEGIN SELECT RAISE(ABORT, 'injected login change audit failure'); END`).Error; err != nil {
		t.Fatal(err)
	}
	_, err = service.ChangeAccountLogin(ctx, account.ID, ChangeAccountLoginRequest{ExpectedLogin: oldLogin, NewLogin: newLogin, UpdatePersonEmail: true, Reason: "Approved correction of login typo"}, loginChangeTestAudit(account.ID))
	if err == nil || !strings.Contains(err.Error(), "injected login change audit failure") {
		t.Fatalf("audit failure did not abort operation: %v", err)
	}
	unchanged, err := service.GetAccount(ctx, account.ID)
	if err != nil || unchanged.Login != oldLogin || unchanged.GlobalPersonEmail != oldLogin {
		t.Fatalf("audit failure did not roll back identity: %+v / %v", unchanged, err)
	}
	if _, err := service.ResolveSession(ctx, login.Token); err != nil {
		t.Fatalf("audit failure revoked valid session: %v", err)
	}
	var pending PasswordResetToken
	if err := database.Where("account_id = ?", account.ID).First(&pending).Error; err != nil {
		t.Fatal(err)
	}
	if pending.UsedAt != nil || pending.TokenHash != hashToken(reset.Token) {
		t.Fatal("audit failure consumed reset token")
	}
}
