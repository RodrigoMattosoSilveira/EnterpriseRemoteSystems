package currentaccounts

import (
	"context"
	"math"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

func TestFinalTenantPaymentSettlesPositiveJourneyBalancesAndRequiresCollaboratorAcceptance(t *testing.T) {
	database := newFinalSettlementTestDB(t)
	fixture := seedFinalSettlementJourney(t, database)
	seedFinalSettlementBalance(t, database, fixture, fixture.brlValueUnitID, "BRL", "CREDIT", 125)
	seedFinalSettlementBalance(t, database, fixture, fixture.goldValueUnitID, "GOLD_GRAM", "CREDIT", 2.75)

	ctx := tenantctx.WithTenantID(context.Background(), defaultTenantID)
	svc := NewService(NewRepository(database), "", "")
	result, err := svc.FinalTenantPayment(ctx, fixture.collaboratorID, "tenant-admin@example.com", validFinalSettlementRequest("tenant-payment-1"))
	if err != nil {
		t.Fatalf("post final Tenant payment: %v", err)
	}
	if result.Settlement.SettlementType != settlementTypeFinalTenantPayment || result.Settlement.BRLAmount != 125 || result.Settlement.GoldGramAmount != 2.75 {
		t.Fatalf("unexpected final Tenant settlement: %+v", result.Settlement)
	}
	if len(result.LedgerEntries) != 2 {
		t.Fatalf("expected two final settlement ledger entries, got %+v", result.LedgerEntries)
	}
	for _, entry := range result.LedgerEntries {
		if entry.EntryType != ledgerEntryTypeFinalSettlement || entry.Direction != "DEBIT" {
			t.Fatalf("unexpected final Tenant payment ledger entry: %+v", entry)
		}
		var receipt db.LedgerReceipt
		if err := database.First(&receipt, "ledger_entry_id = ?", entry.ID).Error; err != nil {
			t.Fatalf("find final Tenant payment receipt for %s: %v", entry.ID, err)
		}
		if receipt.ReceiptPurpose != receiptPurposeFinalTenantPayment || receipt.PaymentDirection != "TENANT_TO_COLLABORATOR" || receipt.AcceptingParty != receiptAcceptingPartyCollaborator || receipt.Status != receiptStatusPendingIssue {
			t.Fatalf("unexpected final Tenant payment receipt: %+v", receipt)
		}
	}

	balances, err := svc.ListBalances(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("list Journey balances after final Tenant payment: %v", err)
	}
	if len(balances) != 0 {
		t.Fatalf("expected final Tenant payment to zero positive Journey balances, got %+v", balances)
	}
	preview, err := svc.SettlementPreview(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("preview after final Tenant payment: %v", err)
	}
	if preview.CanClose || preview.OutstandingReceipts != 2 || !containsBlockingReason(preview.BlockingReasons, "OUTSTANDING_RECEIPTS") {
		t.Fatalf("expected receipt acceptance to block closure, got %+v", preview)
	}

	for _, entry := range result.LedgerEntries {
		accepted, err := svc.AcceptReceipt(ctx, entry.ID, "collaborator-actor@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true, Notes: "Payment received and accepted"})
		if err != nil {
			t.Fatalf("accept final Tenant payment receipt %s: %v", entry.ID, err)
		}
		if accepted.AcceptedAt == "" || accepted.AcceptedBy != "collaborator-actor@example.com" || accepted.AcceptanceMethod != receiptAcceptanceMethodInApp || accepted.Status != "RETURNED" {
			t.Fatalf("unexpected accepted Collaborator receipt: %+v", accepted)
		}
	}
	preview, err = svc.SettlementPreview(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("preview after Collaborator acceptance: %v", err)
	}
	if !preview.CanClose || preview.OutstandingReceipts != 0 || len(preview.BlockingReasons) != 0 {
		t.Fatalf("expected zero balances plus accepted receipts to allow closure, got %+v", preview)
	}
}

func TestFinalCollaboratorPaymentSettlesNegativeJourneyBalancesAndRequiresTenantAcceptance(t *testing.T) {
	database := newFinalSettlementTestDB(t)
	fixture := seedFinalSettlementJourney(t, database)
	seedFinalSettlementBalance(t, database, fixture, fixture.brlValueUnitID, "BRL", "DEBIT", 80)
	seedFinalSettlementBalance(t, database, fixture, fixture.goldValueUnitID, "GOLD_GRAM", "DEBIT", 1.25)

	ctx := tenantctx.WithTenantID(context.Background(), defaultTenantID)
	svc := NewService(NewRepository(database), "", "")
	result, err := svc.FinalCollaboratorPayment(ctx, fixture.collaboratorID, "tenant-admin@example.com", validFinalSettlementRequest("collaborator-payment-1"))
	if err != nil {
		t.Fatalf("post final Collaborator payment: %v", err)
	}
	if result.Settlement.SettlementType != settlementTypeFinalCollaboratorPayment || result.Settlement.BRLAmount != 80 || result.Settlement.GoldGramAmount != 1.25 {
		t.Fatalf("unexpected final Collaborator settlement: %+v", result.Settlement)
	}
	if len(result.LedgerEntries) != 2 {
		t.Fatalf("expected two final settlement ledger entries, got %+v", result.LedgerEntries)
	}
	for _, entry := range result.LedgerEntries {
		if entry.EntryType != ledgerEntryTypeFinalSettlement || entry.Direction != "CREDIT" {
			t.Fatalf("unexpected final Collaborator payment ledger entry: %+v", entry)
		}
		var receipt db.LedgerReceipt
		if err := database.First(&receipt, "ledger_entry_id = ?", entry.ID).Error; err != nil {
			t.Fatalf("find final Collaborator payment receipt for %s: %v", entry.ID, err)
		}
		if receipt.ReceiptPurpose != receiptPurposeFinalCollaboratorPayment || receipt.PaymentDirection != "COLLABORATOR_TO_TENANT" || receipt.AcceptingParty != receiptAcceptingPartyTenant || receipt.Status != receiptStatusPendingIssue {
			t.Fatalf("unexpected final Collaborator payment receipt: %+v", receipt)
		}
	}

	balances, err := svc.ListBalances(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("list Journey balances after final Collaborator payment: %v", err)
	}
	if len(balances) != 0 {
		t.Fatalf("expected final Collaborator payment to zero negative Journey balances, got %+v", balances)
	}
	preview, err := svc.SettlementPreview(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("preview after final Collaborator payment: %v", err)
	}
	if preview.CanClose || preview.OutstandingReceipts != 2 || !containsBlockingReason(preview.BlockingReasons, "OUTSTANDING_RECEIPTS") {
		t.Fatalf("expected Tenant receipt acceptance to block closure, got %+v", preview)
	}

	for _, entry := range result.LedgerEntries {
		accepted, err := svc.AcceptReceipt(ctx, entry.ID, "tenant-admin@example.com", receiptAcceptingPartyTenant, AcceptReceiptRequest{Confirm: true, Notes: "Tenant received and accepted repayment"})
		if err != nil {
			t.Fatalf("accept Tenant receipt %s: %v", entry.ID, err)
		}
		if accepted.AcceptedAt == "" || accepted.AcceptedBy != "tenant-admin@example.com" || accepted.AcceptanceMethod != receiptAcceptanceMethodInApp || accepted.Status != "RETURNED" {
			t.Fatalf("unexpected accepted Tenant receipt: %+v", accepted)
		}
	}
	preview, err = svc.SettlementPreview(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("preview after Tenant acceptance: %v", err)
	}
	if !preview.CanClose || preview.OutstandingReceipts != 0 || len(preview.BlockingReasons) != 0 {
		t.Fatalf("expected zero balances plus accepted Tenant receipts to allow closure, got %+v", preview)
	}
}

func TestBidirectionalFinalSettlementHandlesMixedValueUnitDirectionsIndependently(t *testing.T) {
	database := newFinalSettlementTestDB(t)
	fixture := seedFinalSettlementJourney(t, database)
	seedFinalSettlementBalance(t, database, fixture, fixture.brlValueUnitID, "BRL", "CREDIT", 100)
	seedFinalSettlementBalance(t, database, fixture, fixture.goldValueUnitID, "GOLD_GRAM", "DEBIT", 3)

	ctx := tenantctx.WithTenantID(context.Background(), defaultTenantID)
	svc := NewService(NewRepository(database), "", "")
	tenantPayment, err := svc.FinalTenantPayment(ctx, fixture.collaboratorID, "tenant-admin@example.com", validFinalSettlementRequest("mixed-tenant-payment"))
	if err != nil {
		t.Fatalf("post positive-unit final Tenant payment: %v", err)
	}
	if tenantPayment.Settlement.BRLAmount != 100 || tenantPayment.Settlement.GoldGramAmount != 0 || len(tenantPayment.LedgerEntries) != 1 || tenantPayment.LedgerEntries[0].ValueUnitCode != "BRL" {
		t.Fatalf("expected only positive BRL to be settled by Tenant, got %+v", tenantPayment)
	}
	balances, err := svc.ListBalances(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("list mixed balances after Tenant payment: %v", err)
	}
	if len(balances) != 1 || balances[0].ValueUnitCode != "GOLD_GRAM" || math.Abs(balances[0].Balance-(-3)) > 0.000000001 {
		t.Fatalf("expected only negative Gold debt to remain, got %+v", balances)
	}

	collaboratorPayment, err := svc.FinalCollaboratorPayment(ctx, fixture.collaboratorID, "tenant-admin@example.com", validFinalSettlementRequest("mixed-collaborator-payment"))
	if err != nil {
		t.Fatalf("post negative-unit final Collaborator payment: %v", err)
	}
	if collaboratorPayment.Settlement.BRLAmount != 0 || collaboratorPayment.Settlement.GoldGramAmount != 3 || len(collaboratorPayment.LedgerEntries) != 1 || collaboratorPayment.LedgerEntries[0].ValueUnitCode != "GOLD_GRAM" {
		t.Fatalf("expected only negative Gold to be settled by Collaborator, got %+v", collaboratorPayment)
	}
	balances, err = svc.ListBalances(ctx, fixture.collaboratorID)
	if err != nil {
		t.Fatalf("list mixed balances after both directions: %v", err)
	}
	if len(balances) != 0 {
		t.Fatalf("expected independent BRL and Gold settlement to reach zero, got %+v", balances)
	}
}

func TestFinalSettlementReceiptAcceptanceRejectsWrongPartyAndSecondAcceptance(t *testing.T) {
	database := newFinalSettlementTestDB(t)
	fixture := seedFinalSettlementJourney(t, database)
	seedFinalSettlementBalance(t, database, fixture, fixture.brlValueUnitID, "BRL", "CREDIT", 25)

	ctx := tenantctx.WithTenantID(context.Background(), defaultTenantID)
	svc := NewService(NewRepository(database), "", "")
	result, err := svc.FinalTenantPayment(ctx, fixture.collaboratorID, "tenant-admin@example.com", validFinalSettlementRequest("acceptance-guard-1"))
	if err != nil {
		t.Fatalf("post settlement: %v", err)
	}
	entryID := result.LedgerEntries[0].ID
	if _, err := svc.AcceptReceipt(ctx, entryID, "tenant-admin@example.com", receiptAcceptingPartyTenant, AcceptReceiptRequest{Confirm: true}); err != ErrReceiptAcceptancePartyMismatch {
		t.Fatalf("expected wrong accepting party rejection, got %v", err)
	}
	if _, err := svc.AcceptReceipt(ctx, entryID, "collaborator-actor@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: false}); err == nil {
		t.Fatal("expected explicit confirmation to be required")
	}
	if _, err := svc.AcceptReceipt(ctx, entryID, "collaborator-actor@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true}); err != nil {
		t.Fatalf("accept receipt: %v", err)
	}
	if _, err := svc.AcceptReceipt(ctx, entryID, "collaborator-actor@example.com", receiptAcceptingPartyCollaborator, AcceptReceiptRequest{Confirm: true}); err != ErrReceiptAlreadyAccepted {
		t.Fatalf("expected second acceptance to be rejected, got %v", err)
	}
}

func TestFinalSettlementReceiptPostconditionRejectsMissingCreditReceipt(t *testing.T) {
	database := newFinalSettlementTestDB(t)
	fixture := seedFinalSettlementJourney(t, database)
	now := time.Now().UTC()
	entry := &db.LedgerEntry{
		BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:       defaultTenantID,
		PersonID:       fixture.globalPersonID,
		CollaboratorID: fixture.collaboratorID,
		ValueUnitID:    fixture.brlValueUnitID,
		EntryType:      ledgerEntryTypeFinalSettlement,
		Direction:      "CREDIT",
		Amount:         10,
		EffectiveDate:  now,
		SourceType:     ledgerSourceSettlement,
		SourceID:       ids.New(),
		Active:         true,
		CorrectionType: "ORIGINAL",
	}
	if err := database.Session(&gorm.Session{SkipHooks: true}).Create(entry).Error; err != nil {
		t.Fatalf("seed final settlement credit without receipt hook: %v", err)
	}
	if err := ensureFinalSettlementReceiptObligations(database, entry); err != ErrFinalSettlementReceiptObligationMissing {
		t.Fatalf("expected missing final settlement receipt obligation, got %v", err)
	}
}

type finalSettlementFixture struct {
	globalPersonID  string
	collaboratorID  string
	brlValueUnitID  string
	goldValueUnitID string
}

func newFinalSettlementTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "final-settlement.db"))
	if err != nil {
		t.Fatalf("open final settlement database: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate final settlement database: %v", err)
	}
	return database
}

func seedFinalSettlementJourney(t *testing.T, database *gorm.DB) finalSettlementFixture {
	t.Helper()
	now := time.Now().UTC()
	if err := database.Create(&db.Tenant{BaseModel: db.BaseModel{ID: defaultTenantID, CreatedAt: now, UpdatedAt: now}, Code: "DEFAULT", Name: "Default Tenant", Active: true}).Error; err != nil {
		t.Fatalf("create Tenant: %v", err)
	}
	refs := []db.ReferenceData{
		{BaseModel: db.BaseModel{ID: "fs-person-active", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "person_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-membership-active", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "membership_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-collaborator-active", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "collaborator_status", Code: "ACTIVE", Label: "Active", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-payment-daily", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "payment_method", Code: "DAILY_BRL", Label: "Daily BRL", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-sector", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "sector", Code: "FS", Label: "Final Settlement", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-location", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "location", Code: "FS", Label: "Final Settlement", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-task", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "task", Code: "FS", Label: "Final Settlement", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-brl", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "value_unit", Code: "BRL", Label: "Brazilian Real", Active: true},
		{BaseModel: db.BaseModel{ID: "fs-gold", CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, Type: "value_unit", Code: "GOLD_GRAM", Label: "Gold Gram", Active: true},
	}
	if err := database.Create(&refs).Error; err != nil {
		t.Fatalf("create final settlement reference data: %v", err)
	}
	global := db.GlobalPerson{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, FirstName: "Final", LastName: "Settlement", Nickname: "Final", CPF: "39053344705", RG: "FS-RG", Cellular: "11999990001", Email: "final-settlement@example.com", Country: "Brasil", ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true}
	if err := database.Create(&global).Error; err != nil {
		t.Fatalf("create Global Person: %v", err)
	}
	legacy := db.Person{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, FirstName: "Final", LastName: "Settlement", Nickname: "Final", CPF: global.CPF, RG: "FS-LEGACY-RG", Cellular: "11999990002", Email: "final-settlement-legacy@example.com", Country: "Brasil", StatusID: "fs-person-active", ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true}
	if err := database.Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy Person: %v", err)
	}
	membership := db.PersonTenantMembership{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, PersonID: global.ID, StatusID: "fs-membership-active", LegacyPersonID: &legacy.ID}
	if err := database.Create(&membership).Error; err != nil {
		t.Fatalf("create Person-Tenant Membership: %v", err)
	}
	daily := 100.0
	collaborator := db.CollaboratorJourney{
		BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, MembershipID: &membership.ID, PersonID: legacy.ID,
		JourneyStartDate: now, DefaultEndDate: now.AddDate(0, 0, 90), ProjectedEndDate: now.AddDate(0, 0, 90), PaymentMethodID: "fs-payment-daily", PaymentValue: daily, DailyBRLAmount: &daily,
		SectorID: "fs-sector", LocationID: "fs-location", TaskID: "fs-task", StatusID: "fs-collaborator-active",
	}
	if err := database.Create(&collaborator).Error; err != nil {
		t.Fatalf("create Collaborator Journey: %v", err)
	}
	return finalSettlementFixture{globalPersonID: global.ID, collaboratorID: collaborator.ID, brlValueUnitID: "fs-brl", goldValueUnitID: "fs-gold"}
}

func seedFinalSettlementBalance(t *testing.T, database *gorm.DB, fixture finalSettlementFixture, valueUnitID, valueUnitCode, direction string, amount float64) {
	t.Helper()
	now := time.Now().UTC()
	entry := db.LedgerEntry{
		BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, PersonID: fixture.globalPersonID, CollaboratorID: fixture.collaboratorID,
		ValueUnitID: valueUnitID, EntryType: "TEST_BALANCE", Direction: direction, Amount: amount, EffectiveDate: now, SourceType: "TEST", SourceID: ids.New(), Description: valueUnitCode + " test balance", Active: true, CorrectionType: "ORIGINAL",
	}
	// Balance seeds intentionally bypass the ordinary DEBIT receipt hook: these
	// tests isolate final-settlement receipt obligations rather than historical
	// expense receipt behavior.
	if err := database.Session(&gorm.Session{SkipHooks: true}).Create(&entry).Error; err != nil {
		t.Fatalf("seed %s %s balance %.8f: %v", valueUnitCode, direction, amount, err)
	}
}

func validFinalSettlementRequest(requestID string) FinalSettlementRequest {
	return FinalSettlementRequest{
		CorrectionReasonRequest: CorrectionReasonRequest{ReasonCode: "FINAL_JOURNEY_SETTLEMENT", ReasonText: "Settle the final Journey balance"},
		RequestID:               requestID,
		EffectiveDate:           "2026-08-24",
		Notes:                   "Final Journey settlement",
	}
}

func containsBlockingReason(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
