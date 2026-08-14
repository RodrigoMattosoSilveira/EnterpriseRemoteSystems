package currentaccounts

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

func TestBackfillDebitLedgerReceiptsCreatesOnlyMissingReceipts(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	collaboratorID, valueUnitID := seedReceiptBackfillDependencies(t, database)
	now := time.Now().UTC()

	missing := db.LedgerEntry{
		BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:       defaultTenantID,
		CollaboratorID: collaboratorID,
		ValueUnitID:    valueUnitID,
		EntryType:      "EXPENSE_DEDUCTION",
		Direction:      "DEBIT",
		Amount:         10,
		EffectiveDate:  now,
		SourceType:     "EXPENSE",
		SourceID:       ids.New(),
		Active:         true,
		CorrectionType: "ORIGINAL",
	}
	existing := missing
	existing.ID = ids.New()
	existing.SourceID = ids.New()
	credit := missing
	credit.ID = ids.New()
	credit.SourceID = ids.New()
	credit.Direction = "CREDIT"

	if err := database.Session(&gorm.Session{SkipHooks: true}).Create(&[]db.LedgerEntry{missing, existing, credit}).Error; err != nil {
		t.Fatalf("seed ledger entries: %v", err)
	}
	existingReceiptID := ids.New()
	existingReceiptNumber := "RCP-EXISTING"
	if err := database.Create(&db.LedgerReceipt{
		BaseModel:      db.BaseModel{ID: existingReceiptID, CreatedAt: now, UpdatedAt: now},
		TenantID:       defaultTenantID,
		CollaboratorID: collaboratorID,
		LedgerEntryID:  existing.ID,
		ReceiptNumber:  &existingReceiptNumber,
		ReceiptType:    receiptTypeLedgerDebit,
		Status:         receiptStatusPendingIssue,
	}).Error; err != nil {
		t.Fatalf("seed existing receipt: %v", err)
	}

	svc := NewService(NewRepository(database), "", "")
	reason := ReceiptBackfillRequest{CorrectionReasonRequest: CorrectionReasonRequest{ReasonCode: "RECEIPT_BACKFILL", ReasonText: "Backfill historical debit ledger receipts"}}
	dryRun, err := svc.BackfillDebitLedgerReceipts(context.Background(), "receipt-admin@example.com", true, reason)
	if err != nil {
		t.Fatalf("dry-run backfill: %v", err)
	}
	if dryRun.EligibleDebitEntries != 2 || dryRun.ExistingReceipts != 1 || dryRun.MissingReceipts != 1 || dryRun.CreatedReceipts != 0 || !dryRun.DryRun {
		t.Fatalf("unexpected dry-run result: %+v", dryRun)
	}

	result, err := svc.BackfillDebitLedgerReceipts(context.Background(), "receipt-admin@example.com", false, reason)
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}
	if result.EligibleDebitEntries != 2 || result.ExistingReceipts != 1 || result.MissingReceipts != 1 || result.CreatedReceipts != 1 || result.DryRun {
		t.Fatalf("unexpected backfill result: %+v", result)
	}

	var generated db.LedgerReceipt
	if err := database.First(&generated, "ledger_entry_id = ?", missing.ID).Error; err != nil {
		t.Fatalf("find generated receipt: %v", err)
	}
	if generated.Status != receiptStatusPendingIssue || generated.ReceiptType != receiptTypeLedgerDebit || generated.ReceiptNumber == nil || !strings.HasPrefix(*generated.ReceiptNumber, receiptNumberPrefix) {
		t.Fatalf("unexpected generated receipt: %+v", generated)
	}

	second, err := svc.BackfillDebitLedgerReceipts(context.Background(), "receipt-admin@example.com", false, reason)
	if err != nil {
		t.Fatalf("second backfill: %v", err)
	}
	if second.MissingReceipts != 0 || second.CreatedReceipts != 0 || second.ExistingReceipts != 2 {
		t.Fatalf("expected idempotent second result, got %+v", second)
	}
}

func TestDebitReceiptObligationEnforcementRejectsMissingReceipt(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	collaboratorID, valueUnitID := seedReceiptBackfillDependencies(t, database)
	now := time.Now().UTC()
	entry := db.LedgerEntry{
		BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:       defaultTenantID,
		CollaboratorID: collaboratorID,
		ValueUnitID:    valueUnitID,
		EntryType:      "EXPENSE_DEDUCTION",
		Direction:      "DEBIT",
		Amount:         10,
		EffectiveDate:  now,
		SourceType:     "EXPENSE",
		SourceID:       ids.New(),
		Active:         true,
		CorrectionType: "ORIGINAL",
	}
	if err := database.Session(&gorm.Session{SkipHooks: true}).Create(&entry).Error; err != nil {
		t.Fatalf("seed ledger entry without hook-generated receipt: %v", err)
	}

	err := database.Transaction(func(tx *gorm.DB) error {
		return ensureDebitLedgerReceiptObligations(tx, &entry)
	})
	if !errors.Is(err, ErrDebitReceiptObligationMissing) {
		t.Fatalf("expected missing receipt obligation error, got %v", err)
	}
}

func TestBackfillDebitLedgerReceiptsRequiresAuthorizedBy(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	svc := NewService(NewRepository(database), "", "")
	reason := ReceiptBackfillRequest{CorrectionReasonRequest: CorrectionReasonRequest{ReasonCode: "RECEIPT_BACKFILL", ReasonText: "Backfill historical debit ledger receipts"}}
	_, err := svc.BackfillDebitLedgerReceipts(context.Background(), "   ", false, reason)
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestBackfillDebitLedgerReceiptsRequiresReason(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	svc := NewService(NewRepository(database), "", "")
	_, err := svc.BackfillDebitLedgerReceipts(context.Background(), "receipt-admin@example.com", false, ReceiptBackfillRequest{})
	if err == nil {
		t.Fatal("expected validation error")
	}
	validation, ok := err.(ValidationError)
	if !ok || validation.Fields["reasonCode"] == "" || validation.Fields["reasonText"] == "" {
		t.Fatalf("expected reason validation fields, got %#v", err)
	}
}

func newReceiptBackfillTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "receipt-backfill.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return database
}

func seedReceiptBackfillDependencies(t *testing.T, database *gorm.DB) (string, string) {
	t.Helper()
	now := time.Now().UTC()
	tenant := db.Tenant{BaseModel: db.BaseModel{ID: defaultTenantID, CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default Tenant", Active: true}
	if err := database.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	refs := []db.ReferenceData{
		{BaseModel: db.BaseModel{ID: "ref-payment-daily", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "payment_method", Code: "DAILY_BRL", Label: "Daily BRL", Active: true},
		{BaseModel: db.BaseModel{ID: "ref-sector-test", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "sector", Code: "TEST", Label: "Test Sector", Active: true},
		{BaseModel: db.BaseModel{ID: "ref-location-test", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "location", Code: "TEST", Label: "Test Well", Active: true},
		{BaseModel: db.BaseModel{ID: "ref-task-test", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "task", Code: "TEST", Label: "Test Task", Active: true},
		{BaseModel: db.BaseModel{ID: "ref-collaborator-active", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "collaborator_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "ref-value-unit-brl", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "value_unit", Code: "BRL", Label: "Brazilian Real", Active: true},
	}
	if err := database.Create(&refs).Error; err != nil {
		t.Fatalf("create reference data: %v", err)
	}
	person := db.Person{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, FirstName: "Receipt", LastName: "Backfill", Nickname: "Backfill", CPF: ids.New(), RG: ids.New(), Cellular: ids.New(), Email: ids.New() + "@example.com", Country: "Brasil", StatusID: "ref-collaborator-active", ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create person: %v", err)
	}
	daily := 100.0
	collaborator := db.CollaboratorJourney{
		BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, PersonID: person.ID,
		JourneyStartDate: now, DefaultEndDate: now.AddDate(0, 0, 90), ProjectedEndDate: now.AddDate(0, 0, 90),
		PaymentMethodID: "ref-payment-daily", PaymentValue: daily, DailyBRLAmount: &daily,
		SectorID: "ref-sector-test", LocationID: "ref-location-test", TaskID: "ref-task-test", StatusID: "ref-collaborator-active",
	}
	if err := database.Create(&collaborator).Error; err != nil {
		t.Fatalf("create collaborator: %v", err)
	}
	return collaborator.ID, "ref-value-unit-brl"
}

func TestSecondPersonApprovalPolicyDefaultsToOptionalAndCanBeUpdated(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: defaultTenantID, CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default Tenant", Active: true}).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	svc := NewService(NewRepository(database), "", "")

	initial, err := svc.GetSecondPersonApprovalPolicy(context.Background(), defaultTenantID)
	if err != nil {
		t.Fatalf("get initial policy: %v", err)
	}
	if initial.Required {
		t.Fatalf("expected initial policy to be optional, got %+v", initial)
	}

	updated, err := svc.UpdateSecondPersonApprovalPolicy(context.Background(), defaultTenantID, "tenant-admin@example.com", UpdateSecondPersonApprovalPolicyRequest{Required: true})
	if err != nil {
		t.Fatalf("update policy: %v", err)
	}
	if !updated.Required || updated.UpdatedBy != "tenant-admin@example.com" {
		t.Fatalf("expected policy to require second approval, got %+v", updated)
	}
}

func TestBackfillDebitLedgerReceiptsRequiresSecondApprovalWhenConfigured(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: defaultTenantID, CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default Tenant", Active: true}).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	svc := NewService(NewRepository(database), "", "")
	if _, err := svc.UpdateSecondPersonApprovalPolicy(context.Background(), defaultTenantID, "tenant-admin@example.com", UpdateSecondPersonApprovalPolicyRequest{Required: true}); err != nil {
		t.Fatalf("enable policy: %v", err)
	}

	reason := ReceiptBackfillRequest{CorrectionReasonRequest: CorrectionReasonRequest{ReasonCode: "RECEIPT_BACKFILL", ReasonText: "Backfill historical debit ledger receipts"}}
	_, err := svc.BackfillDebitLedgerReceipts(context.Background(), "receipt-admin@example.com", true, reason)
	validation, ok := err.(ValidationError)
	if !ok || validation.Fields["secondApproval.approvedBy"] == "" {
		t.Fatalf("expected second approval validation field, got %#v", err)
	}

	reason.SecondApproval = &SecondApprovalRequest{ApprovedBy: "tenant-admin@example.com", Notes: "Reviewed backfill request"}
	if _, err := svc.BackfillDebitLedgerReceipts(context.Background(), "receipt-admin@example.com", true, reason); err != nil {
		t.Fatalf("expected valid second approval to pass: %v", err)
	}
}
