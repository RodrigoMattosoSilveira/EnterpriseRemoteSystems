package people_test

import (
	"context"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
)

func TestGlobalPersonMembershipFoundationSharesIdentityWithoutSharingTenantState(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()

	ctx := context.Background()
	repo := people.NewRepository(database)
	svc := people.NewService(repo)

	created, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "Maria", LastName: "Silva", Nickname: "Mari",
		CPF: "39053344705", RG: "RG-39053", Cellular: "11987654321", Email: "maria.global@example.com",
		StatusID: "ref-person-status-active", Notes: "Default tenant note",
	}, "tenant-admin-a")
	if err != nil {
		t.Fatalf("create default membership person: %v", err)
	}
	if created.GlobalPersonID == "" || created.MembershipID == "" {
		t.Fatalf("expected global person and membership ids, got %+v", created)
	}

	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{
		BaseModel: db.BaseModel{ID: "tenant-b", CreatedAt: now, UpdatedAt: now},
		Code:      "TENANT_B", Name: "Tenant B", Active: true,
	}).Error; err != nil {
		t.Fatalf("create tenant B: %v", err)
	}
	if err := db.SeedTenantData(database, "tenant-b"); err != nil {
		t.Fatalf("seed tenant B: %v", err)
	}
	var tenantBStatus db.ReferenceData
	if err := database.First(&tenantBStatus, "tenant_id = ? AND type = ? AND code = ?", "tenant-b", "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find tenant B person status: %v", err)
	}

	wildcardRows, wildcardTotal, err := svc.SearchGlobal(ctx, "tenant-b", people.GlobalPersonSearchFilter{Search: "%%%"})
	if err != nil {
		t.Fatalf("search global people with wildcard literals: %v", err)
	}
	if wildcardTotal != 0 || len(wildcardRows) != 0 {
		t.Fatalf("expected LIKE wildcard characters to be treated literally, total=%d rows=%+v", wildcardTotal, wildcardRows)
	}

	globalRows, total, err := svc.SearchGlobal(ctx, "tenant-b", people.GlobalPersonSearchFilter{Search: "MARIA.GLOBAL@EXAMPLE.COM"})
	if err != nil {
		t.Fatalf("search global people by normalized email: %v", err)
	}
	if total != 1 || len(globalRows) != 1 || globalRows[0].ID != created.GlobalPersonID {
		t.Fatalf("expected Maria global identity by email for tenant B, total=%d rows=%+v", total, globalRows)
	}

	globalRows, total, err = svc.SearchGlobal(ctx, "tenant-b", people.GlobalPersonSearchFilter{Search: "39053344705"})
	if err != nil {
		t.Fatalf("search global people: %v", err)
	}
	if total != 1 || len(globalRows) != 1 || globalRows[0].ID != created.GlobalPersonID {
		t.Fatalf("expected Maria global identity for tenant B, total=%d rows=%+v", total, globalRows)
	}

	second, err := svc.CreateMembership(ctx, "tenant-b", people.CreatePersonMembershipRequest{
		PersonID: created.GlobalPersonID, StatusID: tenantBStatus.ID, Notes: "Tenant B private note",
	}, "tenant-admin-b")
	if err != nil {
		t.Fatalf("create tenant B membership: %v", err)
	}
	if second.ID == created.ID {
		t.Fatal("expected separate legacy compatibility projection ids")
	}
	if second.GlobalPersonID != created.GlobalPersonID {
		t.Fatalf("expected shared global person %q, got %q", created.GlobalPersonID, second.GlobalPersonID)
	}

	globalRows, total, err = svc.SearchGlobal(ctx, "tenant-b", people.GlobalPersonSearchFilter{Search: "39053344705"})
	if err != nil {
		t.Fatalf("search global people after membership: %v", err)
	}
	if total != 0 || len(globalRows) != 0 {
		t.Fatalf("expected current tenant members excluded from global add search, total=%d rows=%+v", total, globalRows)
	}

	updated, err := svc.Update(ctx, "tenant-b", second.ID, people.UpdatePersonRequest{
		FirstName: "Maria", LastName: "Santos", Nickname: "Mari",
		CPF: "39053344705", RG: "RG-39053", Cellular: "11987654321", Email: "maria.global@example.com",
		Country: "Brasil", StatusID: tenantBStatus.ID, Notes: "Tenant B changed private note",
	}, "tenant-admin-b")
	if err != nil {
		t.Fatalf("update tenant B person: %v", err)
	}
	if updated.LastName != "Santos" {
		t.Fatalf("expected updated global last name, got %q", updated.LastName)
	}

	defaultView, err := svc.GetByID(ctx, db.DefaultTenantID, created.ID)
	if err != nil {
		t.Fatalf("reload default tenant view: %v", err)
	}
	if defaultView.LastName != "Santos" {
		t.Fatalf("expected global update visible in default tenant, got %q", defaultView.LastName)
	}
	if defaultView.Notes != "Default tenant note" {
		t.Fatalf("expected default tenant private notes preserved, got %q", defaultView.Notes)
	}
	if defaultView.StatusID != "ref-person-status-active" {
		t.Fatalf("expected default tenant status preserved, got %q", defaultView.StatusID)
	}

	listed, total, err := svc.List(ctx, db.DefaultTenantID, people.PersonListFilter{Search: "Santos"})
	if err != nil {
		t.Fatalf("search default tenant by updated global name: %v", err)
	}
	if total != 1 || len(listed) != 1 || listed[0].ID != created.ID {
		t.Fatalf("expected authoritative global name in tenant list search, total=%d rows=%+v", total, listed)
	}

	listed, total, err = svc.List(ctx, db.DefaultTenantID, people.PersonListFilter{Search: "Silva"})
	if err != nil {
		t.Fatalf("search default tenant by stale legacy name: %v", err)
	}
	if total != 0 || len(listed) != 0 {
		t.Fatalf("expected stale legacy global fields excluded from tenant list search, total=%d rows=%+v", total, listed)
	}
}

func TestCreatePersonRejectsGlobalIdentityDuplicateAcrossTenants(t *testing.T) {
	database, cleanup := newRepositoryTestDB(t)
	defer cleanup()

	ctx := context.Background()
	svc := people.NewService(people.NewRepository(database))
	_, err := svc.Create(ctx, db.DefaultTenantID, people.CreatePersonRequest{
		FirstName: "Maria", LastName: "Silva", Nickname: "Mari",
		CPF: "39053344705", RG: "RG-39053", Cellular: "11987654321", Email: "maria.global@example.com",
		StatusID: "ref-person-status-active",
	}, "tenant-admin-a")
	if err != nil {
		t.Fatalf("create first global person: %v", err)
	}

	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: "tenant-b", CreatedAt: now, UpdatedAt: now}, Code: "TENANT_B", Name: "Tenant B", Active: true}).Error; err != nil {
		t.Fatalf("create tenant B: %v", err)
	}
	if err := db.SeedTenantData(database, "tenant-b"); err != nil {
		t.Fatalf("seed tenant B: %v", err)
	}
	var status db.ReferenceData
	if err := database.First(&status, "tenant_id = ? AND type = ? AND code = ?", "tenant-b", "person_status", "ACTIVE").Error; err != nil {
		t.Fatalf("find tenant B status: %v", err)
	}

	_, err = svc.Create(ctx, "tenant-b", people.CreatePersonRequest{
		FirstName: "Maria", LastName: "Duplicate", Nickname: "Mari2",
		CPF: "39053344705", RG: "RG-NEW02", Cellular: "11995554444", Email: "maria.other@example.com",
		StatusID: status.ID,
	}, "tenant-admin-b")
	if err == nil {
		t.Fatal("expected duplicate global CPF to be rejected; tenant B must create a Membership instead")
	}
	validation, ok := people.IsValidationError(err)
	if !ok || validation.Fields["cpf"] != "CPF already exists" {
		t.Fatalf("expected global CPF validation error, got %v", err)
	}
}
