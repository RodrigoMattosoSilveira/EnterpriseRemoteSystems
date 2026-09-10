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

func TestAccountActorFoundationAcceptsCanonicalTenantAccount(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	personID, membershipID := createCanonicalTenantPerson(t, database, "tenant-a", "Tenant A", "global-person-a", "12345678901", "person-a@example.com", now)

	actor := authz.AuthzActor{ID: "tenant-actor-a", ActorKey: "person-a@example.com::tenant::tenant-a", DisplayName: "Person A", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create tenant Actor: %v", err)
	}
	account := Account{ID: "account-a", Login: "person-a@example.com", PasswordHash: "hash", Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create Account: %v", err)
	}
	if err := database.Create(&AccountPerson{AccountID: account.ID, PersonID: personID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create Account Person binding: %v", err)
	}
	tenantID := "tenant-a"
	if err := database.Create(&AccountActor{AccountID: account.ID, ActorID: actor.ID, ScopeType: AccountActorScopeTenant, TenantID: &tenantID, MembershipID: &membershipID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create AccountActor binding: %v", err)
	}

	if err := EnsureAccountActorFoundation(database); err != nil {
		t.Fatalf("validate canonical AccountActor foundation: %v", err)
	}

	record, err := NewRepository(database).FindAccountByID(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("hydrate canonical tenant Account: %v", err)
	}
	if record.GlobalPersonID != personID || len(record.Actors) != 1 || record.Actors[0].MembershipID != membershipID {
		t.Fatalf("expected canonical Person/Membership projection, got %#v", record)
	}
	resolved, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), account.ID, tenantID)
	if err != nil {
		t.Fatalf("resolve canonical tenant Actor: %v", err)
	}
	if !resolved.HasIntrinsicPermission(authz.PermissionPeopleSelfRead) || !resolved.HasPermission(authz.PermissionPeopleSelfUpdate) {
		t.Fatalf("canonical Membership must supply Person self-service, permissions=%v intrinsic=%v", authz.PermissionNames(resolved.Permissions), authz.PermissionNames(resolved.IntrinsicPermissions))
	}
}

func TestAccountActorFoundationAcceptsGlobalApplicationAdministrator(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	actor := authz.AuthzActor{ID: "global-admin-actor", ActorKey: "global-admin", DisplayName: "Global Admin", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create global Actor: %v", err)
	}
	if err := authz.GrantRole(database, actor.ID, authz.RoleApplicationAdmin, authz.GlobalTenantScope); err != nil {
		t.Fatalf("grant Application Administrator: %v", err)
	}
	account := Account{ID: "global-admin-account", Login: "global-admin@example.com", PasswordHash: "hash", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create global Account: %v", err)
	}
	if err := database.Create(&AccountActor{AccountID: account.ID, ActorID: actor.ID, ScopeType: AccountActorScopeGlobal, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create GLOBAL AccountActor: %v", err)
	}

	if err := EnsureAccountActorFoundation(database); err != nil {
		t.Fatalf("validate global AccountActor foundation: %v", err)
	}
	var personCount int64
	if err := database.Model(&AccountPerson{}).Where("account_id = ?", account.ID).Count(&personCount).Error; err != nil {
		t.Fatalf("count global Account Person bindings: %v", err)
	}
	if personCount != 0 {
		t.Fatalf("Application Administrator must have no Person binding, got %d", personCount)
	}
	resolved, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), account.ID, authz.GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve global Account Actor: %v", err)
	}
	if resolved.Scope != authz.ActorScopeApplication || !resolved.HasPermission(authz.PermissionAuthzManage) {
		t.Fatalf("expected application-global administrator Actor, got %#v", resolved)
	}
}

func TestAccountActorFoundationRejectsMissingCanonicalBinding(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	account := Account{ID: "orphan-account", Login: "orphan@example.com", PasswordHash: "hash", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create orphan Account: %v", err)
	}
	if err := EnsureAccountActorFoundation(database); err == nil {
		t.Fatal("expected Account without canonical AccountActor binding to be rejected")
	}
}

func TestAccountActorFoundationRejectsMismatchedTenantMembership(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	personA, membershipA := createCanonicalTenantPerson(t, database, "tenant-a", "Tenant A", "global-person-a", "11122233344", "a@example.com", now)
	_, membershipB := createCanonicalTenantPerson(t, database, "tenant-b", "Tenant B", "global-person-b", "55566677788", "b@example.com", now.Add(time.Second))
	actor := authz.AuthzActor{ID: "mismatch-actor", ActorKey: "mismatch", DisplayName: "Mismatch", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create Actor: %v", err)
	}
	account := Account{ID: "mismatch-account", Login: "a@example.com", PasswordHash: "hash", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create Account: %v", err)
	}
	if err := database.Create(&AccountPerson{AccountID: account.ID, PersonID: personA, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create Account Person: %v", err)
	}
	tenantA := "tenant-a"
	if err := database.Create(&AccountActor{AccountID: account.ID, ActorID: actor.ID, ScopeType: AccountActorScopeTenant, TenantID: &tenantA, MembershipID: &membershipB, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create deliberately mismatched AccountActor: %v", err)
	}
	if err := EnsureAccountActorFoundation(database); err == nil {
		t.Fatalf("expected mismatched Membership to be rejected (valid membership was %s)", membershipA)
	}
}

func TestCreatePersonAccountReusesGlobalAccountAndAddsSecondTenantActor(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	personID, _ := createCanonicalTenantPerson(t, database, "tenant-a", "Tenant A", "shared-global-person", "22233344455", "shared@example.com", now)
	createCanonicalMembershipForPerson(t, database, "tenant-b", "Tenant B", personID, "shared@example.com", now.Add(time.Second))

	repository := NewRepository(database)
	service := NewService(repository, ServiceConfig{SessionTTL: time.Hour, PasswordResetTTL: time.Minute, PasswordHashCost: bcrypt.MinCost})
	first, err := service.CreateAccount(context.Background(), CreateAccountRequest{TenantID: "tenant-a", Login: "shared@example.com", TemporaryPassword: "Shared-Password-1"})
	if err != nil {
		t.Fatalf("create first tenant account: %v", err)
	}
	second, err := service.CreateAccount(context.Background(), CreateAccountRequest{TenantID: "tenant-b", Login: "shared@example.com", TemporaryPassword: "Unused-Password-2"})
	if err != nil {
		t.Fatalf("add second tenant Actor to existing account: %v", err)
	}
	if first.ID != second.ID || second.GlobalPersonID != personID || len(second.Actors) != 2 {
		t.Fatalf("same global Person must reuse one Account with two tenant Actors: first=%#v second=%#v", first, second)
	}
	for _, bound := range second.Actors {
		if bound.Primary {
			t.Fatalf("legacy primary/default Actor selection must remain inert: %#v", bound)
		}
		resolved, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), second.ID, bound.TenantID)
		if err != nil {
			t.Fatalf("resolve %s Account Actor: %v", bound.TenantID, err)
		}
		if !resolved.HasIntrinsicPermission(authz.PermissionPeopleSelfRead) || len(resolved.RoleCodes) != 0 {
			t.Fatalf("fresh canonical tenant Actor must use intrinsic self-service only: %#v", resolved)
		}
	}

	login, err := service.Login(context.Background(), LoginRequest{Login: "shared@example.com", Password: "Shared-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("login multi-tenant Account: %v", err)
	}
	var tenantAActor AccountActorResponse
	for _, actor := range second.Actors {
		if actor.TenantID == "tenant-a" {
			tenantAActor = actor
		}
	}
	if _, err := authz.NewGORMStore(database).SetActorActive(context.Background(), tenantAActor.ActorID, false); err != nil {
		t.Fatalf("deactivate tenant-a Actor: %v", err)
	}
	if _, err := service.ResolveSession(context.Background(), login.Token); err != nil {
		t.Fatalf("tenant Actor deactivation must not revoke Account session: %v", err)
	}
	options, err := authz.NewGORMStore(database).ListAccountTenantOptions(context.Background(), second.ID)
	if err != nil {
		t.Fatalf("list tenant options after Actor deactivation: %v", err)
	}
	if len(options) != 1 || options[0].ID != "tenant-b" {
		t.Fatalf("inactive Actor must remove only its tenant option, got %#v", options)
	}
	if _, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), second.ID, "tenant-a"); !errors.Is(err, authz.ErrTenantActorUnavailable) {
		t.Fatalf("inactive selected Actor must be unavailable, got %v", err)
	}
}

func accountActorFoundationTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := appdb.Open(t.TempDir() + "/app.db")
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
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization catalog: %v", err)
	}
	return database
}

func createCanonicalTenantPerson(t *testing.T, database *gorm.DB, tenantID, tenantName, personID, cpf, email string, now time.Time) (string, string) {
	t.Helper()
	ensureCanonicalTenant(t, database, tenantID, tenantName, now)
	statusID := ensureCanonicalActivePersonStatus(t, database, tenantID, now)
	person := appdb.GlobalPerson{
		BaseModel: appdb.BaseModel{ID: personID, CreatedAt: now, UpdatedAt: now},
		FirstName: "Shared", LastName: "Person", Nickname: "Shared", CPF: cpf,
		RG: "RG-" + personID, Cellular: "11987654321", Email: email, Country: "Brasil",
		ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true, OperationalActive: true,
	}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create Global Person %s: %v", personID, err)
	}
	membershipID := "membership-" + tenantID + "-" + personID
	membership := appdb.PersonTenantMembership{BaseModel: appdb.BaseModel{ID: membershipID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, PersonID: personID, StatusID: statusID}
	if err := database.Create(&membership).Error; err != nil {
		t.Fatalf("create Membership %s: %v", membershipID, err)
	}
	return personID, membershipID
}

func createCanonicalMembershipForPerson(t *testing.T, database *gorm.DB, tenantID, tenantName, personID, email string, now time.Time) string {
	t.Helper()
	ensureCanonicalTenant(t, database, tenantID, tenantName, now)
	statusID := ensureCanonicalActivePersonStatus(t, database, tenantID, now)
	membershipID := "membership-" + tenantID + "-" + personID
	membership := appdb.PersonTenantMembership{BaseModel: appdb.BaseModel{ID: membershipID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, PersonID: personID, StatusID: statusID}
	if err := database.Create(&membership).Error; err != nil {
		t.Fatalf("create Membership %s for %s: %v", membershipID, email, err)
	}
	return membershipID
}

func ensureCanonicalTenant(t *testing.T, database *gorm.DB, tenantID, tenantName string, now time.Time) {
	t.Helper()
	tenant := appdb.Tenant{BaseModel: appdb.BaseModel{ID: tenantID, CreatedAt: now, UpdatedAt: now}, Code: tenantID, Name: tenantName, Active: true}
	if err := database.Where("id = ?", tenantID).FirstOrCreate(&tenant).Error; err != nil {
		t.Fatalf("create tenant %s: %v", tenantID, err)
	}
}

func ensureCanonicalActivePersonStatus(t *testing.T, database *gorm.DB, tenantID string, now time.Time) string {
	t.Helper()
	statusID := "status-" + tenantID + "-active"
	status := appdb.ReferenceData{BaseModel: appdb.BaseModel{ID: statusID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, Type: "person_status", Code: "ACTIVE", Label: "Active", Active: true}
	if err := database.Where("tenant_id = ? AND type = ? AND code = ?", tenantID, "person_status", "ACTIVE").FirstOrCreate(&status).Error; err != nil {
		t.Fatalf("create active Person status for %s: %v", tenantID, err)
	}
	return status.ID
}
