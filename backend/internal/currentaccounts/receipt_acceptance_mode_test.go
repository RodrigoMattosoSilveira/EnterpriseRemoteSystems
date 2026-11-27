package currentaccounts

import (
	"context"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

// seedExpenseDebitReceipt creates an expense debit ledger entry and its receipt
// directly, with hooks skipped so the test controls the receipt status.
func seedExpenseDebitReceipt(t *testing.T, database *gorm.DB, status string) (ledgerEntryID string) {
	t.Helper()
	collaboratorID, valueUnitID, personID := seedReceiptBackfillDependencies(t, database)
	now := time.Now().UTC()
	entry := db.LedgerEntry{
		BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:       defaultTenantID,
		PersonID:       personID,
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
		t.Fatalf("seed expense debit entry: %v", err)
	}
	receiptNumber := "RCP-" + ids.New()[:8]
	receipt := db.LedgerReceipt{
		BaseModel:        db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:         defaultTenantID,
		PersonID:         personID,
		CollaboratorID:   collaboratorID,
		LedgerEntryID:    entry.ID,
		ReceiptNumber:    &receiptNumber,
		ReceiptType:      "LEDGER_DEBIT",
		ReceiptPurpose:   "LEDGER_DEBIT",
		PaymentDirection: "ACCOUNT_DEBIT",
		AcceptingParty:   "COLLABORATOR",
		Status:           status,
	}
	if status != "PENDING_ISSUE" {
		receipt.IssuedAt = &now
		receipt.IssuedBy = "expense-admin@example.com"
	}
	if status == "PRINTED" {
		receipt.PrintedAt = &now
	}
	if err := database.Session(&gorm.Session{SkipHooks: true}).Create(&receipt).Error; err != nil {
		t.Fatalf("seed expense debit receipt: %v", err)
	}
	return entry.ID
}

func seedReceiptModeSetting(t *testing.T, database *gorm.DB, mode string) {
	t.Helper()
	now := time.Now().UTC()
	row := db.ReferenceData{
		BaseModel:    db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:     defaultTenantID,
		Type:         receiptAcceptanceModeReferenceType,
		Code:         receiptAcceptanceScopeExpenseDebit,
		Label:        "Expense receipts",
		Active:       true,
		MetadataJSON: `{"mode":"` + mode + `"}`,
	}
	if err := database.Create(&row).Error; err != nil {
		t.Fatalf("seed acceptance mode %s: %v", mode, err)
	}
}

func receiptModeTestContext() context.Context {
	return tenantctx.WithTenantID(context.Background(), defaultTenantID)
}

func TestExpenseReceiptAcceptedElectronicallyByDefaultAndRecordsClientEvidence(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	entryID := seedExpenseDebitReceipt(t, database, "ISSUED")
	svc := NewService(NewRepository(database), "", "")
	ctx := WithReceiptClientInfo(receiptModeTestContext(), ReceiptClientInfo{IP: "203.0.113.7", UserAgent: "TestAgent/1.0"})

	accepted, err := svc.AcceptReceipt(ctx, entryID, "collaborator@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true})
	if err != nil {
		t.Fatalf("accept expense receipt with default mode: %v", err)
	}
	if accepted.AcceptanceMethod != receiptAcceptanceMethodInApp || accepted.Status != "RETURNED" {
		t.Fatalf("unexpected accepted receipt: method=%q status=%q", accepted.AcceptanceMethod, accepted.Status)
	}
	var receipt db.LedgerReceipt
	if err := database.First(&receipt, "ledger_entry_id = ?", entryID).Error; err != nil {
		t.Fatalf("reload receipt: %v", err)
	}
	var evidence db.LedgerReceiptAcceptanceEvidence
	if err := database.First(&evidence, "receipt_id = ?", receipt.ID).Error; err != nil {
		t.Fatalf("acceptance evidence row missing: %v", err)
	}
	if evidence.AcceptedIP != "203.0.113.7" || evidence.AcceptedUserAgent != "TestAgent/1.0" {
		t.Fatalf("client evidence not recorded: ip=%q ua=%q", evidence.AcceptedIP, evidence.AcceptedUserAgent)
	}
}

func TestExpenseReceiptPaperOnlyBlocksAcceptanceButAllowsPaperReturn(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	entryID := seedExpenseDebitReceipt(t, database, "PRINTED")
	seedReceiptModeSetting(t, database, "PAPER_ONLY")
	svc := NewService(NewRepository(database), "", "")
	ctx := receiptModeTestContext()

	if _, err := svc.AcceptReceipt(ctx, entryID, "collaborator@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true}); err != ErrReceiptAcceptanceModeBlocked {
		t.Fatalf("expected PAPER_ONLY to block acceptance, got %v", err)
	}
	if _, err := svc.ReturnReceipt(ctx, entryID, "operator@example.com", ReturnReceiptRequest{SignedDocumentRef: "scan-001"}); err != nil {
		t.Fatalf("expected paper return under PAPER_ONLY: %v", err)
	}
}

func TestExpenseReceiptElectronicOnlyBlocksPaperReturnButAllowsAcceptance(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	paperEntryID := seedExpenseDebitReceipt(t, database, "PRINTED")
	seedReceiptModeSetting(t, database, "ELECTRONIC_ONLY")
	svc := NewService(NewRepository(database), "", "")
	ctx := receiptModeTestContext()

	if _, err := svc.ReturnReceipt(ctx, paperEntryID, "operator@example.com", ReturnReceiptRequest{SignedDocumentRef: "scan-001"}); err != ErrReceiptReturnModeBlocked {
		t.Fatalf("expected ELECTRONIC_ONLY to block paper return, got %v", err)
	}
	if _, err := svc.AcceptReceipt(ctx, paperEntryID, "collaborator@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true}); err != nil {
		t.Fatalf("expected acceptance under ELECTRONIC_ONLY: %v", err)
	}
}

func TestExpenseReceiptMustBeIssuedBeforeAcceptance(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	entryID := seedExpenseDebitReceipt(t, database, "PENDING_ISSUE")
	svc := NewService(NewRepository(database), "", "")

	if _, err := svc.AcceptReceipt(receiptModeTestContext(), entryID, "collaborator@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true}); err != ErrReceiptNotIssued {
		t.Fatalf("expected pending receipt to be refused, got %v", err)
	}
}

func TestReceiptAcceptanceModeRejectsUnknownValue(t *testing.T) {
	database := newReceiptBackfillTestDB(t)
	entryID := seedExpenseDebitReceipt(t, database, "ISSUED")
	seedReceiptModeSetting(t, database, "SOMETIMES")
	svc := NewService(NewRepository(database), "", "")

	if _, err := svc.AcceptReceipt(receiptModeTestContext(), entryID, "collaborator@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true}); err != ErrReceiptAcceptanceModeInvalid {
		t.Fatalf("expected invalid mode to be refused, got %v", err)
	}
}
