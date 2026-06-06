package workperiods

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, filter normalizedWorkPeriodListFilter) ([]db.WorkPeriod, int64, error)
	Create(ctx context.Context, workPeriod *db.WorkPeriod) error
	Update(ctx context.Context, workPeriod *db.WorkPeriod) error
	FindByID(ctx context.Context, id string) (*db.WorkPeriod, error)
}

type normalizedWorkPeriodListFilter struct {
	DateFrom *time.Time
	DateTo   *time.Time
	Status   string
	Page     int
	PageSize int
}
