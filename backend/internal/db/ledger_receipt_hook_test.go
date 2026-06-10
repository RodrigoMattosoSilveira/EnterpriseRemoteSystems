package db

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

func TestDebitLedgerEntryCreatesPendingReceipt(t *testing.T) {
	database := newLedgerReceiptTestDB(t)
	collaboratorID, valueUnitID := seedLedgerReceiptTestDependencies(t, database)
	now := time.Now().UTC()
	entry := LedgerEntry{
		BaseModel: BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:  DefaultTenantID, CollaboratorID: collaboratorID,
		ValueUnitID: valueUnitID, EntryType: "EXPENSE_DEDUCTION",
		Direction: "DEBIT", Amount: 125, EffectiveDate: now,
		SourceType: "EXPENSE", SourceID: ids.New(), Active: true,
		CorrectionType: "ORIGINAL",
	}

	if err := database.Create(&entry).Error; err != nil {
		t.Fatalf("create debit ledger entry: %v", err)
	}

	var receipt LedgerReceipt
	if err := database.First(&receipt, "ledger_entry_id = ?", entry.ID).Error; err != nil {
		t.Fatalf("find generated receipt: %v", err)
	}
	if receipt.Status != "PENDING_ISSUE" {
		t.Fatalf("expected PENDING_ISSUE, got %q", receipt.Status)
	}
	if receipt.ReceiptType != "LEDGER_DEBIT" {
		t.Fatalf("expected LEDGER_DEBIT, got %q", receipt.ReceiptType)
	}
	if receipt.ReceiptNumber == nil || !strings.HasPrefix(*receipt.ReceiptNumber, "RCP-") {
		t.Fatalf("expected generated receipt number, got %#v", receipt.ReceiptNumber)
	}
	if receipt.CollaboratorID != collaboratorID || receipt.TenantID != DefaultTenantID {
		t.Fatalf("receipt scope does not match ledger entry: %#v", receipt)
	}
}

func TestCreditLedgerEntryDoesNotCreateReceipt(t *testing.T) {
	database := newLedgerReceiptTestDB(t)
	collaboratorID, valueUnitID := seedLedgerReceiptTestDependencies(t, database)
	now := time.Now().UTC()
	entry := LedgerEntry{
		BaseModel: BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:  DefaultTenantID, CollaboratorID: collaboratorID,
		ValueUnitID: valueUnitID, EntryType: "EARNING_CREDIT",
		Direction: "CREDIT", Amount: 125, EffectiveDate: now,
		SourceType: "ACCRUAL_ITEM", SourceID: ids.New(), Active: true,
		CorrectionType: "ORIGINAL",
	}

	if err := database.Create(&entry).Error; err != nil {
		t.Fatalf("create credit ledger entry: %v", err)
	}

	var count int64
	if err := database.Model(&LedgerReceipt{}).Where("ledger_entry_id = ?", entry.ID).Count(&count).Error; err != nil {
		t.Fatalf("count receipts: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected no receipt for credit entry, got %d", count)
	}
}

func newLedgerReceiptTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := Open(filepath.Join(t.TempDir(), "ledger-receipt.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	return database
}

func seedLedgerReceiptTestDependencies(t *testing.T, database *gorm.DB) (string, string) {
	t.Helper()
	now := time.Now().UTC()
	tenant := Tenant{BaseModel: BaseModel{ID: DefaultTenantID, CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default Tenant", Active: true}
	if err := database.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}

	refs := []ReferenceData{
		{BaseModel: BaseModel{ID: "ref-payment-daily", CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, Type: "payment_method", Code: "DAILY_BRL", Label: "Daily BRL", Active: true},
		{BaseModel: BaseModel{ID: "ref-sector-test", CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, Type: "sector", Code: "TEST", Label: "Test Sector", Active: true},
		{BaseModel: BaseModel{ID: "ref-location-test", CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, Type: "location", Code: "TEST", Label: "Test Well", Active: true},
		{BaseModel: BaseModel{ID: "ref-task-test", CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, Type: "task", Code: "TEST", Label: "Test Task", Active: true},
		{BaseModel: BaseModel{ID: "ref-collaborator-active", CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, Type: "collaborator_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: BaseModel{ID: "ref-value-unit-brl", CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, Type: "value_unit", Code: "BRL", Label: "Brazilian Real", Active: true},
	}
	if err := database.Create(&refs).Error; err != nil {
		t.Fatalf("create reference data: %v", err)
	}

	person := Person{BaseModel: BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, FirstName: "Receipt", LastName: "Test", Nickname: "Receipt", CPF: ids.New(), RG: ids.New(), Cellular: ids.New(), Email: ids.New() + "@example.com", Country: "Brasil", StatusID: "ref-collaborator-active", ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create person: %v", err)
	}

	daily := 100.0
	collaborator := CollaboratorJourney{
		BaseModel: BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: DefaultTenantID, PersonID: person.ID,
		JourneyStartDate: now, DefaultEndDate: now.AddDate(0, 0, 90), ProjectedEndDate: now.AddDate(0, 0, 90),
		PaymentMethodID: "ref-payment-daily", PaymentValue: daily, DailyBRLAmount: &daily,
		SectorID: "ref-sector-test", LocationID: "ref-location-test", TaskID: "ref-task-test", StatusID: "ref-collaborator-active",
	}
	if err := database.Create(&collaborator).Error; err != nil {
		t.Fatalf("create collaborator: %v", err)
	}
	return collaborator.ID, "ref-value-unit-brl"
}
