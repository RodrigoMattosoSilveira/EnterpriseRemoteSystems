package main

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func localDeveloperTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatal(err)
	}
	for _, seed := range []func(*gorm.DB) error{
		dbpkg.AutoMigrate,
		authz.AutoMigrate,
		authentication.AutoMigrate,
		dbpkg.SeedReferenceData,
		authz.SeedAuthorizationCatalog,
	} {
		if err := seed(database); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		sqlDB, err := database.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return database
}

func localDeveloperTestInput() localDeveloperFixtureInput {
	input := localDeveloperFixtureInput{
		DatabasePath:                         "/tmp/local-developer-fixture-test.db",
		Credentials:                          make(map[string]string),
		AllowFixtureCredentialReconciliation: true,
	}
	for i, login := range localDeveloperLogins() {
		input.Credentials[login] = fmt.Sprintf("1Password-unique-local-credential-%02d!", i)
	}
	return input
}

func localDeveloperFindAccount(t *testing.T, database *gorm.DB, login string) authentication.Account {
	t.Helper()
	var account authentication.Account
	if err := database.Where("login = ?", login).First(&account).Error; err != nil {
		t.Fatal(err)
	}
	return account
}

func TestLocalDeveloperFixturesRejectsProductionAndInvalidCredentials(t *testing.T) {
	for _, env := range []string{"production", "prd", "development", "dev", "test", "testing", ""} {
		if localDeveloperEnvironmentAllowed(env) {
			t.Fatalf("%q allowed", env)
		}
	}
	if !localDeveloperEnvironmentAllowed("local") {
		t.Fatal("local refused")
	}
	input := localDeveloperTestInput()
	if err := validateLocalDeveloperInput(input); err != nil {
		t.Fatal(err)
	}
	input.AllowFixtureCredentialReconciliation = false
	if err := validateLocalDeveloperInput(input); err == nil {
		t.Fatal("missing consent accepted")
	}
	input = localDeveloperTestInput()
	input.Credentials[e2eMultiTenantPersonLogin] = input.Credentials[localApplicationAdminLogin]
	if err := validateLocalDeveloperInput(input); err == nil {
		t.Fatal("shared passwords accepted")
	}
	input = localDeveloperTestInput()
	delete(input.Credentials, e2eMultiTenantPersonLogin)
	if err := validateLocalDeveloperInput(input); err == nil {
		t.Fatal("missing MULTI accepted")
	}
}

func TestLocalDeveloperFixturesFreshIdempotentAndRoleBoundaries(t *testing.T) {
	db := localDeveloperTestDatabase(t)
	input := localDeveloperTestInput()
	snapshots := make(map[string]string)
	for pass := 0; pass < 2; pass++ {
		if err := ensureLocalDeveloperFixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
			t.Fatalf("install pass %d: %v", pass, err)
		}
		for _, login := range localDeveloperLogins() {
			account := localDeveloperFindAccount(t, db, login)
			if !account.Active || account.SecuritySuspended || bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(input.Credentials[login])) != nil {
				t.Errorf("cannot authenticate %s after pass %d", login, pass)
			}
			if old, ok := snapshots[login]; ok && old != account.PasswordHash {
				t.Errorf("rerun unexpectedly replaced password hash for %s", login)
			}
			snapshots[login] = account.PasswordHash
			var count int64
			if err := db.Model(&authentication.Account{}).Where("LOWER(login) = LOWER(?)", login).Count(&count).Error; err != nil || count != 1 {
				t.Errorf("duplicate account for %s: count=%d err=%v", login, count, err)
			}
		}
	}
	admin := localDeveloperFindAccount(t, db, localApplicationAdminLogin)
	var globalBindings, tenantBindings, personBindings int64
	if err := db.Model(&authentication.AccountActor{}).Where("account_id = ? AND scope_type = ?", admin.ID, authentication.AccountActorScopeGlobal).Count(&globalBindings).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&authentication.AccountActor{}).Where("account_id = ? AND scope_type = ?", admin.ID, authentication.AccountActorScopeTenant).Count(&tenantBindings).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&authentication.AccountPerson{}).Where("account_id = ?", admin.ID).Count(&personBindings).Error; err != nil {
		t.Fatal(err)
	}
	if globalBindings != 1 || tenantBindings != 0 || personBindings != 0 {
		t.Fatalf("GLOBAL administrator isolation: %d/%d/%d", globalBindings, tenantBindings, personBindings)
	}
	for _, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
		var bindings []authentication.AccountActor
		account := localDeveloperFindAccount(t, db, spec.Login)
		if err := db.Where("account_id = ?", account.ID).Find(&bindings).Error; err != nil {
			t.Fatal(err)
		}
		if len(bindings) != len(spec.Tenants) {
			t.Errorf("%s: wrong binding count %d", spec.Login, len(bindings))
		}
		for _, binding := range bindings {
			if binding.TenantID == nil || binding.ScopeType != authentication.AccountActorScopeTenant {
				t.Errorf("%s: invalid tenant scope", spec.Login)
			}
		}
	}
	multi := localDeveloperFindAccount(t, db, e2eMultiTenantPersonLogin)
	var multiBindings int64
	if err := db.Model(&authentication.AccountActor{}).Where("account_id = ? AND scope_type = ?", multi.ID, authentication.AccountActorScopeTenant).Count(&multiBindings).Error; err != nil {
		t.Fatal(err)
	}
	if multiBindings != 2 {
		t.Errorf("MULTI requires two dedicated Tenant Actors, got %d", multiBindings)
	}
}

func TestLocalDeveloperFixturesRepairsLegacyTenantAndMultiPasswordsOnlyWithConsent(t *testing.T) {
	db := localDeveloperTestDatabase(t)
	const legacyPassword = "old-E2E-fixture-password-that-is-not-in-1Password"
	legacyFixtures := []e2eTenantAdminFixture{
		{TenantID: byte352TenantA, TenantCode: "E2EAUTHZADMIN", TenantName: "E2E Authorization Admin Boundary", ActorKey: "e2e-authz-admin-tenant-admin", Login: byte352Administrators[0].Login, Stem: byte352Administrators[0].Stem},
		{TenantID: byte352TenantB, TenantCode: "E2EISOLATION", TenantName: "E2E Operational Isolation", ActorKey: "e2e-isolation-tenant-admin", Login: byte352Administrators[1].Login, Stem: byte352Administrators[1].Stem},
	}
	for _, fixture := range legacyFixtures {
		if err := ensureE2ETenantAdministrator(context.Background(), db, fixture, legacyPassword, bcrypt.MinCost); err != nil {
			t.Fatal(err)
		}
	}
	if err := ensureE2EMultiTenantPerson(context.Background(), db, legacyPassword, bcrypt.MinCost); err != nil {
		t.Fatal(err)
	}
	input := localDeveloperTestInput()
	if err := ensureLocalDeveloperFixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
		t.Fatal(err)
	}
	for _, login := range []string{byte352Administrators[0].Login, byte352Administrators[1].Login, e2eMultiTenantPersonLogin} {
		account := localDeveloperFindAccount(t, db, login)
		if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(input.Credentials[login])) != nil {
			t.Errorf("legacy credential not reconciled for %s", login)
		}
	}
}

func TestLocalDeveloperFixturesRollbackOnUnexpectedTenantAndPreservesOtherAccounts(t *testing.T) {
	db := localDeveloperTestDatabase(t)
	nowAccount := authentication.Account{ID: "unrelated-person-account", Login: "unrelated.person@example.com", PasswordHash: "untouched-hash", Active: true}
	if err := db.Create(&nowAccount).Error; err != nil {
		t.Fatal(err)
	}
	input := localDeveloperTestInput()
	if err := db.Create(&dbpkg.Tenant{BaseModel: dbpkg.BaseModel{ID: byte352TenantB}, Code: "WRONG", Name: "Unexpected existing Tenant", Active: true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := ensureLocalDeveloperFixtures(context.Background(), db, input, bcrypt.MinCost); err == nil {
		t.Fatal("wrong tenant accepted")
	}
	var accounts int64
	if err := db.Model(&authentication.Account{}).Count(&accounts).Error; err != nil {
		t.Fatal(err)
	}
	if accounts != 1 {
		t.Fatalf("rollback should retain only unrelated Account, got %d", accounts)
	}
	preserved := localDeveloperFindAccount(t, db, nowAccount.Login)
	if preserved.PasswordHash != nowAccount.PasswordHash {
		t.Fatal("unrelated hash modified")
	}
}

func TestLocalDeveloperFixturesExplicitReconciliationRevokesOldSessions(t *testing.T) {
	db := localDeveloperTestDatabase(t)
	input := localDeveloperTestInput()
	if err := ensureLocalDeveloperFixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
		t.Fatal(err)
	}
	account := localDeveloperFindAccount(t, db, byte352Identities[0].Login)
	now := time.Now().UTC()
	session := authentication.Session{ID: "local-fixture-test-session", AccountID: account.ID, TokenHash: "synthetic-old-session-token", ExpiresAt: now.Add(time.Hour), LastSeenAt: now, CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&session).Error; err != nil {
		t.Fatal(err)
	}
	reset := authentication.PasswordResetToken{ID: "local-fixture-test-reset", AccountID: account.ID, TokenHash: "synthetic-reset-token", ExpiresAt: now.Add(time.Hour), CreatedAt: now}
	if err := db.Create(&reset).Error; err != nil {
		t.Fatal(err)
	}
	// A credential rotation is never a silent side effect of backend startup:
	// the only authorized path is a second explicit LOCAL installer invocation.
	modified := localDeveloperTestInput()
	modified.Credentials[byte352Identities[0].Login] = "reconciled-unique-credential-2026!"
	if err := ensureLocalDeveloperFixtures(context.Background(), db, modified, bcrypt.MinCost); err != nil {
		t.Fatal(err)
	}
	updated := localDeveloperFindAccount(t, db, byte352Identities[0].Login)
	if updated.PasswordHash == account.PasswordHash {
		t.Fatal("explicit credential reconciliation did not update hash")
	}
	if bcrypt.CompareHashAndPassword([]byte(updated.PasswordHash), []byte(modified.Credentials[byte352Identities[0].Login])) != nil {
		t.Fatal("new password not set")
	}
	var sessionAfter authentication.Session
	if err := db.First(&sessionAfter, "id = ?", session.ID).Error; err != nil {
		t.Fatal(err)
	}
	if sessionAfter.RevokedAt == nil {
		t.Fatal("old session not revoked")
	}
	var resetAfter authentication.PasswordResetToken
	if err := db.First(&resetAfter, "id = ?", reset.ID).Error; err != nil {
		t.Fatal(err)
	}
	if resetAfter.UsedAt == nil {
		t.Fatal("old reset token still usable")
	}
}
