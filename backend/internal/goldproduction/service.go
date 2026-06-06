package goldproduction

import "context"

type Service interface {
	ListByWorkPeriod(ctx context.Context, workPeriodID string, filter GoldProductionEntryListFilter) (*GoldProductionEntryListResult, error)
	Create(ctx context.Context, workPeriodID string, req CreateGoldProductionEntryRequest, actorUserID string) (*GoldProductionEntryDTO, error)
	GetByID(ctx context.Context, id string) (*GoldProductionEntryDTO, error)
	Update(ctx context.Context, id string, req UpdateGoldProductionEntryRequest, actorUserID string) (*GoldProductionEntryDTO, error)
	Deactivate(ctx context.Context, id string, actorUserID string) (*GoldProductionEntryDTO, error)
	Delete(ctx context.Context, id string, actorUserID string) error
}
