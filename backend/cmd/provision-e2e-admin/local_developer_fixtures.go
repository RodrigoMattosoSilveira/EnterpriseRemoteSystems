package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// localDeveloperFixtureInput is deliberately a separate mode of the existing
// provisioner, not a second identity/authorization implementation. Passwords
// are supplied once on stdin; never stored in a plaintext fixture file.
type localDeveloperFixtureInput struct {
	DatabasePath string            `json:"databasePath"`
	Credentials  map[string]string `json:"credentials"`
	// Explicit operator consent covers only the eleven known fixture accounts.
	AllowFixtureCredentialReconciliation bool `json:"allowFixtureCredentialReconciliation"`
}

const localApplicationAdminLogin = "e2e-admin-local@enterpriseremotesystems.com"

func localDeveloperLogins() []string {
	logins := []string{localApplicationAdminLogin}
	for _, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
		logins = append(logins, spec.Login)
	}
	return append(logins, e2eMultiTenantPersonLogin)
}

func localDeveloperEnvironmentAllowed(value string) bool {
	return strings.TrimSpace(strings.ToLower(value)) == "local"
}

func validateLocalDeveloperInput(input localDeveloperFixtureInput) error {
	if !filepath.IsAbs(input.DatabasePath) || input.DatabasePath == string(filepath.Separator) {
		return fmt.Errorf("an absolute LOCAL database path is required")
	}
	if !input.AllowFixtureCredentialReconciliation {
		return fmt.Errorf("explicit LOCAL fixture password reconciliation consent is required")
	}
	logins := localDeveloperLogins()
	if len(input.Credentials) != len(logins) {
		return fmt.Errorf("exactly %d distinct LOCAL fixture credentials are required", len(logins))
	}
	seen := make(map[string]bool)
	for _, login := range logins {
		pw, ok := input.Credentials[login]
		if !ok || len(pw) < 16 || strings.TrimSpace(pw) != pw || strings.ContainsAny(pw, "\r\n") {
			return fmt.Errorf("missing/invalid credential for %s (minimum 16 characters)", login)
		}
		if seen[pw] {
			return fmt.Errorf("LOCAL fixture passwords must be unique")
		}
		seen[pw] = true
	}
	return nil
}

func runLocalDeveloperFixtures() {
	if !localDeveloperEnvironmentAllowed(os.Getenv("APP_ENV")) {
		logLocalFixtureFatal("LOCAL fixture installation requires APP_ENV=local; deployed environments are forbidden")
	}
	if os.Getenv("ERS_RESET_DATABASE") == "true" {
		logLocalFixtureFatal("ERS_RESET_DATABASE=true is forbidden for LOCAL fixture installation")
	}
	var input localDeveloperFixtureInput
	decoder := json.NewDecoder(io.LimitReader(os.Stdin, 65536))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		logLocalFixtureFatal("input: %v", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		logLocalFixtureFatal("exactly one JSON input object is required")
	}
	if err := validateLocalDeveloperInput(input); err != nil {
		logLocalFixtureFatal("%v", err)
	}
	dbPath := os.Getenv("DB_PATH")
	if !filepath.IsAbs(dbPath) || filepath.Clean(dbPath) != filepath.Clean(input.DatabasePath) {
		logLocalFixtureFatal("DB_PATH and databasePath must identify the identical absolute LOCAL database")
	}
	stat, err := os.Stat(dbPath)
	if err != nil || !stat.Mode().IsRegular() {
		logLocalFixtureFatal("an existing migrated LOCAL database is required")
	}
	database, err := dbpkg.Open(dbPath)
	if err != nil {
		logLocalFixtureFatal("open LOCAL database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		logLocalFixtureFatal("database handle: %v", err)
	}
	defer sqlDB.Close()
	if err := ensureLocalDeveloperFixtures(context.Background(), database, input, positiveInt(os.Getenv("AUTH_PASSWORD_HASH_COST"), 12)); err != nil {
		logLocalFixtureFatal("transaction rolled back: %v", err)
	}
	fmt.Printf("RESULT: LOCAL developer fixtures 11 PASS / 0 FAIL; two fixture Tenants + dedicated MULTI Tenants; passwords not displayed\n")
}

func logLocalFixtureFatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "FAIL: LOCAL developer fixture installation: "+format+"\n", args...)
	os.Exit(1)
}

func ensureLocalDeveloperFixtures(ctx context.Context, database *gorm.DB, input localDeveloperFixtureInput, cost int) error {
	if database == nil {
		return fmt.Errorf("database is required")
	}
	if err := validateLocalDeveloperInput(input); err != nil {
		return err
	}
	if cost < bcrypt.MinCost || cost > bcrypt.MaxCost {
		return fmt.Errorf("invalid bcrypt cost")
	}

	return database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := authz.SeedAuthorizationCatalog(tx); err != nil {
			return fmt.Errorf("authorization catalog: %w", err)
		}
		if err := dbpkg.SeedTenantData(tx, dbpkg.DefaultTenantID); err != nil {
			return fmt.Errorf("default reference data: %w", err)
		}
		for _, fixture := range []struct{ ID, Code, Name string }{
			{byte352TenantA, "E2EAUTHZADMIN", "E2E Authorization Admin Boundary"},
			{byte352TenantB, "E2EISOLATION", "E2E Operational Isolation"},
		} {
			var tenant dbpkg.Tenant
			result := tx.Where("id = ?", fixture.ID).Limit(1).Find(&tenant)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				now := time.Now().UTC()
				tenant = dbpkg.Tenant{BaseModel: dbpkg.BaseModel{ID: fixture.ID, CreatedAt: now, UpdatedAt: now}, Code: fixture.Code, Name: fixture.Name, Active: true, Description: "Deterministic LOCAL developer testing Tenant"}
				if err := tx.Create(&tenant).Error; err != nil {
					return err
				}
			} else if !tenant.Active || tenant.Code != fixture.Code {
				return fmt.Errorf("fixture Tenant %s is inactive or conflicts with its canonical code", fixture.ID)
			}
			if err := dbpkg.SeedTenantData(tx, fixture.ID); err != nil {
				return fmt.Errorf("Tenant %s reference data: %w", fixture.ID, err)
			}
		}
		if err := ensureLocalApplicationAdmin(ctx, tx, input.Credentials[localApplicationAdminLogin], cost); err != nil {
			return fmt.Errorf("Application Administrator: %w", err)
		}
		tenantCreds := map[string]string{}
		for _, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
			tenantCreds[spec.Login] = input.Credentials[spec.Login]
		}
		if err := ensureByte352FixturesWithPolicy(ctx, tx, byte352FixtureInput{DatabasePath: input.DatabasePath, Credentials: tenantCreds, RotateTenantAdministratorPasswords: true}, cost, true); err != nil {
			return fmt.Errorf("Tenant/Operator/Collaborator fixtures: %w", err)
		}
		if err := ensureLocalMultiTenantPerson(ctx, tx, input.Credentials[e2eMultiTenantPersonLogin], cost); err != nil {
			return fmt.Errorf("MULTI fixture: %w", err)
		}
		return verifyLocalDeveloperAccounts(tx, input.Credentials)
	})
}

func ensureLocalApplicationAdmin(ctx context.Context, tx *gorm.DB, password string, cost int) error {
	var actor authz.AuthzActor
	result := tx.Where("actor_key = ?", "e2e-application-admin").Limit(1).Find(&actor)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		if !actor.Active {
			return fmt.Errorf("existing GLOBAL Actor inactive; manual review required")
		}
		var binding authentication.AccountActor
		lookup := tx.Where("actor_id = ? AND scope_type = ?", actor.ID, authentication.AccountActorScopeGlobal).Limit(1).Find(&binding)
		if lookup.Error != nil {
			return lookup.Error
		}
		if lookup.RowsAffected > 0 {
			var account authentication.Account
			if err := tx.First(&account, "id = ?", binding.AccountID).Error; err != nil {
				return err
			}
			if !account.Active || account.SecuritySuspended || !strings.EqualFold(account.Login, localApplicationAdminLogin) {
				return fmt.Errorf("existing Application Administrator is inactive/suspended or linked to another login; refusing reactivation/rebinding")
			}
		}
	}
	_, err := authentication.ProvisionApplicationAdmin(ctx, tx, authentication.ProvisionApplicationAdminConfig{
		ActorKey: "e2e-application-admin", DisplayName: "LOCAL E2E Application Administrator", Login: localApplicationAdminLogin, Password: password, PasswordHashCost: cost,
	})
	return err
}

func ensureLocalMultiTenantPerson(ctx context.Context, tx *gorm.DB, password string, cost int) error {
	var account authentication.Account
	result := tx.Where("id = ?", "e2e-multi-tenant-account").Limit(1).Find(&account)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		var collision authentication.Account
		if err := tx.Where("LOWER(login) = LOWER(?)", e2eMultiTenantPersonLogin).Limit(1).Find(&collision).Error; err != nil {
			return err
		}
		if collision.ID != "" {
			return fmt.Errorf("MULTI login belongs to a different Account")
		}
		return ensureE2EMultiTenantPerson(ctx, tx, password, cost)
	}
	if !account.Active || account.SecuritySuspended || !strings.EqualFold(account.Login, e2eMultiTenantPersonLogin) {
		return fmt.Errorf("existing MULTI account is inactive or owned by another login; refusing changes")
	}
	var personBinding authentication.AccountPerson
	if err := tx.First(&personBinding, "account_id = ?", account.ID).Error; err != nil {
		return err
	}
	if personBinding.PersonID != "e2e-multi-tenant-person" {
		return fmt.Errorf("MULTI bound to unexpected Person")
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(password)) != nil {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		if err := tx.Model(&authentication.Account{}).Where("id = ? AND login = ? AND active = ?", account.ID, e2eMultiTenantPersonLogin, true).Updates(map[string]any{"password_hash": string(hash), "password_changed_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		if err := revokeLocalFixtureSessions(tx, account.ID, now); err != nil {
			return err
		}
	}
	for _, tenantID := range []string{e2eMultiTenantAID, e2eMultiTenantBID} {
		var binding authentication.AccountActor
		actorID := "e2e-multi-tenant-actor-" + tenantID
		if err := tx.First(&binding, "account_id = ? AND actor_id = ?", account.ID, actorID).Error; err != nil {
			return err
		}
		if binding.ScopeType != authentication.AccountActorScopeTenant || binding.TenantID == nil || *binding.TenantID != tenantID || binding.MembershipID == nil || *binding.MembershipID != "e2e-multi-tenant-membership-"+tenantID {
			return fmt.Errorf("MULTI Tenant binding %s differs", tenantID)
		}
	}
	return nil
}

func verifyLocalDeveloperAccounts(tx *gorm.DB, credentials map[string]string) error {
	for _, login := range localDeveloperLogins() {
		var account authentication.Account
		if err := tx.Where("LOWER(login) = LOWER(?)", login).Limit(1).First(&account).Error; err != nil {
			return fmt.Errorf("verify %s: %w", login, err)
		}
		if !account.Active || account.SecuritySuspended || bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(credentials[login])) != nil {
			return fmt.Errorf("verify %s: account inactive or password mismatch", login)
		}
	}
	return nil
}

// Credential changes invalidate older sessions and one-use recovery tokens.
// The operation is part of the same database transaction as the fixture change.
func revokeLocalFixtureSessions(tx *gorm.DB, accountID string, at time.Time) error {
	if err := tx.Model(&authentication.Session{}).Where("account_id = ? AND revoked_at IS NULL", accountID).Updates(map[string]any{"revoked_at": at, "updated_at": at}).Error; err != nil {
		return err
	}
	if err := tx.Model(&authentication.PasswordResetToken{}).Where("account_id = ? AND used_at IS NULL", accountID).Update("used_at", at).Error; err != nil {
		return err
	}
	return nil
}
