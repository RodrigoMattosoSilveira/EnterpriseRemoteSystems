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
