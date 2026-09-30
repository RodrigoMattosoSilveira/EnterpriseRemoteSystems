package collaborators

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
)

func TestJourneyBonusAwardsRequireDifferentTenantAdministratorAndSupportMultipleUnits(t *testing.T) {
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
		{BaseModel: db.BaseModel{ID: "gold", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "value_unit", Code: "GOLD_GRAM", Label: "Gold gram", Active: true},
	}
	for i := range refs {
		must(&refs[i])
	}
	person := db.GlobalPerson{BaseModel: db.BaseModel{ID: "person-1", CreatedAt: now, UpdatedAt: now}, FirstName: "Ana", LastName: "Silva", Nickname: "Ana", CPF: "11144477735", RG: "RG1", Cellular: "+5511999999999", Email: "ana@example.test", Country: "Brasil", OperationalActive: true}
	must(&person)
	membership := db.PersonTenantMembership{BaseModel: db.BaseModel{ID: "membership-1", CreatedAt: now, UpdatedAt: now}, TenantID: "default", PersonID: person.ID, StatusID: "person-active"}
	must(&membership)
	membershipID := membership.ID
	journey := db.CollaboratorJourney{BaseModel: db.BaseModel{ID: "journey-1", CreatedAt: now, UpdatedAt: now}, TenantID: "default", MembershipID: &membershipID, JourneyStartDate: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), DefaultEndDate: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC), ProjectedEndDate: time.Date(2026, 11, 30, 0, 0, 0, 0, time.UTC), PaymentMethodID: "method", PaymentValue: 100, DailyBRLAmount: ptrFloat(100), PlanningAvailability: "ACTIVE", SectorID: "sector", LocationID: "location", TaskID: "task", StatusID: "collab-active"}
	must(&journey)

	svc := NewService(NewRepository(database))
	ctx := tenantctx.WithTenantID(context.Background(), "default")
	brlAward, err := svc.CreateJourneyBonusAward(ctx, journey.ID, CreateJourneyBonusAwardRequest{ValueUnitCode: "BRL", Amount: 750, EffectiveDate: "2026-09-29", Description: "Retention bonus"}, "actor-admin-a", "admin-a@example.test")
	if err != nil {
		t.Fatalf("create BRL award: %v", err)
	}
	if brlAward.Status != "PENDING_APPROVAL" {
		t.Fatalf("expected pending award, got %+v", brlAward)
	}
	if _, err := svc.ApproveJourneyBonusAward(ctx, journey.ID, brlAward.ID, "actor-admin-a", "admin-a@example.test"); err == nil {
		t.Fatal("requesting Tenant Administrator must not approve the same award")
	}
	postedBRL, err := svc.ApproveJourneyBonusAward(ctx, journey.ID, brlAward.ID, "actor-admin-b", "admin-b@example.test")
	if err != nil {
		t.Fatalf("approve BRL award: %v", err)
	}
	if postedBRL.Status != "POSTED" || postedBRL.LedgerEntryID == "" {
		t.Fatalf("BRL award not posted: %+v", postedBRL)
	}

	goldAward, err := svc.CreateJourneyBonusAward(ctx, journey.ID, CreateJourneyBonusAwardRequest{ValueUnitCode: "GOLD_GRAM", Amount: 1.25, EffectiveDate: "2026-09-29", Description: "Safety milestone"}, "actor-admin-a", "admin-a@example.test")
	if err != nil {
		t.Fatalf("create gold award: %v", err)
	}
	postedGold, err := svc.ApproveJourneyBonusAward(ctx, journey.ID, goldAward.ID, "actor-admin-b", "admin-b@example.test")
	if err != nil {
		t.Fatalf("approve gold award: %v", err)
	}

	var entries []db.LedgerEntry
	if err := database.Where("collaborator_id = ? AND source_type = ?", journey.ID, "JOURNEY_BONUS").Order("amount DESC").Find(&entries).Error; err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected two independent bonus credits, got %+v", entries)
	}
	byUnit := map[string]db.LedgerEntry{}
	for _, entry := range entries {
		var unit db.ReferenceData
		if err := database.First(&unit, "id = ?", entry.ValueUnitID).Error; err != nil {
			t.Fatal(err)
		}
		byUnit[unit.Code] = entry
		if entry.EntryType != "EARNING_CREDIT" || entry.Direction != "CREDIT" || entry.PersonID != person.ID || entry.SourceID == journey.ID {
			t.Fatalf("unexpected bonus ledger provenance: %+v", entry)
		}
	}
	if byUnit["BRL"].Amount != 750 || byUnit["GOLD_GRAM"].Amount != 1.25 {
		t.Fatalf("unexpected bonus amounts: %+v", byUnit)
	}
	if postedGold.Status != "POSTED" || postedGold.ApprovedByActorID != "actor-admin-b" {
		t.Fatalf("unexpected gold approval: %+v", postedGold)
	}
	if _, err := svc.ApproveJourneyBonusAward(ctx, journey.ID, brlAward.ID, "actor-admin-b", "admin-b@example.test"); err == nil {
		t.Fatal("posted award must not be approved twice")
	}

	awards, err := svc.ListJourneyBonusAwards(ctx, journey.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(awards) != 2 {
		t.Fatalf("expected durable award history, got %+v", awards)
	}
}
