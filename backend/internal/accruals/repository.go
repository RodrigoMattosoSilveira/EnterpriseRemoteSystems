package accruals

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListRunsByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedAccrualRunListFilter) ([]db.AccrualRun, int64, error)
	CreateRun(ctx context.Context, run *db.AccrualRun) error
	UpdateRun(ctx context.Context, run *db.AccrualRun) error
	FindRunByID(ctx context.Context, id string) (*db.AccrualRun, error)
	FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error)
	ListItemsByRun(ctx context.Context, runID string, filter normalizedAccrualItemListFilter) ([]db.AccrualItem, int64, error)
	ReplaceItemsForRun(ctx context.Context, run *db.AccrualRun, items []db.AccrualItem) error
	SummariesForRuns(ctx context.Context, runIDs []string) (map[string]AccrualSummaryDTO, error)
	ListAssignmentsForCalculation(ctx context.Context, workPeriodID string) ([]db.WorkPeriodAssignment, error)
	FindGoldProduction(ctx context.Context, workPeriodID string, locationID string) (*db.GoldProductionEntry, error)
}

type normalizedAccrualRunListFilter struct {
	Status   string
	Page     int
	PageSize int
}
type normalizedAccrualItemListFilter struct {
	Status         string
	PendingReason  string
	CollaboratorID string
	Page           int
	PageSize       int
}
