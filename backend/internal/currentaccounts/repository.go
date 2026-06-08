package currentaccounts

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListEntries(ctx context.Context, collaboratorID string, filter normalizedLedgerEntryListFilter) ([]db.LedgerEntry, int64, error)
	ListBalances(ctx context.Context, collaboratorID string) ([]BalanceRow, error)
	FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error)
	CountPendingAccrualItems(ctx context.Context, collaboratorID string) (int64, error)
	FindEntryByID(ctx context.Context, entryID string) (*db.LedgerEntry, error)
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
}

type normalizedLedgerEntryListFilter struct {
	ValueUnitID     string
	EntryType       string
	SourceType      string
	DateFrom        *time.Time
	DateTo          *time.Time
	IncludeInactive bool
	Page            int
	PageSize        int
}

type BalanceRow struct {
	CollaboratorID    string
	CollaboratorLabel string
	ValueUnitID       string
	ValueUnitCode     string
	ValueUnitLabel    string
	Balance           float64
}
