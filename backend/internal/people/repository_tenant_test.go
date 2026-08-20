package people_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

func TestRepositoryUniqueConflictsAreGlobalAcrossTenants(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()

	ctx := context.Background()
	otherTenantID := "tenant-other"
	now := time.Now().UTC()

	if err := database.Create(&db.Tenant{
		BaseModel:   db.BaseModel{ID: otherTenantID, CreatedAt: now, UpdatedAt: now},
		Code:        "OTHER",
		Name:        "Other Tenant",
		Description: "Other tenant for scoped uniqueness tests",
		Active:      true,
	}).Error; err != nil {
		t.Fatalf("create other tenant: %v", err)
	}

	otherTenantPerson := db.Person{
		BaseModel:               db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                otherTenantID,
		FirstName:               "Same",
		LastName:                "CPF",
		Nickname:                "SameCPF",
		CPF:                     "39053344705",
		RG:                      "RG-OTHER-001",
		Cellular:                "11998765432",
		Email:                   "same-cpf-other@example.com",
		Country:                 "Brasil",
		StatusID:                "ref-person-status-active",
		ProfileCompletionStatus: "PERSONAL_ONLY",
		CanCreateCollaborator:   false,
	}
	if err := database.Create(&otherTenantPerson).Error; err != nil {
		t.Fatalf("create other tenant person: %v", err)
	}

	repo := people.NewRepository(database)
	conflicts, err := repo.UniqueConflicts(ctx, db.DefaultTenantID, otherTenantPerson.CPF, "RG-DEFAULT-001", "11991234567", "same-cpf-default@example.com", nil, nil)
	if err != nil {
		t.Fatalf("check default tenant conflicts: %v", err)
	}
	if !conflicts["cpf"] {
		t.Fatalf("expected same CPF in another tenant to conflict globally: %+v", conflicts)
	}

	conflicts, err = repo.UniqueConflicts(ctx, db.DefaultTenantID, "52998224725", otherTenantPerson.RG, "11995554444", "new-default@example.com", nil, nil)
	if err != nil {
		t.Fatalf("check global RG conflicts: %v", err)
	}
	if !conflicts["rg"] {
		t.Fatalf("expected RG in another tenant to conflict globally: %+v", conflicts)
	}

}

func TestRepositoryPeopleSearchFindsInactiveTenantActorIdentityAliases(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()

	if err := database.AutoMigrate(
		&authentication.Account{},
		&authentication.AccountPerson{},
		&authentication.AccountActor{},
		&authz.AuthzActor{},
	); err != nil {
		t.Fatalf("migrate authentication identity tables: %v", err)
	}

	ctx := context.Background()
	svc := people.NewService(people.NewRepository(database))
	created, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "Diana", LastName: "Disposable", Nickname: "30E Identity D",
		CPF: "52998224725", RG: "RG-IDENTITY-D", Cellular: "11991234567", Email: "diana.person@example.test",
		StatusID: "ref-person-status-active",
	}, "tenant-admin-a")
	if err != nil {
		t.Fatalf("create Identity D Person: %v", err)
	}

	now := time.Now().UTC()
	actorID := "actor-identity-d-tenant-a"
	actorKey := "manual30e-identity-d-tenant-a"
	actor := authz.AuthzActor{
		ID: actorID, ActorKey: actorKey, DisplayName: "Diana Disposable (30E Identity D)",
		PersonID: &created.ID, Active: false, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create inactive Tenant Actor: %v", err)
	}
	account := authentication.Account{
		ID: "account-identity-d", ActorID: actorID, Login: "manual30e.identity-d@example.test",
		PasswordHash: "manual-test-hash", Active: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&account).Error; err != nil {
		t.Fatalf("create Authentication Account: %v", err)
	}
	if err := database.Create(&authentication.AccountPerson{
		AccountID: account.ID, PersonID: created.GlobalPersonID, CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatalf("bind Authentication Account to Person: %v", err)
	}
	tenantID := db.DefaultTenantID
	membershipID := created.MembershipID
	if err := database.Create(&authentication.AccountActor{
		AccountID: account.ID, ActorID: actorID, ScopeType: authentication.AccountActorScopeTenant,
		TenantID: &tenantID, MembershipID: &membershipID, Primary: true, CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatalf("bind inactive Tenant Actor: %v", err)
	}

	for label, search := range map[string]string{
		"Authentication Account login": account.Login,
		"Actor ID":                     actorID,
		"Actor Key":                    actorKey,
		"Actor display name":           "Diana Disposable",
	} {
		t.Run(label, func(t *testing.T) {
			rows, total, err := svc.List(ctx, db.DefaultTenantID, people.PersonListFilter{Search: search})
			if err != nil {
				t.Fatalf("search People by %s: %v", label, err)
			}
			if total != 1 || len(rows) != 1 || rows[0].ID != created.ID {
				t.Fatalf("expected inactive Actor identity alias to find Identity D, total=%d rows=%+v", total, rows)
			}
		})
	}

	otherTenantID := "tenant-other-alias"
	if err := database.Create(&db.Tenant{
		BaseModel: db.BaseModel{ID: otherTenantID, CreatedAt: now, UpdatedAt: now},
		Code:      "OTHER_ALIAS", Name: "Other Alias Tenant", Active: true,
	}).Error; err != nil {
		t.Fatalf("create other tenant: %v", err)
	}
	otherActorID := "actor-identity-d-other-tenant"
	otherActorKey := "identity-d-other-tenant-only"
	if err := database.Create(&authz.AuthzActor{
		ID: otherActorID, ActorKey: otherActorKey, DisplayName: "Other Tenant Alias Only",
		PersonID: &created.ID, Active: false, CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatalf("create other-tenant Actor: %v", err)
	}
	if err := database.Create(&authentication.AccountActor{
		AccountID: account.ID, ActorID: otherActorID, ScopeType: authentication.AccountActorScopeTenant,
		TenantID: &otherTenantID, Primary: false, CreatedAt: now, UpdatedAt: now,
	}).Error; err != nil {
		t.Fatalf("bind other-tenant Actor: %v", err)
	}

	rows, total, err := svc.List(ctx, db.DefaultTenantID, people.PersonListFilter{Search: otherActorKey})
	if err != nil {
		t.Fatalf("search default People by other-tenant Actor Key: %v", err)
	}
	if total != 0 || len(rows) != 0 {
		t.Fatalf("expected other-tenant Actor alias not to leak into default People search, total=%d rows=%+v", total, rows)
	}
}

func newRepositoryTestDB(t *testing.T) (*gorm.DB, func()) {
	t.Helper()

	database, err := db.Open(filepath.Join(t.TempDir(), "repo.db"))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate test db: %v", err)
	}
	if err := db.SeedTenants(database); err != nil {
		t.Fatalf("seed tenants: %v", err)
	}
	if err := db.SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	cleanup := func() {
		sqlDB, err := database.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}
	return database, cleanup
}

func TestRepositoryPeopleReadsAndWritesAreScopedByTenant(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()

	ctx := context.Background()
	now := time.Now().UTC()
	otherTenantID := "tenant-other"

	if err := database.Create(&db.Tenant{
		BaseModel:   db.BaseModel{ID: otherTenantID, CreatedAt: now, UpdatedAt: now},
		Code:        "OTHER",
		Name:        "Other Tenant",
		Description: "Other tenant for People isolation tests",
		Active:      true,
	}).Error; err != nil {
		t.Fatalf("create other tenant: %v", err)
	}

	defaultPerson := db.Person{
		BaseModel:               db.BaseModel{ID: "person-default", CreatedAt: now, UpdatedAt: now},
		TenantID:                db.DefaultTenantID,
		FirstName:               "Default",
		LastName:                "Only",
		Nickname:                "DefaultOnly",
		CPF:                     "39053344705",
		RG:                      "RG-DEFAULT-ONLY",
		Cellular:                "11998765432",
		Email:                   "default-only@example.com",
		Country:                 "Brasil",
		StatusID:                "ref-person-status-active",
		ProfileCompletionStatus: "PERSONAL_ONLY",
	}
	otherPerson := db.Person{
		BaseModel:               db.BaseModel{ID: "person-other", CreatedAt: now, UpdatedAt: now},
		TenantID:                otherTenantID,
		FirstName:               "Other",
		LastName:                "Only",
		Nickname:                "OtherOnly",
		CPF:                     "93541134780",
		RG:                      "RG-OTHER-ONLY",
		Cellular:                "11987654321",
		Email:                   "other-only@example.com",
		Country:                 "Brasil",
		StatusID:                "ref-person-status-active",
		ProfileCompletionStatus: "PERSONAL_ONLY",
	}
	if err := database.Create(&defaultPerson).Error; err != nil {
		t.Fatalf("create default tenant person: %v", err)
	}
	if err := database.Create(&otherPerson).Error; err != nil {
		t.Fatalf("create other tenant person: %v", err)
	}

	repo := people.NewRepository(database)
	otherRows, otherTotal, err := repo.List(ctx, otherTenantID, people.PersonListFilter{})
	if err != nil {
		t.Fatalf("list other tenant People: %v", err)
	}
	if otherTotal != 1 || len(otherRows) != 1 || otherRows[0].ID != otherPerson.ID {
		t.Fatalf("expected only other tenant Person, got total=%d rows=%+v", otherTotal, otherRows)
	}

	otherSearchRows, otherSearchTotal, err := repo.List(ctx, otherTenantID, people.PersonListFilter{Search: defaultPerson.Nickname})
	if err != nil {
		t.Fatalf("search other tenant People using default-only nickname: %v", err)
	}
	if otherSearchTotal != 0 || len(otherSearchRows) != 0 {
		t.Fatalf(
			"expected default tenant Person search match to remain unavailable through other tenant, got total=%d rows=%+v",
			otherSearchTotal,
			otherSearchRows,
		)
	}

	defaultRows, defaultTotal, err := repo.List(ctx, db.DefaultTenantID, people.PersonListFilter{})
	if err != nil {
		t.Fatalf("list default tenant People: %v", err)
	}
	if defaultTotal != 1 || len(defaultRows) != 1 || defaultRows[0].ID != defaultPerson.ID {
		t.Fatalf("expected only default tenant Person, got total=%d rows=%+v", defaultTotal, defaultRows)
	}

	if _, err := repo.FindByID(ctx, otherTenantID, defaultPerson.ID); err == nil {
		t.Fatal("expected default tenant Person to be unavailable through other tenant")
	}

	defaultPerson.Nickname = "CrossTenantUpdate"
	if err := repo.Update(ctx, otherTenantID, &defaultPerson); err == nil {
		t.Fatal("expected cross-tenant update to be rejected")
	}
	var persisted db.Person
	if err := database.First(&persisted, "id = ?", defaultPerson.ID).Error; err != nil {
		t.Fatalf("reload default tenant Person: %v", err)
	}
	if persisted.Nickname == "CrossTenantUpdate" {
		t.Fatal("expected other tenant update not to modify default tenant Person")
	}
}
