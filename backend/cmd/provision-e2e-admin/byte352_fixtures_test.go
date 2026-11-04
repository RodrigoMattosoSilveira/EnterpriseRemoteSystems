package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func byte352TestInput() byte352FixtureInput {
	input := byte352FixtureInput{DatabasePath: "/tmp/test-app.db", Credentials: map[string]string{}}
	for i, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
		input.Credentials[spec.Login] = fmt.Sprintf("unique-byte352-password-%02d!", i)
	}
	return input
}
func TestByte352RejectsBadCredentialsAndProduction(t *testing.T) {
	if _, ok := normalizeProvisioningEnvironment("production"); ok {
		t.Fatal("production permitted")
	}
	if _, ok := normalizeProvisioningEnvironment("prd"); ok {
		t.Fatal("prd permitted")
	}
	input := byte352TestInput()
	if err := validateByte352Input(input); err != nil {
		t.Fatal(err)
	}
	delete(input.Credentials, byte352Identities[0].Login)
	if err := validateByte352Input(input); err == nil {
		t.Fatal("missing credential accepted")
	}
	input = byte352TestInput()
	input.Credentials[byte352Identities[0].Login] = input.Credentials[byte352Identities[1].Login]
	if err := validateByte352Input(input); err == nil {
		t.Fatal("shared credential accepted")
	}
}
func byte352TestDB(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatal(err)
	}
	for _, fn := range []func(*gorm.DB) error{dbpkg.AutoMigrate, authz.AutoMigrate, authentication.AutoMigrate, dbpkg.SeedReferenceData, authz.SeedAuthorizationCatalog} {
		if err := fn(database); err != nil {
			t.Fatal(err)
		}
	}
	for _, spec := range []e2eTenantAdminFixture{
		{TenantID: byte352TenantA, TenantCode: "E2EAUTHZADMIN", TenantName: "E2E Authorization Admin Boundary", ActorKey: "e2e-authz-admin-tenant-admin", Login: "e2e-authz-admin-tenant-admin@example.com", Stem: "e2e-authz-admin-tenant-admin"},
		{TenantID: byte352TenantB, TenantCode: "E2EISOLATION", TenantName: "E2E Operational Isolation", ActorKey: "e2e-isolation-tenant-admin", Login: "e2e-isolation-tenant-admin@example.com", Stem: "e2e-isolation-tenant-admin"},
	} {
		if err := ensureE2ETenantAdministrator(context.Background(), database, spec, map[string]string{"e2e-authz-admin-tenant-admin": "administrator-password-to-preserve", "e2e-isolation-tenant-admin": "administrator-password-to-preserve-B"}[spec.Stem], bcrypt.MinCost); err != nil {
			t.Fatal(err)
		}
	}
	return database
}
func TestByte352IdentityAndIdempotency(t *testing.T) {
	db := byte352TestDB(t)
	input := byte352TestInput()
	// Pre-existing administrator passwords are not rotated unless explicitly requested.
	input.Credentials[byte352Administrators[0].Login] = "administrator-password-to-preserve"
	input.Credentials[byte352Administrators[1].Login] = "administrator-password-to-preserve-B"
	var adminBefore authentication.Account
	if err := db.First(&adminBefore, "id = ?", "e2e-authz-admin-tenant-admin-account").Error; err != nil {
		t.Fatal(err)
	}
	for run := 0; run < 2; run++ {
		if err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
	}
	for _, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
		var account authentication.Account
		if err := db.First(&account, "id = ?", spec.Stem+"-account").Error; err != nil {
			t.Fatal(err)
		}
		if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(input.Credentials[spec.Login])) != nil {
			t.Fatalf("wrong password for %s", spec.Login)
		}
		var ap authentication.AccountPerson
		if err := db.First(&ap, "account_id = ?", account.ID).Error; err != nil {
			t.Fatal(err)
		}
		if ap.PersonID != spec.Stem+"-person" {
			t.Fatalf("Person mismatch %s", spec.Login)
		}
		var bindings []authentication.AccountActor
		if err := db.Where("account_id = ?", account.ID).Find(&bindings).Error; err != nil {
			t.Fatal(err)
		}
		if len(bindings) != len(spec.Tenants) {
			t.Fatalf("expected %d Actors for %s; got %d", len(spec.Tenants), spec.Login, len(bindings))
		}
		for _, binding := range bindings {
			if binding.ScopeType != authentication.AccountActorScopeTenant || binding.TenantID == nil || binding.MembershipID == nil {
				t.Fatalf("bad scoped binding for %s", spec.Login)
			}
		}
		if spec.Role != "" {
			var grants []authz.AuthzActorRoleGrant
			if err := db.Where("actor_id = ?", bindings[0].ActorID).Find(&grants).Error; err != nil {
				t.Fatal(err)
			}
			if len(grants) != 1 || grants[0].TenantID != spec.Tenants[0] {
				t.Fatalf("unexpected grants for %s: %+v", spec.Login, grants)
			}
		}
	}
	var adminAfter authentication.Account
	if err := db.First(&adminAfter, "id = ?", adminBefore.ID).Error; err != nil {
		t.Fatal(err)
	}
	if adminAfter.PasswordHash != adminBefore.PasswordHash {
		t.Fatal("Tenant Administrator password rotated")
	}
	modified := input
	modified.Credentials = make(map[string]string)
	for k, v := range input.Credentials {
		modified.Credentials[k] = v
	}
	modified.Credentials[byte352Identities[0].Login] = "some-other-unique-password-35!"
	if err := ensureByte352Fixtures(context.Background(), db, modified, bcrypt.MinCost); err == nil {
		t.Fatal("password rotation was allowed")
	}
	var account authentication.Account
	if err := db.First(&account, "id = ?", byte352Identities[0].Stem+"-account").Error; err != nil {
		t.Fatal(err)
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(input.Credentials[byte352Identities[0].Login])) != nil {
		t.Fatal("failed transaction changed password")
	}
}
func TestByte352MissingTenantsAndDuplicateIdentityFailClosed(t *testing.T) {
	input := byte352TestInput()
	db := byte352TestDB(t)
	if err := db.Model(&dbpkg.Tenant{}).Where("id = ?", byte352TenantB).Update("active", false).Error; err != nil {
		t.Fatal(err)
	}
	if err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost); err == nil {
		t.Fatal("missing Tenant accepted")
	}
	var count int64
	db.Model(&authentication.Account{}).Where("id = ?", byte352Identities[0].Stem+"-account").Count(&count)
	if count != 0 {
		t.Fatal("partial fixture creation on missing Tenant")
	}
}

func TestByte352AdministratorCredentialConsentAndRollback(t *testing.T) {
	db := byte352TestDB(t)
	input := byte352TestInput()
	input.Credentials[byte352Administrators[0].Login] = "new-administrator-a-password-35!"
	input.Credentials[byte352Administrators[1].Login] = "new-administrator-b-password-35!"
	var beforeA, beforeB authentication.Account
	db.First(&beforeA, "id = ?", byte352Administrators[0].Stem+"-account")
	db.First(&beforeB, "id = ?", byte352Administrators[1].Stem+"-account")
	if err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost); err == nil {
		t.Fatal("changed existing admin password without consent")
	}
	var afterA authentication.Account
	db.First(&afterA, "id = ?", beforeA.ID)
	if beforeA.PasswordHash != afterA.PasswordHash {
		t.Fatal("rollback failed")
	}
	input.RotateTenantAdministratorPasswords = true
	if err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
		t.Fatal(err)
	}
	db.First(&afterA, "id = ?", beforeA.ID)
	if bcrypt.CompareHashAndPassword([]byte(afterA.PasswordHash), []byte(input.Credentials[byte352Administrators[0].Login])) != nil {
		t.Fatal("admin A password not updated")
	}
	var afterB authentication.Account
	db.First(&afterB, "id = ?", beforeB.ID)
	if bcrypt.CompareHashAndPassword([]byte(afterB.PasswordHash), []byte(input.Credentials[byte352Administrators[1].Login])) != nil {
		t.Fatal("admin B password not updated")
	}
	if err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
		t.Fatal("idempotent rerun failed:", err)
	}
}

// TestByte352AdministratorActorKeyCompatibility protects existing E2E
// Administrator identities, including their canonical Actor IDs and bindings.
func TestByte352AdministratorActorKeyCompatibility(t *testing.T) {
	db := byte352TestDB(t)
	input := byte352TestInput()
	input.Credentials[byte352Administrators[0].Login] = "administrator-password-to-preserve"
	input.Credentials[byte352Administrators[1].Login] = "administrator-password-to-preserve-B"

	type snapshot struct {
		actor   authz.AuthzActor
		binding authentication.AccountActor
		account authentication.Account
	}
	before := make(map[string]snapshot)
	for _, spec := range byte352Administrators {
		actorID := spec.Stem + "-actor"
		var actor authz.AuthzActor
		if err := db.First(&actor, "id = ?", actorID).Error; err != nil {
			t.Fatal(err)
		}
		if actor.ActorKey != spec.Stem || !actor.Active {
			t.Fatalf("unexpected seeded Actor: %+v", actor)
		}
		var binding authentication.AccountActor
		if err := db.First(&binding, "actor_id = ?", actorID).Error; err != nil {
			t.Fatal(err)
		}
		var account authentication.Account
		if err := db.First(&account, "id = ?", spec.Stem+"-account").Error; err != nil {
			t.Fatal(err)
		}
		before[actorID] = snapshot{actor, binding, account}
	}
	for run := 0; run < 2; run++ {
		if err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost); err != nil {
			t.Fatalf("provisioning run %d: %v", run, err)
		}
	}
	for actorID, previous := range before {
		var actor authz.AuthzActor
		if err := db.First(&actor, "id = ?", actorID).Error; err != nil {
			t.Fatal(err)
		}
		if actor.ID != previous.actor.ID || actor.ActorKey != previous.actor.ActorKey || actor.Active != previous.actor.Active {
			t.Fatalf("Actor changed: before=%+v after=%+v", previous.actor, actor)
		}
		var binding authentication.AccountActor
		if err := db.First(&binding, "actor_id = ?", actorID).Error; err != nil {
			t.Fatal(err)
		}
		if binding.AccountID != previous.binding.AccountID || binding.ScopeType != previous.binding.ScopeType ||
			binding.TenantID == nil || previous.binding.TenantID == nil || *binding.TenantID != *previous.binding.TenantID ||
			binding.MembershipID == nil || previous.binding.MembershipID == nil || *binding.MembershipID != *previous.binding.MembershipID {
			t.Fatalf("canonical Actor binding changed for %s", actorID)
		}
		var account authentication.Account
		if err := db.First(&account, "id = ?", previous.account.ID).Error; err != nil {
			t.Fatal(err)
		}
		if account.PasswordHash != previous.account.PasswordHash {
			t.Fatalf("administrator password changed for %s", actorID)
		}
	}
}

func TestByte352RejectsConflictingAdministratorActorKeys(t *testing.T) {
	for _, spec := range byte352Administrators {
		t.Run(spec.Stem, func(t *testing.T) {
			db := byte352TestDB(t)
			input := byte352TestInput()
			input.Credentials[byte352Administrators[0].Login] = "administrator-password-to-preserve"
			input.Credentials[byte352Administrators[1].Login] = "administrator-password-to-preserve-B"
			actorID := spec.Stem + "-actor"
			if err := db.Model(&authz.AuthzActor{}).Where("id = ?", actorID).Update("actor_key", "conflicting-actor-key").Error; err != nil {
				t.Fatal(err)
			}
			var before authentication.Account
			if err := db.First(&before, "id = ?", spec.Stem+"-account").Error; err != nil {
				t.Fatal(err)
			}
			err := ensureByte352Fixtures(context.Background(), db, input, bcrypt.MinCost)
			if err == nil || !strings.Contains(err.Error(), "existing Actor conflicted or inactive") {
				t.Fatalf("expected Actor Key conflict, got %v", err)
			}
			var actor authz.AuthzActor
			if err := db.First(&actor, "id = ?", actorID).Error; err != nil {
				t.Fatal(err)
			}
			if actor.ActorKey != "conflicting-actor-key" {
				t.Fatal("conflicting Actor Key was overwritten")
			}
			var after authentication.Account
			if err := db.First(&after, "id = ?", before.ID).Error; err != nil {
				t.Fatal(err)
			}
			if after.PasswordHash != before.PasswordHash {
				t.Fatal("failed transaction changed password")
			}
			var count int64
			if err := db.Model(&authentication.Account{}).Where("id = ?", byte352Identities[0].Stem+"-account").Count(&count).Error; err != nil {
				t.Fatal(err)
			}
			if count != 0 {
				t.Fatal("failed transaction persisted a partial fixture")
			}
		})
	}
}
