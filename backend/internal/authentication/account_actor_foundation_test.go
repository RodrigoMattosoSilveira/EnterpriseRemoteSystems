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

func TestAccountActorFoundationSplitsMultiTenantPersonActorWithoutMovingLegacyGrants(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-a", "Tenant A", "person-a", "12345678901", "multi@example.com", now)
	createFoundationTenantPerson(t, database, "tenant-b", "Tenant B", "person-b", "12345678901", "multi@example.com", now.Add(time.Second))
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}

	personID := "person-a"
	actor := authz.AuthzActor{ID: "legacy-multi-actor", ActorKey: "multi@example.com", DisplayName: "Multi Tenant", PersonID: &personID, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create legacy actor: %v", err)
	}
	if err := authz.GrantRole(database, actor.ID, authz.RoleTenantAdmin, "tenant-a"); err != nil {
		t.Fatalf("grant tenant A: %v", err)
	}
	if err := authz.GrantRole(database, actor.ID, authz.RoleExpenseOperator, "tenant-b"); err != nil {
		t.Fatalf("grant tenant B: %v", err)
	}
	account := Account{ID: "account-multi", ActorID: actor.ID, Login: "multi@example.com", PasswordHash: "hash", Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create legacy account: %v", err)
	}

	if err := EnsureAccountActorFoundation(database); err != nil {
		t.Fatalf("ensure Account/Actor foundation: %v", err)
	}

	var personBinding AccountPerson
	if err := database.First(&personBinding, "account_id = ?", account.ID).Error; err != nil {
		t.Fatalf("find account Person binding: %v", err)
	}
	if personBinding.PersonID == "" {
		t.Fatal("expected one global Person binding")
	}

	accountRecord, err := NewRepository(database).FindAccountByID(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("hydrate multi-tenant Account Actors: %v", err)
	}
	if len(accountRecord.Actors) != 2 {
		t.Fatalf("expected hydrated multi-tenant Actors, got %#v", accountRecord.Actors)
	}
	if accountRecord.GlobalPersonName != "Shared Person" || accountRecord.GlobalPersonEmail != "multi@example.com" {
		t.Fatalf("expected Authentication Account Person identity, got name=%q email=%q", accountRecord.GlobalPersonName, accountRecord.GlobalPersonEmail)
	}
	tenantNames := map[string]string{"tenant-a": "Tenant A", "tenant-b": "Tenant B"}
	for _, boundActor := range accountRecord.Actors {
		if boundActor.PersonName != "Shared Person" || boundActor.PersonNickname != "Shared" {
			t.Fatalf("expected global Person search identity on Actor binding, got %#v", boundActor)
		}
		if boundActor.TenantName != tenantNames[boundActor.TenantID] {
			t.Fatalf("expected tenant display name for Actor binding, got %#v", boundActor)
		}
	}

	var bindings []AccountActor
	if err := database.Where("account_id = ?", account.ID).Order("tenant_id").Find(&bindings).Error; err != nil {
		t.Fatalf("list Account Actors: %v", err)
	}
	if len(bindings) != 2 {
		t.Fatalf("expected two tenant Actors, got %#v", bindings)
	}
	if bindings[0].ActorID == bindings[1].ActorID {
		t.Fatalf("each tenant must use a different Actor: %#v", bindings)
	}

	store := authz.NewGORMStore(database)
	tenantAActor, err := store.FindAccountActor(context.Background(), account.ID, "tenant-a")
	if err != nil {
		t.Fatalf("resolve tenant A Actor: %v", err)
	}
	tenantBActor, err := store.FindAccountActor(context.Background(), account.ID, "tenant-b")
	if err != nil {
		t.Fatalf("resolve tenant B Actor: %v", err)
	}
	if tenantAActor.RecordID == tenantBActor.RecordID {
		t.Fatal("tenant switch must resolve a different Account-owned Actor")
	}
	if tenantAActor.Scope != authz.ActorScopeTenant || tenantBActor.Scope != authz.ActorScopeTenant {
		t.Fatalf("expected explicit tenant Actor scope, got %s and %s", tenantAActor.Scope, tenantBActor.Scope)
	}
	for tenantID, resolved := range map[string]*authz.Actor{"tenant-a": tenantAActor, "tenant-b": tenantBActor} {
		if !resolved.HasIntrinsicPermission(authz.PermissionPeopleSelfRead) || !resolved.HasPermission(authz.PermissionPeopleSelfUpdate) {
			t.Fatalf("%s Actor must derive Person self-service intrinsically from Account/Membership identity, permissions=%v intrinsic=%v", tenantID, authz.PermissionNames(resolved.Permissions), authz.PermissionNames(resolved.IntrinsicPermissions))
		}
		for _, roleCode := range resolved.RoleCodes {
			if roleCode == string(authz.RolePerson) {
				t.Fatalf("%s Actor must not depend on PERSON Role Grant after 30D: %#v", tenantID, resolved.RoleCodes)
			}
		}
	}

	// Rollback compatibility: the legacy Actor retains its original grants. 30C
	// copies grants to the split Actor instead of moving them.
	var legacyTenantBGrantCount int64
	if err := database.Model(&authz.AuthzActorRoleGrant{}).Where("actor_id = ? AND tenant_id = ?", actor.ID, "tenant-b").Count(&legacyTenantBGrantCount).Error; err != nil {
		t.Fatalf("count legacy grants: %v", err)
	}
	if legacyTenantBGrantCount != 1 {
		t.Fatalf("expected legacy tenant B grant to remain for rollback, got %d", legacyTenantBGrantCount)
	}
}

func TestAccountActorFoundationMakesApplicationAdministratorGlobalOnly(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	legacyPerson := "legacy-person"
	legacyCollaborator := "legacy-collaborator"
	actor := authz.AuthzActor{ID: "global-admin-actor", ActorKey: "global-admin", DisplayName: "Global Admin", PersonID: &legacyPerson, CollaboratorID: &legacyCollaborator, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create global actor: %v", err)
	}
	if err := authz.GrantRole(database, actor.ID, authz.RoleApplicationAdmin, authz.GlobalTenantScope); err != nil {
		t.Fatalf("grant Application Administrator: %v", err)
	}
	account := Account{ID: "global-admin-account", ActorID: actor.ID, Login: "global-admin@example.com", PasswordHash: "hash", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create global account: %v", err)
	}

	if err := EnsureAccountActorFoundation(database); err != nil {
		t.Fatalf("ensure global Account/Actor foundation: %v", err)
	}
	var binding AccountActor
	if err := database.First(&binding, "account_id = ?", account.ID).Error; err != nil {
		t.Fatalf("find global binding: %v", err)
	}
	if binding.ScopeType != AccountActorScopeGlobal || binding.TenantID != nil || binding.MembershipID != nil {
		t.Fatalf("unexpected global binding: %#v", binding)
	}
	var personCount int64
	if err := database.Model(&AccountPerson{}).Where("account_id = ?", account.ID).Count(&personCount).Error; err != nil {
		t.Fatalf("count global account Person bindings: %v", err)
	}
	if personCount != 0 {
		t.Fatalf("Application Administrator must not have a Person binding, got %d", personCount)
	}
	var refreshed authz.AuthzActor
	if err := database.First(&refreshed, "id = ?", actor.ID).Error; err != nil {
		t.Fatalf("reload global actor: %v", err)
	}
	if refreshed.PersonID != nil || refreshed.CollaboratorID != nil {
		t.Fatalf("Application Administrator Actor must have no tenant identity: %#v", refreshed)
	}

	for _, tenant := range []appdb.Tenant{
		{BaseModel: appdb.BaseModel{ID: "tenant-a", CreatedAt: now, UpdatedAt: now}, Code: "A", Name: "Tenant A", Active: true},
		{BaseModel: appdb.BaseModel{ID: "tenant-b", CreatedAt: now, UpdatedAt: now}, Code: "B", Name: "Tenant B", Active: true},
	} {
		if err := database.Create(&tenant).Error; err != nil {
			t.Fatalf("create active tenant %s: %v", tenant.ID, err)
		}
	}
	options, err := authz.NewGORMStore(database).ListAccountTenantOptions(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("list global Account tenant options: %v", err)
	}
	if len(options) != 2 {
		t.Fatalf("global Application Administrator compatibility should expose active tenants, got %#v", options)
	}
	for _, option := range options {
		if option.ActorRecordID != actor.ID || option.ActorKey != actor.ActorKey || option.ActorScope != string(authz.ActorScopeApplication) || option.MembershipID != "" {
			t.Fatalf("global tenant option must advertise the same GLOBAL Actor without tenant Membership identity: %#v", option)
		}
	}

	// Regression: hydrating Account Actor bindings must execute valid SQLite.
	// `PRIMARY` is a SQLite keyword, so the projection alias must not use it.
	record, err := NewRepository(database).FindAccountByID(context.Background(), account.ID)
	if err != nil {
		t.Fatalf("hydrate global Account Actor binding: %v", err)
	}
	if len(record.Actors) != 1 || !record.Actors[0].Primary {
		t.Fatalf("expected one primary global Actor binding, got %#v", record.Actors)
	}
	tenantID := "tenant-a"
	if err := ensureAccountActorBinding(database, AccountActor{
		AccountID: account.ID, ActorID: "forbidden-tenant-actor", ScopeType: AccountActorScopeTenant, TenantID: &tenantID, CreatedAt: now, UpdatedAt: now,
	}); err == nil {
		t.Fatal("Application Administrator Account must not accept a tenant Actor binding")
	}
}

func TestCreatePersonAccountReusesGlobalAccountAndAddsSecondTenantActor(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-a", "Tenant A", "person-a", "22233344455", "shared@example.com", now)
	createFoundationTenantPerson(t, database, "tenant-b", "Tenant B", "person-b", "22233344455", "shared@example.com", now.Add(time.Second))
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}

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
	if first.ID != second.ID {
		t.Fatalf("same global Person must reuse one Authentication Account: first=%s second=%s", first.ID, second.ID)
	}
	if len(second.Actors) != 2 {
		t.Fatalf("expected one Actor per tenant on the same Account, got %#v", second.Actors)
	}
	if second.GlobalPersonID == "" {
		t.Fatal("expected Authentication Account to bind to the global Person")
	}
	if second.GlobalPersonName != "Shared Person" || second.GlobalPersonEmail != "shared@example.com" {
		t.Fatalf("expected Account response to expose Person identity, got name=%q email=%q", second.GlobalPersonName, second.GlobalPersonEmail)
	}
	for _, boundActor := range second.Actors {
		if boundActor.TenantName == "" {
			t.Fatalf("expected Account response Actor to expose tenant display name, got %#v", boundActor)
		}
	}

	options, err := authz.NewGORMStore(database).ListAccountTenantOptions(context.Background(), second.ID)
	if err != nil {
		t.Fatalf("list Account tenant options: %v", err)
	}
	if len(options) != 2 {
		t.Fatalf("expected both tenant options from Account Actors, got %#v", options)
	}
	actorsByTenant := map[string]AccountActorResponse{}
	for _, actor := range second.Actors {
		actorsByTenant[actor.TenantID] = actor
	}
	for _, option := range options {
		bound := actorsByTenant[option.ID]
		if option.ActorScope != string(authz.ActorScopeTenant) || option.ActorRecordID != bound.ActorID || option.ActorKey != bound.ActorKey || option.MembershipID != bound.MembershipID {
			t.Fatalf("tenant option must identify its exact Account-owned Actor and Membership: option=%#v actor=%#v", option, bound)
		}
	}
	for _, tenantID := range []string{"tenant-a", "tenant-b"} {
		resolved, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), second.ID, tenantID)
		if err != nil {
			t.Fatalf("resolve %s Account Actor without PERSON grant: %v", tenantID, err)
		}
		if !resolved.HasIntrinsicPermission(authz.PermissionPeopleSelfRead) || !resolved.HasPermission(authz.PermissionPeopleSelfUpdate) {
			t.Fatalf("%s Account Actor missing intrinsic Person self-service: permissions=%v intrinsic=%v", tenantID, authz.PermissionNames(resolved.Permissions), authz.PermissionNames(resolved.IntrinsicPermissions))
		}
		if len(resolved.RoleCodes) != 0 {
			t.Fatalf("fresh Person Account Actor should need no delegated Role Grant, got %#v", resolved.RoleCodes)
		}
	}

	login, err := service.Login(context.Background(), LoginRequest{Login: "shared@example.com", Password: "Shared-Password-1"}, "", "")
	if err != nil {
		t.Fatalf("login multi-tenant Account: %v", err)
	}
	tenantAActor := actorsByTenant["tenant-a"]
	if _, err := authz.NewGORMStore(database).SetActorActive(context.Background(), tenantAActor.ActorID, false); err != nil {
		t.Fatalf("deactivate only tenant-a Actor: %v", err)
	}
	if _, err := service.ResolveSession(context.Background(), login.Token); err != nil {
		t.Fatalf("tenant Actor deactivation must not revoke the Account-authenticated session: %v", err)
	}
	options, err = authz.NewGORMStore(database).ListAccountTenantOptions(context.Background(), second.ID)
	if err != nil {
		t.Fatalf("list options after one Actor deactivation: %v", err)
	}
	if len(options) != 1 || options[0].ID != "tenant-b" {
		t.Fatalf("inactive tenant Actor must disappear independently from Account options, got %#v", options)
	}
	if _, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), second.ID, "tenant-a"); !errors.Is(err, authz.ErrTenantActorUnavailable) {
		t.Fatalf("inactive selected Actor must report tenant Actor unavailable without invalidating the Account session, got %v", err)
	}
	if _, err := authz.NewGORMStore(database).SetActorActive(context.Background(), tenantAActor.ActorID, true); err != nil {
		t.Fatalf("reactivate tenant-a Actor: %v", err)
	}
	options, err = authz.NewGORMStore(database).ListAccountTenantOptions(context.Background(), second.ID)
	if err != nil || len(options) != 2 {
		t.Fatalf("reactivating one Actor must restore only its tenant option: options=%#v err=%v", options, err)
	}

	inactiveStatus := appdb.ReferenceData{
		BaseModel: appdb.BaseModel{ID: "status-tenant-a-inactive", CreatedAt: now, UpdatedAt: now},
		TenantID:  "tenant-a",
		Type:      "person_status",
		Code:      "INACTIVE",
		Label:     "Inactive",
		Active:    true,
	}
	if err := database.Create(&inactiveStatus).Error; err != nil {
		t.Fatalf("create inactive Membership status: %v", err)
	}
	if err := database.Model(&appdb.PersonTenantMembership{}).Where("id = ?", tenantAActor.MembershipID).Update("status_id", inactiveStatus.ID).Error; err != nil {
		t.Fatalf("deactivate only tenant-a Membership: %v", err)
	}
	options, err = authz.NewGORMStore(database).ListAccountTenantOptions(context.Background(), second.ID)
	if err != nil {
		t.Fatalf("list options after Membership deactivation: %v", err)
	}
	if len(options) != 1 || options[0].ID != "tenant-b" {
		t.Fatalf("inactive Membership must remove only its tenant option, got %#v", options)
	}
	if _, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), second.ID, "tenant-a"); !errors.Is(err, authz.ErrTenantActorUnavailable) {
		t.Fatalf("selected tenant with inactive Membership must be unavailable without cross-tenant fallback, got %v", err)
	}
}

func TestCreateExplicitTenantActorReusesExistingGlobalPersonAccount(t *testing.T) {
	database := accountActorFoundationTestDatabase(t)
	now := time.Now().UTC()
	createFoundationTenantPerson(t, database, "tenant-a", "Tenant A", "person-explicit-a", "33344455566", "explicit@example.com", now)
	createFoundationTenantPerson(t, database, "tenant-b", "Tenant B", "person-explicit-b", "33344455566", "explicit@example.com", now.Add(time.Second))
	if err := appdb.EnsureGlobalPersonMembershipFoundation(database); err != nil {
		t.Fatalf("ensure Person membership foundation: %v", err)
	}

	personA := "person-explicit-a"
	actorA := authz.AuthzActor{ID: "explicit-actor-a", ActorKey: "explicit-a", DisplayName: "Explicit A", PersonID: &personA, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actorA).Error; err != nil {
		t.Fatalf("create tenant A actor: %v", err)
	}
	if err := authz.GrantRole(database, actorA.ID, authz.RoleExpenseOperator, "tenant-a"); err != nil {
		t.Fatalf("grant tenant A delegated operator role: %v", err)
	}

	personB := "person-explicit-b"
	actorB := authz.AuthzActor{ID: "explicit-actor-b", ActorKey: "explicit-b", DisplayName: "Explicit B", PersonID: &personB, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actorB).Error; err != nil {
		t.Fatalf("create tenant B actor: %v", err)
	}
	if err := authz.GrantRole(database, actorB.ID, authz.RoleExpenseOperator, "tenant-b"); err != nil {
		t.Fatalf("grant tenant B delegated operator role: %v", err)
	}

	repository := NewRepository(database)
	service := NewService(repository, ServiceConfig{SessionTTL: time.Hour, PasswordResetTTL: time.Minute, PasswordHashCost: bcrypt.MinCost})
	first, err := service.CreateAccount(context.Background(), CreateAccountRequest{ActorID: actorA.ID, Login: "explicit@example.com", TemporaryPassword: "Explicit-Password-1"})
	if err != nil {
		t.Fatalf("create first explicit Actor account: %v", err)
	}
	second, err := service.CreateAccount(context.Background(), CreateAccountRequest{ActorID: actorB.ID, Login: "explicit@example.com", TemporaryPassword: "Unused-Password-2"})
	if err != nil {
		t.Fatalf("bind second explicit Actor to existing account: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("explicit Actors for the same global Person must share one Account: first=%s second=%s", first.ID, second.ID)
	}
	if len(second.Actors) != 2 {
		t.Fatalf("expected two explicit tenant Actors on one Account, got %#v", second.Actors)
	}

	var accountCount int64
	if err := database.Model(&Account{}).Where("login = ? COLLATE NOCASE", "explicit@example.com").Count(&accountCount).Error; err != nil {
		t.Fatalf("count Authentication Accounts: %v", err)
	}
	if accountCount != 1 {
		t.Fatalf("expected exactly one Authentication Account for the global Person, got %d", accountCount)
	}
	for _, tenantID := range []string{"tenant-a", "tenant-b"} {
		resolved, err := authz.NewGORMStore(database).FindAccountActor(context.Background(), second.ID, tenantID)
		if err != nil {
			t.Fatalf("resolve explicit %s Actor: %v", tenantID, err)
		}
		if !resolved.HasIntrinsicPermission(authz.PermissionPeopleSelfRead) {
			t.Fatalf("explicit %s Actor must receive intrinsic self-service from Membership", tenantID)
		}
		if !resolved.HasPermission(authz.PermissionExpensesCreate) || resolved.HasIntrinsicPermission(authz.PermissionExpensesCreate) {
			t.Fatalf("delegated Expense Operator authority must remain additive and non-intrinsic: effective=%v intrinsic=%v", authz.PermissionNames(resolved.Permissions), authz.PermissionNames(resolved.IntrinsicPermissions))
		}
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

func createFoundationTenantPerson(t *testing.T, database *gorm.DB, tenantID string, tenantName string, personID string, cpf string, email string, now time.Time) {
	t.Helper()
	tenant := appdb.Tenant{BaseModel: appdb.BaseModel{ID: tenantID, CreatedAt: now, UpdatedAt: now}, Code: stringsForTest(tenantID), Name: tenantName, Active: true}
	if err := database.Where("id = ?", tenantID).FirstOrCreate(&tenant).Error; err != nil {
		t.Fatalf("create tenant %s: %v", tenantID, err)
	}
	statusID := "status-" + tenantID
	status := appdb.ReferenceData{BaseModel: appdb.BaseModel{ID: statusID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, Type: "person_status", Code: "ACTIVE", Label: "Active", Active: true}
	if err := database.Where("id = ?", statusID).FirstOrCreate(&status).Error; err != nil {
		t.Fatalf("create status %s: %v", statusID, err)
	}
	person := appdb.Person{
		BaseModel: appdb.BaseModel{ID: personID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID,
		FirstName: "Shared", LastName: "Person", Nickname: "Shared", CPF: cpf,
		RG: "RG-" + personID, Cellular: "119" + personID[len(personID)-1:] + "7654321", Email: email,
		Country: "Brasil", StatusID: statusID,
	}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create Person %s: %v", personID, err)
	}
}

func stringsForTest(value string) string {
	result := ""
	for _, r := range value {
		if r >= 'a' && r <= 'z' {
			result += string(r - ('a' - 'A'))
		} else if r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			result += string(r)
		}
	}
	if result == "" {
		return "TENANT"
	}
	return result
}
