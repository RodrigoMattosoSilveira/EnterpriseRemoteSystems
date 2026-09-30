package collaborators

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
)

func TestJourneyExtensionRequiresCollaboratorAcceptance(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "journey-extension.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	now := time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	tenant := db.Tenant{BaseModel: db.BaseModel{ID: "default", CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default", Active: true}
	if err := database.Create(&tenant).Error; err != nil {
		t.Fatal(err)
	}
	refs := []db.ReferenceData{
		{BaseModel: db.BaseModel{ID: "person-active", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "person_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "method", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "method", Code: "DAILY_BRL", Label: "Daily", Active: true},
		{BaseModel: db.BaseModel{ID: "sector", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "sector", Code: "MINING", Label: "Mining", Active: true},
		{BaseModel: db.BaseModel{ID: "location", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "location", Code: "MINE", Label: "Mine", Active: true},
		{BaseModel: db.BaseModel{ID: "task", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "task", Code: "MINER", Label: "Miner", Active: true},
		{BaseModel: db.BaseModel{ID: "collab-active", CreatedAt: now, UpdatedAt: now}, TenantID: "default", Type: "collaborator_status", Code: "ACTIVE", Label: "Active", Active: true},
	}
	for i := range refs {
		if err := database.Create(&refs[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	person := db.GlobalPerson{BaseModel: db.BaseModel{ID: "person-1", CreatedAt: now, UpdatedAt: now}, FirstName: "Ana", LastName: "Silva", Nickname: "Ana", CPF: "11144477735", RG: "RG1", Cellular: "+5511999999999", Email: "ana@example.test", Country: "Brasil", OperationalActive: true}
	if err := database.Create(&person).Error; err != nil {
		t.Fatal(err)
	}
	membership := db.PersonTenantMembership{BaseModel: db.BaseModel{ID: "membership-1", CreatedAt: now, UpdatedAt: now}, TenantID: "default", PersonID: person.ID, StatusID: "person-active"}
	if err := database.Create(&membership).Error; err != nil {
		t.Fatal(err)
	}
	membershipID := membership.ID
	end := time.Date(2026, 12, 28, 0, 0, 0, 0, time.UTC)
	journey := db.CollaboratorJourney{BaseModel: db.BaseModel{ID: "journey-1", CreatedAt: now, UpdatedAt: now}, TenantID: "default", MembershipID: &membershipID, JourneyStartDate: time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC), DefaultEndDate: end, ProjectedEndDate: end, PaymentMethodID: "method", PaymentValue: 100, DailyBRLAmount: ptrFloat(100), PlanningAvailability: "ACTIVE", SectorID: "sector", LocationID: "location", TaskID: "task", StatusID: "collab-active"}
	if err := database.Create(&journey).Error; err != nil {
		t.Fatal(err)
	}

	svc := NewService(NewRepository(database))
	ctx := tenantctx.WithTenantID(context.Background(), "default")
	proposal, err := svc.ExtendJourney(ctx, journey.ID, ExtendCollaboratorJourneyRequest{AdditionalDays: 7, Reason: "Finish the current assignment"}, "tenant-admin@example.test")
	if err != nil {
		t.Fatalf("propose extension: %v", err)
	}
	if proposal.Status != "PENDING" || proposal.PreviousEndDate != "2026-12-28" || proposal.ProposedEndDate != "2027-01-04" {
		t.Fatalf("unexpected proposal: %+v", proposal)
	}
	current, _ := svc.GetByID(ctx, journey.ID)
	if current.ProjectedEndDate != "2026-12-28" || current.ExtensionDays != 0 {
		t.Fatalf("pending proposal changed journey: %+v", current)
	}
	if _, err := svc.AcceptExtensionRequest(ctx, journey.ID, proposal.ID, "other-journey", "other@example.test"); !errors.Is(err, authz.ErrForbidden) {
		t.Fatalf("expected wrong Collaborator forbidden, got %v", err)
	}
	accepted, err := svc.AcceptExtensionRequest(ctx, journey.ID, proposal.ID, journey.ID, "ana@example.test")
	if err != nil {
		t.Fatalf("accept extension: %v", err)
	}
	if accepted.Status != "ACCEPTED" || accepted.AcceptedBy != "ana@example.test" {
		t.Fatalf("unexpected accepted evidence: %+v", accepted)
	}
	current, _ = svc.GetByID(ctx, journey.ID)
	if current.ProjectedEndDate != "2027-01-04" || current.ExtensionDays != 7 {
		t.Fatalf("accepted extension not applied: %+v", current)
	}
	if _, err := svc.AcceptExtensionRequest(ctx, journey.ID, proposal.ID, journey.ID, "ana@example.test"); err == nil {
		t.Fatal("accepted evidence must be immutable")
	}

	rejectedProposal, err := svc.ExtendJourney(ctx, journey.ID, ExtendCollaboratorJourneyRequest{AdditionalDays: 3, Reason: "Optional follow-up"}, "tenant-admin@example.test")
	if err != nil {
		t.Fatalf("second proposal: %v", err)
	}
	rejected, err := svc.RejectExtensionRequest(ctx, journey.ID, rejectedProposal.ID, journey.ID, "ana@example.test")
	if err != nil {
		t.Fatalf("reject extension: %v", err)
	}
	if rejected.Status != "REJECTED" {
		t.Fatalf("unexpected rejected evidence: %+v", rejected)
	}
	current, _ = svc.GetByID(ctx, journey.ID)
	if current.ProjectedEndDate != "2027-01-04" || current.ExtensionDays != 7 {
		t.Fatal("rejected extension changed Journey")
	}
	history, err := svc.ListSelfExtensionRequests(ctx, journey.ID, membership.ID)
	if err != nil {
		t.Fatalf("list self extension history: %v", err)
	}
	if len(history) != 2 || history[0].Status != "REJECTED" || history[1].Status != "ACCEPTED" {
		t.Fatalf("unexpected self extension history: %+v", history)
	}
}

func ptrFloat(value float64) *float64 { return &value }
