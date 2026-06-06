package accruals

import "context"

type Service interface {
	ListRunsByWorkPeriod(ctx context.Context, workPeriodID string, filter AccrualRunListFilter) (*AccrualRunListResult, error)
	CreateRun(ctx context.Context, workPeriodID string, req CreateAccrualRunRequest, actorUserID string) (*AccrualRunDTO, error)
	GetRunByID(ctx context.Context, id string) (*AccrualRunDTO, error)
	RecalculateRun(ctx context.Context, id string, actorUserID string) (*AccrualRunDTO, error)
	ListItemsByRun(ctx context.Context, runID string, filter AccrualItemListFilter) (*AccrualItemListResult, error)
}
