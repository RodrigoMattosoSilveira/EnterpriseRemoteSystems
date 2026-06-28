package currentaccounts

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	CountDebitLedgerEntries(ctx context.Context) (int64, error)
	CountDebitLedgerEntriesWithReceipts(ctx context.Context) (int64, error)
	ListDebitLedgerEntriesMissingReceipts(ctx context.Context) ([]db.LedgerEntry, error)
	CreateLedgerReceipts(ctx context.Context, receipts ...*db.LedgerReceipt) error
	ListOutstandingReceipts(ctx context.Context, filter normalizedReceiptListFilter) ([]db.LedgerReceipt, int64, error)
	CountOutstandingReceiptsByStatus(ctx context.Context, filter normalizedReceiptListFilter) (map[string]int64, error)
	FindReceiptByLedgerEntryID(ctx context.Context, ledgerEntryID string) (*db.LedgerReceipt, error)
	MarkReceiptPrinted(ctx context.Context, receiptID, printedBy string, printedAt time.Time) (*db.LedgerReceipt, error)
	MarkReceiptReturned(ctx context.Context, receiptID, receivedBy, signedDocumentRef, notes string, returnedAt time.Time) (*db.LedgerReceipt, error)
	ListEntries(ctx context.Context, collaboratorID string, filter normalizedLedgerEntryListFilter) ([]db.LedgerEntry, int64, error)
	ListBalances(ctx context.Context, collaboratorID string) ([]BalanceRow, error)
	FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error)
	FindCollaboratorTenantID(ctx context.Context, collaboratorID string) (string, error)
	ListRecentDailyGoldProduction(ctx context.Context, locationID string, limit int) ([]DailyGoldProductionRow, error)
	CountPendingAccrualItems(ctx context.Context, collaboratorID string) (int64, error)
	CountOutstandingReceiptsForCollaborator(ctx context.Context, collaboratorID string) (int64, error)
	FindEntryByID(ctx context.Context, entryID string) (*db.LedgerEntry, error)
	FindLedgerEntryTenantID(ctx context.Context, entryID string) (string, error)
	FindValueUnitByID(ctx context.Context, valueUnitID string) (*db.ReferenceData, error)
	HasReversal(ctx context.Context, entryID string) (bool, error)
	CreateCorrectionEntries(ctx context.Context, entries ...*db.LedgerEntry) error
	FindValueUnitByCode(ctx context.Context, code string) (*db.ReferenceData, error)
	FindSettlementByRequestID(ctx context.Context, collaboratorID, requestID string) (*db.JourneySettlement, error)
	FindLedgerEntryBySource(ctx context.Context, sourceType, sourceID string) (*db.LedgerEntry, error)
	FindLedgerEntriesBySource(ctx context.Context, sourceType, sourceID string) ([]db.LedgerEntry, error)
	CreateSettlementWithEntries(ctx context.Context, settlement *db.JourneySettlement, entries ...*db.LedgerEntry) error
	FindCollaboratorStatusByCode(ctx context.Context, code string) (*db.ReferenceData, error)
	CloseJourneyWithSettlement(ctx context.Context, collaboratorID, finishedStatusID string, closedAt time.Time, settlement *db.JourneySettlement, entries ...*db.LedgerEntry) error
	GetTenantSetting(ctx context.Context, tenantID, key string) (string, error)
	GetTenantSettingRow(ctx context.Context, tenantID, key string) (*db.TenantSetting, error)
	UpsertTenantSetting(ctx context.Context, tenantID, key, value, description, updatedBy string) (*db.TenantSetting, error)
}

type normalizedReceiptListFilter struct {
	Status             string
	CollaboratorSearch string
	SourceType         string
	Page               int
	PageSize           int
}

type normalizedLedgerEntryListFilter struct {
	ValueUnitID         string
	EntryType           string
	Direction           string
	SourceType          string
	OutstandingReceipts bool
	DateFrom            *time.Time
	DateTo              *time.Time
	IncludeInactive     bool
	Page                int
	PageSize            int
}

type BalanceRow struct {
	CollaboratorID    string
	CollaboratorLabel string
	ValueUnitID       string
	ValueUnitCode     string
	ValueUnitLabel    string
	Balance           float64
}

type DailyGoldProductionRow struct {
	ProductionDate time.Time
	GoldGrams      float64
}
