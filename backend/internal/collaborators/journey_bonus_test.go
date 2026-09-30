package collaborators

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
)

func TestJourneyBonusPostsOnceIntoCurrentAccount(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "journey-bonus.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	must := func(v any) {
		if err := database.Create(v).Error; err != nil {
			t.Fatal(err)
		}
	}
	must(&db.Tenant{BaseModel: db.BaseModel{ID: "default", CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default", Active: true})
	refs := []db.ReferenceData{
		{BaseModel: db.BaseModel{ID: "person-active", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "person_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "method", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "method", Code: "DAILY_BRL", Label: "Daily", Active: true},
		{BaseModel: db.BaseModel{ID: "sector", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "sector", Code: "MINING", Label: "Mining", Active: true},
		{BaseModel: db.BaseModel{ID: "location", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "location", Code: "MINE", Label: "Mine", Active: true},
		{BaseModel: db.BaseModel{ID: "task", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "task", Code: "MINER", Label: "Miner", Active: true},
		{BaseModel: db.BaseModel{ID: "collab-active", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "collaborator_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "brl", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "value_unit", Code: "BRL", Label: "BRL", Active: true},
	}
	for i := range refs {
		must(&refs[i])
	}
	person := db.GlobalPerson{BaseModel: db.BaseModel{ID: "person-1", CreatedAt: now, UpdatedAt: now}, FirstName: "Ana", LastName: "Silva", Nickname: "Ana", CPF: "11144477735", RG: "RG1", Cellular: "+5511999999999", Email: "ana@example.test", Country: "Brasil", OperationalActive: true}
	must(&person)
	membership := db.PersonTenantMembership{BaseModel: db.BaseModel{ID: "membership-1", CreatedAt: now, UpdatedAt: now}, TenantID: "default", PersonID: person.ID, StatusID: "person-active"}
	must(&membership)
	membershipID := membership.ID
	bonus := 750.0
	journey := db.CollaboratorJourney{BaseModel: db.BaseModel{ID: "journey-1", CreatedAt: now, UpdatedAt: now}, TenantID: "default", MembershipID: &membershipID, JourneyStartDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), DefaultEndDate: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC), ProjectedEndDate: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC), PaymentMethodID: "method", PaymentValue: 100, DailyBRLAmount: ptrFloat(100), BonusBRLAmount: &bonus, BonusDescription: "Retention bonus", PlanningAvailability: "ACTIVE", SectorID: "sector", LocationID: "location", TaskID: "task", StatusID: "collab-active"}
	must(&journey)
	svc := NewService(NewRepository(database))
	ctx := tenantctx.WithTenantID(context.Background(), "default")
	got, err := svc.PostJourneyBonus(ctx, journey.ID, PostJourneyBonusRequest{EffectiveDate: "2026-09-29"}, "tenant-admin@example.test")
	if err != nil {
		t.Fatalf("post bonus: %v", err)
	}
	if got.BonusPostedAt == "" || got.BonusLedgerEntryID == "" {
		t.Fatalf("bonus not marked posted: %+v", got)
	}
	var entry db.LedgerEntry
	if err := database.First(&entry, "id = ?", got.BonusLedgerEntryID).Error; err != nil {
		t.Fatal(err)
	}
	if entry.EntryType != "EARNING_CREDIT" || entry.Direction != "CREDIT" || entry.Amount != 750 || entry.SourceType != "JOURNEY_BONUS" || entry.PersonID != person.ID {
		t.Fatalf("unexpected bonus ledger entry: %+v", entry)
	}
	if _, err := svc.PostJourneyBonus(ctx, journey.ID, PostJourneyBonusRequest{EffectiveDate: "2026-09-30"}, "tenant-admin@example.test"); err == nil {
		t.Fatal("bonus must not post twice")
	}
	update := UpdateCollaboratorRequest{PaymentMethodID: "method", PaymentValue: 100, DailyBRLAmount: ptrFloat(100), BonusBRLAmount: ptrFloat(800), BonusDescription: "changed", PlanningAvailability: "ACTIVE", SectorID: "sector", LocationID: "location", TaskID: "task"}
	if _, err := svc.Update(ctx, journey.ID, update, "tenant-admin@example.test"); err == nil {
		t.Fatal("posted bonus must be immutable")
	}
}
