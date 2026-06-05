package people_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

func TestRepositoryUniqueConflictsAreScopedByTenant(t *testing.T) {
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
	if conflicts["cpf"] {
		t.Fatalf("expected same CPF in another tenant not to conflict in default tenant: %+v", conflicts)
	}

	defaultTenantPerson := db.Person{
		BaseModel:               db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                db.DefaultTenantID,
		FirstName:               "Default",
		LastName:                "CPF",
		Nickname:                "DefaultCPF",
		CPF:                     otherTenantPerson.CPF,
		RG:                      "RG-DEFAULT-001",
		Cellular:                "11991234567",
		Email:                   "same-cpf-default@example.com",
		Country:                 "Brasil",
		StatusID:                "ref-person-status-active",
		ProfileCompletionStatus: "PERSONAL_ONLY",
		CanCreateCollaborator:   false,
	}
	if err := database.Create(&defaultTenantPerson).Error; err != nil {
		t.Fatalf("create default tenant person: %v", err)
	}

	conflicts, err = repo.UniqueConflicts(ctx, db.DefaultTenantID, otherTenantPerson.CPF, "RG-NEW-001", "11995554444", "new-default@example.com", nil, nil)
	if err != nil {
		t.Fatalf("check same tenant conflicts: %v", err)
	}
	if !conflicts["cpf"] {
		t.Fatalf("expected same CPF in default tenant to conflict: %+v", conflicts)
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
