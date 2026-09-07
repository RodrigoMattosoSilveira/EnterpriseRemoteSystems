package people_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
	"gorm.io/gorm"
)

func TestTenantReactivationRestoresOnlySelectedMembershipAndBaselineAuthority(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()
	if err := authentication.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization: %v", err)
	}
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization: %v", err)
	}

	ctx := context.Background()
	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: "tenant-b", CreatedAt: now, UpdatedAt: now}, Code: "TENANT_B", Name: "Tenant B", Active: true}).Error; err != nil {
		t.Fatalf("create tenant B: %v", err)
	}
	if err := db.SeedTenantData(database, "tenant-b"); err != nil {
		t.Fatalf("seed tenant B: %v", err)
	}

	svc := people.NewService(people.NewRepository(database))
	first, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "Return", LastName: "Worker", Nickname: "Returner",
		CPF: "39053344705", RG: "RG-RETURN", Cellular: "11987654321", Email: "return.worker@example.test",
		StatusID: "ref-person-status-active",
	}, "tenant-admin-a")
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}
	var tenantBActive db.ReferenceData
	if err := database.First(&tenantBActive, "tenant_id = ? AND type = ? AND code = ?", "tenant-b", "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find Tenant B ACTIVE status: %v", err)
	}
	second, err := svc.CreateMembership(ctx, "tenant-b", people.CreatePersonMembershipRequest{PersonID: first.GlobalPersonID, StatusID: tenantBActive.ID}, "tenant-admin-b")
	if err != nil {
		t.Fatalf("create Tenant B Membership: %v", err)
	}

	account := authentication.Account{ID: "account-return", ActorID: "actor-return-a", Login: "return.worker@example.test", PasswordHash: "not-used", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create Account: %v", err)
	}
	if err := database.Create(&authentication.AccountPerson{AccountID: account.ID, PersonID: first.GlobalPersonID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("bind Account Person: %v", err)
	}
	actorA := authz.AuthzActor{ID: "actor-return-a", ActorKey: "return-a", DisplayName: "Return A", PersonID: &first.ID, Active: true, CreatedAt: now, UpdatedAt: now}
	actorB := authz.AuthzActor{ID: "actor-return-b", ActorKey: "return-b", DisplayName: "Return B", PersonID: &second.ID, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actorA).Error; err != nil {
		t.Fatalf("create Actor A: %v", err)
	}
	if err := database.Create(&actorB).Error; err != nil {
		t.Fatalf("create Actor B: %v", err)
	}
	tenantA := db.DefaultTenantID
	tenantB := "tenant-b"
	membershipA := first.MembershipID
	membershipB := second.MembershipID
	bindings := []authentication.AccountActor{
		{AccountID: account.ID, ActorID: actorA.ID, ScopeType: authentication.AccountActorScopeTenant, TenantID: &tenantA, MembershipID: &membershipA, Primary: true, CreatedAt: now, UpdatedAt: now},
		{AccountID: account.ID, ActorID: actorB.ID, ScopeType: authentication.AccountActorScopeTenant, TenantID: &tenantB, MembershipID: &membershipB, CreatedAt: now, UpdatedAt: now},
	}
	if err := database.Create(&bindings).Error; err != nil {
		t.Fatalf("create Account Actors: %v", err)
	}
	var expenseRole authz.AuthzRole
	if err := database.First(&expenseRole, "code = ?", string(authz.RoleExpenseOperator)).Error; err != nil {
		t.Fatalf("find expense role: %v", err)
	}
	var tenantAdminRole authz.AuthzRole
	if err := database.First(&tenantAdminRole, "code = ?", string(authz.RoleTenantAdmin)).Error; err != nil {
		t.Fatalf("find Tenant Administrator role: %v", err)
	}
	grants := []authz.AuthzActorRoleGrant{
		{ID: "grant-return-a", ActorID: actorA.ID, RoleID: expenseRole.ID, TenantID: tenantA, Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "grant-return-a-admin", ActorID: actorA.ID, RoleID: tenantAdminRole.ID, TenantID: tenantA, Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "grant-return-b", ActorID: actorB.ID, RoleID: expenseRole.ID, TenantID: tenantB, Active: true, CreatedAt: now, UpdatedAt: now},
	}
	if err := database.Create(&grants).Error; err != nil {
		t.Fatalf("create historical grants: %v", err)
	}

	var inactiveA db.ReferenceData
	if err := database.First(&inactiveA, "tenant_id = ? AND type = ? AND code = ?", tenantA, "person_status", "INACTIVE").Error; err != nil {
		t.Fatalf("find inactive status: %v", err)
	}
	defaultPerson, err := people.NewRepository(database).FindByID(ctx, tenantA, first.ID)
	if err != nil {
		t.Fatalf("load Person before deactivation: %v", err)
	}
	defaultPerson.StatusID = inactiveA.ID
	defaultPerson.UpdatedAt = now.Add(time.Minute)
	if err := people.NewRepository(database).Update(ctx, tenantA, defaultPerson); err != nil {
		t.Fatalf("deactivate Person: %v", err)
	}

	assertMembershipStatusCode(t, database, first.MembershipID, "INACTIVE")
	assertMembershipStatusCode(t, database, second.MembershipID, "INACTIVE")
	var global db.GlobalPerson
	if err := database.First(&global, "id = ?", first.GlobalPersonID).Error; err != nil || global.OperationalActive {
		t.Fatalf("expected operationally inactive global Person, person=%+v err=%v", global, err)
	}
	blockedEdit, err := people.NewRepository(database).FindByID(ctx, tenantA, first.ID)
	if err != nil {
		t.Fatalf("load inactive Person before generic reactivation attempt: %v", err)
	}
	blockedEdit.StatusID = "ref-person-status-active"
	blockedEdit.UpdatedAt = now.Add(2 * time.Minute)
	if err := people.NewRepository(database).Update(ctx, tenantA, blockedEdit); !errors.Is(err, people.ErrTenantReactivationRequired) {
		t.Fatalf("generic Person edit must not bypass Tenant reactivation, got %v", err)
	}
	assertMembershipStatusCode(t, database, first.MembershipID, "INACTIVE")

	var suspendedGrants []authz.AuthzActorRoleGrant
	if err := database.Order("id").Find(&suspendedGrants, "id IN ?", []string{"grant-return-a", "grant-return-a-admin", "grant-return-b"}).Error; err != nil {
		t.Fatalf("load suspended grants: %v", err)
	}
	for _, grant := range suspendedGrants {
		if !grant.Active || !grant.LifecycleSuspended {
			t.Fatalf("expected assigned but lifecycle-suspended grant, got %+v", grant)
		}
	}

	reactivated, err := people.NewRepository(database).Reactivate(ctx, tenantA, first.ID)
	if err != nil {
		t.Fatalf("reactivate Tenant A: %v", err)
	}
	if reactivated.StatusID != "ref-person-status-active" {
		t.Fatalf("expected Tenant A ACTIVE after reactivation, got %q", reactivated.StatusID)
	}
	assertMembershipStatusCode(t, database, first.MembershipID, "ACTIVE")
	assertMembershipStatusCode(t, database, second.MembershipID, "INACTIVE")
	if err := database.First(&global, "id = ?", first.GlobalPersonID).Error; err != nil || !global.OperationalActive {
		t.Fatalf("expected operationally active global Person, person=%+v err=%v", global, err)
	}
	var refreshedAccount authentication.Account
	if err := database.First(&refreshedAccount, "id = ?", account.ID).Error; err != nil || !refreshedAccount.Active || refreshedAccount.SecuritySuspended {
		t.Fatalf("expected usable non-suspended Account, account=%+v err=%v", refreshedAccount, err)
	}
	var refreshedA, refreshedB authz.AuthzActor
	_ = database.First(&refreshedA, "id = ?", actorA.ID).Error
	_ = database.First(&refreshedB, "id = ?", actorB.ID).Error
	if !refreshedA.Active || refreshedB.Active {
		t.Fatalf("expected only Tenant A Actor active, A=%+v B=%+v", refreshedA, refreshedB)
	}

	store := authz.NewGORMStore(database)
	resolved, err := store.FindActor(ctx, authz.ActorLookup{ActorID: actorA.ActorKey, TenantID: tenantA})
	if err != nil {
		t.Fatalf("resolve reactivated baseline Actor: %v", err)
	}
	if len(resolved.RoleCodes) != 0 || len(resolved.DelegatedPermissions) != 0 {
		t.Fatalf("expected baseline-only reactivation with no delegated authority, actor=%+v", resolved)
	}
	if _, err := store.GrantTenantOperatorRole(ctx, tenantA, actorA.ID, string(authz.RoleExpenseOperator)); err != nil {
		t.Fatalf("explicitly re-grant expense role: %v", err)
	}
	resolved, err = store.FindActor(ctx, authz.ActorLookup{ActorID: actorA.ActorKey, TenantID: tenantA})
	if err != nil || len(resolved.RoleCodes) != 1 || resolved.RoleCodes[0] != string(authz.RoleExpenseOperator) {
		t.Fatalf("expected explicitly re-granted authority only, actor=%+v err=%v", resolved, err)
	}
	var adminGrant authz.AuthzActorRoleGrant
	if err := database.First(&adminGrant, "id = ?", "grant-return-a-admin").Error; err != nil || !adminGrant.Active || !adminGrant.LifecycleSuspended {
		t.Fatalf("expected prior Tenant Administrator assignment to remain assigned but ineffective, grant=%+v err=%v", adminGrant, err)
	}

	var grantB authz.AuthzActorRoleGrant
	if err := database.First(&grantB, "id = ?", "grant-return-b").Error; err != nil || !grantB.LifecycleSuspended {
		t.Fatalf("expected Tenant B historical grant to remain suspended, grant=%+v err=%v", grantB, err)
	}
}

func TestCreateMembershipRoutesOperationallyInactivePersonThroughTenantReactivation(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()
	if err := authentication.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization: %v", err)
	}

	ctx := context.Background()
	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: "tenant-new", CreatedAt: now, UpdatedAt: now}, Code: "TENANT_NEW", Name: "Tenant New", Active: true}).Error; err != nil {
		t.Fatalf("create Tenant New: %v", err)
	}
	if err := db.SeedTenantData(database, "tenant-new"); err != nil {
		t.Fatalf("seed Tenant New: %v", err)
	}

	svc := people.NewService(people.NewRepository(database))
	created, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "New", LastName: "Tenant", Nickname: "Returning",
		CPF: "11144477735", RG: "RG-NEWTENANT", Cellular: "11993332222", Email: "new.tenant.return@example.test",
		StatusID: "ref-person-status-active",
	}, "tenant-admin-default")
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}

	var inactive db.ReferenceData
	if err := database.First(&inactive, "tenant_id = ? AND type = ? AND code = ?", db.DefaultTenantID, "person_status", "INACTIVE").Error; err != nil {
		t.Fatalf("find default INACTIVE status: %v", err)
	}
	person, err := people.NewRepository(database).FindByID(ctx, db.DefaultTenantID, created.ID)
	if err != nil {
		t.Fatalf("load Person before deactivation: %v", err)
	}
	person.StatusID = inactive.ID
	person.UpdatedAt = now.Add(time.Minute)
	if err := people.NewRepository(database).Update(ctx, db.DefaultTenantID, person); err != nil {
		t.Fatalf("deactivate Person: %v", err)
	}

	var tenantNewActive db.ReferenceData
	if err := database.First(&tenantNewActive, "tenant_id = ? AND type = ? AND code = ?", "tenant-new", "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find Tenant New ACTIVE status: %v", err)
	}
	joined, err := svc.CreateMembership(ctx, "tenant-new", people.CreatePersonMembershipRequest{
		PersonID: created.GlobalPersonID,
		StatusID: tenantNewActive.ID,
	}, "tenant-admin-new")
	if err != nil {
		t.Fatalf("onboard inactive Person into Tenant New: %v", err)
	}
	assertMembershipStatusCode(t, database, created.MembershipID, "INACTIVE")
	assertMembershipStatusCode(t, database, joined.MembershipID, "ACTIVE")
	var global db.GlobalPerson
	if err := database.First(&global, "id = ?", created.GlobalPersonID).Error; err != nil || !global.OperationalActive {
		t.Fatalf("expected Tenant onboarding to reactivate global Person, person=%+v err=%v", global, err)
	}
}

func TestCreateMembershipRollsBackWhenApplicationSecuritySuspended(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()
	if err := authentication.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization: %v", err)
	}

	ctx := context.Background()
	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: "tenant-blocked", CreatedAt: now, UpdatedAt: now}, Code: "TENANT_BLOCKED", Name: "Tenant Blocked", Active: true}).Error; err != nil {
		t.Fatalf("create blocked Tenant: %v", err)
	}
	if err := db.SeedTenantData(database, "tenant-blocked"); err != nil {
		t.Fatalf("seed blocked Tenant: %v", err)
	}

	svc := people.NewService(people.NewRepository(database))
	created, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "Blocked", LastName: "Return", Nickname: "Blocked",
		CPF: "12345678909", RG: "RG-BLOCKED", Cellular: "11992221111", Email: "blocked.return@example.test",
		StatusID: "ref-person-status-active",
	}, "tenant-admin-default")
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}
	account := authentication.Account{ID: "account-blocked-return", ActorID: "actor-blocked-return", Login: created.Email, PasswordHash: "not-used", Active: false, SecuritySuspended: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create security-suspended Account: %v", err)
	}
	if err := database.Create(&authentication.AccountPerson{AccountID: account.ID, PersonID: created.GlobalPersonID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("bind Account Person: %v", err)
	}

	var inactive db.ReferenceData
	if err := database.First(&inactive, "tenant_id = ? AND type = ? AND code = ?", db.DefaultTenantID, "person_status", "INACTIVE").Error; err != nil {
		t.Fatalf("find default INACTIVE status: %v", err)
	}
	person, err := people.NewRepository(database).FindByID(ctx, db.DefaultTenantID, created.ID)
	if err != nil {
		t.Fatalf("load Person before deactivation: %v", err)
	}
	person.StatusID = inactive.ID
	person.UpdatedAt = now.Add(time.Minute)
	if err := people.NewRepository(database).Update(ctx, db.DefaultTenantID, person); err != nil {
		t.Fatalf("deactivate Person: %v", err)
	}

	var tenantBlockedActive db.ReferenceData
	if err := database.First(&tenantBlockedActive, "tenant_id = ? AND type = ? AND code = ?", "tenant-blocked", "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find blocked Tenant ACTIVE status: %v", err)
	}
	_, err = svc.CreateMembership(ctx, "tenant-blocked", people.CreatePersonMembershipRequest{
		PersonID: created.GlobalPersonID,
		StatusID: tenantBlockedActive.ID,
	}, "tenant-admin-blocked")
	if !errors.Is(err, people.ErrApplicationSecuritySuspended) {
		t.Fatalf("expected security suspension to block onboarding reactivation, got %v", err)
	}
	var membershipCount int64
	if err := database.Model(&db.PersonTenantMembership{}).Where("tenant_id = ? AND person_id = ?", "tenant-blocked", created.GlobalPersonID).Count(&membershipCount).Error; err != nil {
		t.Fatalf("count rolled-back Membership: %v", err)
	}
	if membershipCount != 0 {
		t.Fatalf("security-suspended onboarding must roll back Membership creation, count=%d", membershipCount)
	}
	var legacyCount int64
	if err := database.Model(&db.Person{}).Where("tenant_id = ? AND cpf = ?", "tenant-blocked", created.CPF).Count(&legacyCount).Error; err != nil {
		t.Fatalf("count rolled-back legacy Person: %v", err)
	}
	if legacyCount != 0 {
		t.Fatalf("security-suspended onboarding must roll back legacy Person creation, count=%d", legacyCount)
	}
	assertMembershipStatusCode(t, database, created.MembershipID, "INACTIVE")
	var global db.GlobalPerson
	if err := database.First(&global, "id = ?", created.GlobalPersonID).Error; err != nil || global.OperationalActive {
		t.Fatalf("expected rollback to preserve global operational inactivity, person=%+v err=%v", global, err)
	}
}

func TestTenantReactivationCannotOverrideApplicationSecuritySuspension(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()
	if err := authentication.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authentication: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization: %v", err)
	}

	ctx := context.Background()
	svc := people.NewService(people.NewRepository(database))
	created, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "Secure", LastName: "Return", Nickname: "Secure",
		CPF: "52998224725", RG: "RG-SECURE", Cellular: "11995554444", Email: "secure.return@example.test",
		StatusID: "ref-person-status-active",
	}, "tenant-admin")
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}
	now := time.Now().UTC()
	account := authentication.Account{ID: "account-secure", ActorID: "actor-secure", Login: created.Email, PasswordHash: "not-used", Active: false, SecuritySuspended: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create suspended Account: %v", err)
	}
	if err := database.Create(&authentication.AccountPerson{AccountID: account.ID, PersonID: created.GlobalPersonID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("bind Account Person: %v", err)
	}
	var inactive db.ReferenceData
	if err := database.First(&inactive, "tenant_id = ? AND type = ? AND code = ?", db.DefaultTenantID, "person_status", "INACTIVE").Error; err != nil {
		t.Fatalf("find inactive status: %v", err)
	}
	person, _ := people.NewRepository(database).FindByID(ctx, db.DefaultTenantID, created.ID)
	person.StatusID = inactive.ID
	person.UpdatedAt = now.Add(time.Minute)
	if err := people.NewRepository(database).Update(ctx, db.DefaultTenantID, person); err != nil {
		t.Fatalf("deactivate Person: %v", err)
	}

	_, err = people.NewRepository(database).Reactivate(ctx, db.DefaultTenantID, created.ID)
	if !errors.Is(err, people.ErrApplicationSecuritySuspended) {
		t.Fatalf("expected security suspension rejection, got %v", err)
	}
	assertMembershipStatusCode(t, database, created.MembershipID, "INACTIVE")
	var global db.GlobalPerson
	if err := database.First(&global, "id = ?", created.GlobalPersonID).Error; err != nil || global.OperationalActive {
		t.Fatalf("expected rollback to preserve operational inactivity, person=%+v err=%v", global, err)
	}
}

func assertMembershipStatusCode(t *testing.T, database *gorm.DB, membershipID string, expected string) {
	t.Helper()
	var code string
	if err := database.Table("person_tenant_memberships m").
		Select("s.code").
		Joins("JOIN reference_data s ON s.id = m.status_id AND s.tenant_id = m.tenant_id AND s.type = ?", "person_status").
		Where("m.id = ?", membershipID).
		Scan(&code).Error; err != nil {
		t.Fatalf("load Membership status: %v", err)
	}
	if code != expected {
		t.Fatalf("expected Membership %s status %s, got %s", membershipID, expected, code)
	}
}
