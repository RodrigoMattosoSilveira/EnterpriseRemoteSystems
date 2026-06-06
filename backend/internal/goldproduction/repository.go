package goldproduction

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedGoldProductionEntryListFilter) ([]db.GoldProductionEntry, int64, error)
	Create(ctx context.Context, entry *db.GoldProductionEntry) error
	Update(ctx context.Context, entry *db.GoldProductionEntry) error
	FindByID(ctx context.Context, id string) (*db.GoldProductionEntry, error)
	FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error)
	ExistsActiveLocation(ctx context.Context, id string) (bool, error)
	ExistsActiveEntryForPeriodLocationDate(ctx context.Context, workPeriodID string, locationID string, productionDate time.Time, excludeID string) (bool, error)
}

type normalizedGoldProductionEntryListFilter struct {
	LocationID      string
	DateFrom        *time.Time
	DateTo          *time.Time
	IncludeInactive bool
	Page            int
	PageSize        int
}
