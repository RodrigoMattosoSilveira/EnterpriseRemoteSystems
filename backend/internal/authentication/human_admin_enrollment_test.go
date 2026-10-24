package authentication

import (
	"context"
	"strings"
	"testing"

	"enterpriseremotesystems/backend/internal/authz"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func humanAdminInput() HumanAdministratorEnrollment {
	return HumanAdministratorEnrollment{Administrators: []HumanAdministrator{
		{ActorKey: "human-admin-a", DisplayName: "Human Administrator A", Login: "Human.A@Example.com", Password: "Human-A-Initial-Password!"},
		{ActorKey: "human-admin-b", DisplayName: "Human Administrator B", Login: "human.b@example.com", Password: "Human-B-Initial-Password!"},
	}}
}

func humanAdminEvidence() HumanAdministratorEnrollmentEvidence {
	return HumanAdministratorEnrollmentEvidence{ApprovalReference: "CHG-3367", OperatorReference: "ops-1", BackupEvidenceReference: "BKP-20261024", PasswordHashCost: bcrypt.MinCost}
}

func humanAdminDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	database := newProvisioningTestDatabase(t)
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed existing migrated authorization catalog: %v", err)
	}
	return database
}

func countRows(t *testing.T, database *gorm.DB, table string) int64 {
	t.Helper()
	var count int64
	if err := database.Table(table).Count(&count).Error; err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return count
}

func TestEnrollTwoHumanApplicationAdministratorsAtomicCanonicalAndCreateOnly(t *testing.T) {
	database := humanAdminDatabase(t)
	// Pre-existing automation account remains unchanged, including password and grant.
	prior, err := ProvisionApplicationAdmin(context.Background(), database, ProvisionApplicationAdminConfig{
		ActorKey: "automation-admin", DisplayName: "Existing automation", Login: "automation@example.com", Password: "Automation-Password-1!", PasswordHashCost: bcrypt.MinCost,
	})
	if err != nil {
		t.Fatalf("create existing administrator: %v", err)
	}
	previous := findProvisionedAccount(t, database, "automation@example.com")
	previousGrants := countRows(t, database, "authz_actor_role_grants")

	result, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, humanAdminInput(), humanAdminEvidence())
	if err != nil {
		t.Fatalf("enroll two humans: %v", err)
	}
	if len(result) != 2 || result[0].AccountID == result[1].AccountID || result[0].ActorID == result[1].ActorID {
		t.Fatalf("expected two independently bound administrators: %#v", result)
	}
	for i, row := range result {
		account := findProvisionedAccount(t, database, row.Login)
		if !account.Active || account.SecuritySuspended || !account.MustChangePassword || account.PasswordChangedAt != nil {
			t.Fatalf("human %d must change initial password at first login", i+1)
		}
		if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(humanAdminInput().Administrators[i].Password)) != nil {
			t.Fatalf("initial password for human %d invalid", i+1)
		}
		var binding AccountActor
		if err := database.Where("actor_id=?", row.ActorID).First(&binding).Error; err != nil {
			t.Fatal(err)
		}
		if binding.AccountID != account.ID || binding.ScopeType != AccountActorScopeGlobal || binding.TenantID != nil || binding.MembershipID != nil {
			t.Fatalf("invalid canonical GLOBAL binding: %#v", binding)
		}
		assertApplicationAdministrator(t, database, row.ActorKey)
		var audit authz.AuthzAuditLog
		if err := database.Where("operation=? AND target_id=?", "authentication.human_admins.offline_enroll", account.ID).First(&audit).Error; err != nil {
			t.Fatal(err)
		}
		if audit.Decision != authz.AuditDecisionAuthorized || !strings.Contains(audit.Reason, "CHG-3367") || strings.Contains(audit.Reason, "Human-A-Initial-Password!") {
			t.Fatalf("bad audit attribution")
		}
	}
	if countRows(t, database, "authz_actor_role_grants") != previousGrants+2 {
		t.Fatal("two independent grants required")
	}
	after := findProvisionedAccount(t, database, "automation@example.com")
	if after.ID != prior.AccountID || after.PasswordHash != previous.PasswordHash {
		t.Fatal("existing automation identity modified")
	}
	assertApplicationAdministrator(t, database, "automation-admin")

	if _, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, humanAdminInput(), humanAdminEvidence()); err == nil {
		t.Fatal("replay must be rejected")
	}
	if countRows(t, database, "auth_user_accounts") != 3 || countRows(t, database, "authz_audit_logs") != 2 {
		t.Fatal("replay must not mutate state")
	}
}

func TestEnrollTwoHumanApplicationAdministratorsRejectsCollisionsBeforeWrites(t *testing.T) {
	for _, tc := range []struct {
		name  string
		alter func(*HumanAdministratorEnrollment)
	}{
		{"same login", func(i *HumanAdministratorEnrollment) { i.Administrators[1].Login = "human.a@example.com" }},
		{"same actor", func(i *HumanAdministratorEnrollment) { i.Administrators[1].ActorKey = "HUMAN-ADMIN-A" }},
		{"same password", func(i *HumanAdministratorEnrollment) { i.Administrators[1].Password = i.Administrators[0].Password }},
		{"invalid password", func(i *HumanAdministratorEnrollment) { i.Administrators[1].Password = "short" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			database := humanAdminDatabase(t)
			input := humanAdminInput()
			tc.alter(&input)
			if _, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, input, humanAdminEvidence()); err == nil {
				t.Fatal("expected refusal")
			}
			if countRows(t, database, "auth_user_accounts") != 0 || countRows(t, database, "authz_actors") != 0 || countRows(t, database, "authz_audit_logs") != 0 {
				t.Fatal("validation must not mutate existing database")
			}
		})
	}
}

func TestEnrollTwoHumanApplicationAdministratorsRejectsExistingAccountOrKey(t *testing.T) {
	database := humanAdminDatabase(t)
	_, err := ProvisionApplicationAdmin(context.Background(), database, ProvisionApplicationAdminConfig{ActorKey: "existing", DisplayName: "Pre-existing", Login: "existing@example.com", Password: "Existing-Password-123", PasswordHashCost: bcrypt.MinCost})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		change func(*HumanAdministratorEnrollment)
	}{
		{"existing login", func(i *HumanAdministratorEnrollment) { i.Administrators[1].Login = "Existing@Example.com" }},
		{"existing actor key", func(i *HumanAdministratorEnrollment) { i.Administrators[1].ActorKey = "EXISTING" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := countRows(t, database, "auth_user_accounts")
			input := humanAdminInput()
			tc.change(&input)
			if _, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, input, humanAdminEvidence()); err == nil {
				t.Fatal("collision must fail")
			}
			if countRows(t, database, "auth_user_accounts") != before {
				t.Fatal("collision created partial identity")
			}
		})
	}
}

func TestEnrollTwoHumanApplicationAdministratorsRollsBackOnSecondAuditFailure(t *testing.T) {
	database := humanAdminDatabase(t)
	err := database.Exec(`CREATE TRIGGER reject_second_human_admin_audit BEFORE INSERT ON authz_audit_logs
        WHEN NEW.operation = 'authentication.human_admins.offline_enroll'
        AND (SELECT count(*) FROM authz_audit_logs WHERE operation='authentication.human_admins.offline_enroll') >= 1
        BEGIN SELECT RAISE(ABORT, 'deliberate second audit failure'); END`).Error
	if err != nil {
		t.Fatal(err)
	}
	if _, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, humanAdminInput(), humanAdminEvidence()); err == nil {
		t.Fatal("injected failure must refuse enrollment")
	}
	for _, table := range []string{"auth_user_accounts", "auth_account_actors", "authz_actors", "authz_actor_role_grants", "authz_audit_logs"} {
		if countRows(t, database, table) != 0 {
			t.Fatalf("all-or-nothing rollback failed for %s", table)
		}
	}
}

func TestEnrollTwoHumanApplicationAdministratorsRequiresMigratedCatalogAndImmutableAudit(t *testing.T) {
	t.Run("missing role", func(t *testing.T) {
		database := newProvisioningTestDatabase(t)
		if _, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, humanAdminInput(), humanAdminEvidence()); err == nil {
			t.Fatal("unseeded authorization catalog must be refused")
		}
	})
	t.Run("missing immutability trigger", func(t *testing.T) {
		database := humanAdminDatabase(t)
		if err := database.Exec("DROP TRIGGER trg_authz_audit_logs_no_delete").Error; err != nil {
			t.Fatal(err)
		}
		if _, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, humanAdminInput(), humanAdminEvidence()); err == nil {
			t.Fatal("missing append-only constraint must be refused")
		}
	})
}

func TestEnrolledHumanAdministratorsIndependentLoginAndMutualPasswordRecovery(t *testing.T) {
	database := humanAdminDatabase(t)
	result, err := EnrollTwoHumanApplicationAdministrators(context.Background(), database, humanAdminInput(), humanAdminEvidence())
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(NewRepository(database), ServiceConfig{PasswordHashCost: bcrypt.MinCost})
	context := context.Background()
	logins := make([]LoginResult, 2)
	for i, row := range result {
		login, err := service.Login(context, LoginRequest{Login: row.Login, Password: humanAdminInput().Administrators[i].Password}, "human-browser", "127.0.0.1")
		if err != nil {
			t.Fatalf("independent human %d login failed: %v", i+1, err)
		}
		if !login.Session.MustChangePassword || login.Session.AccountID != row.AccountID {
			t.Fatalf("new human %d must be required to change password", i+1)
		}
		logins[i] = login
	}
	for i, row := range result {
		reset, err := service.IssuePasswordResetToken(context, row.AccountID)
		if err != nil {
			t.Fatalf("mutual recovery token %d: %v", i+1, err)
		}
		newPassword := "Recovered-Human-A-Password!"
		if i == 1 {
			newPassword = "Recovered-Human-B-Password!"
		}
		if _, err := service.ResetPassword(context, ResetPasswordRequest{Token: reset.Token, NewPassword: newPassword}); err != nil {
			t.Fatalf("mutual recovery %d: %v", i+1, err)
		}
		if _, err := service.ResolveSession(context, logins[i].Token); err != ErrAuthenticationRequired {
			t.Fatalf("recovery must revoke human %d session: %v", i+1, err)
		}
		if _, err := service.ResetPassword(context, ResetPasswordRequest{Token: reset.Token, NewPassword: "Another-Replacement-Password!"}); err != ErrResetTokenInvalid {
			t.Fatalf("recovery token must be single use: %v", err)
		}
		var consumeAudit authz.AuthzAuditLog
		if err := database.Where("operation = ? AND target_id = ?", "authentication.password_reset_tokens.consume", row.AccountID).First(&consumeAudit).Error; err != nil {
			t.Fatalf("recovery consumption must have append-only target attribution: %v", err)
		}
		if consumeAudit.ActorID != "password-reset-token-holder" || consumeAudit.Decision != authz.AuditDecisionAuthorized {
			t.Fatalf("recovery consumption must not invent an authenticated actor: %#v", consumeAudit)
		}
		login, err := service.Login(context, LoginRequest{Login: row.Login, Password: newPassword}, "", "")
		if err != nil || login.Session.MustChangePassword {
			t.Fatalf("human %d must login with recovered password: %v", i+1, err)
		}
	}
}
